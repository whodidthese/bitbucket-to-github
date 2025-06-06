const path = require('path');
require('dotenv').config();

// 引入自定義模組
const GitHubAPI = require('./lib/github-api');
const GitOperations = require('./lib/git-operations');
const StateManager = require('./lib/state-manager');
const {
	validateEnvironmentVars,
	delay,
	formatTime,
	estimateTimeRemaining,
	showProgress,
	createLogger,
	handleProcessExit,
	retry,
	checkRateLimit
} = require('./lib/utils');

class RepositoryMigrator {
	constructor() {
		// 驗證環境變數
		validateEnvironmentVars([
			'GH_TOKEN', 'BB_USER', 'BB_APP_PASSWORD', 'BB_WORKSPACE', 'GH_OWNER'
		]);

		// 初始化組件
		this.githubAPI = new GitHubAPI(process.env.GH_TOKEN, process.env.GH_OWNER);
		this.gitOps = new GitOperations(
			path.join(__dirname, '../temp'),
			process.env.BB_USER,
			process.env.BB_APP_PASSWORD,
			process.env.BB_WORKSPACE,
			process.env.GH_TOKEN,
			process.env.GH_OWNER
		);
		this.stateManager = new StateManager();
		this.logger = createLogger('MIGRATOR');

		// 統計資料
		this.stats = {
			startTime: Date.now(),
			processed: 0,
			succeeded: 0,
			failed: 0
		};

		// 設置程序中斷處理
		handleProcessExit(() => this.cleanup());
	}

	/**
	 * 遷移單個 repository
	 * @param {object} repo - repository 物件
	 */
		async migrateRepository(repo) {
		const { name, branch } = repo;
		let createResult = null;
		
		try {
			this.logger.info(`開始遷移: ${name} (混合式 LFS 檢測)`);
			
			// 1. 標記為處理中
			await this.stateManager.markAsProcessing(name);
			
			// 2. 創建或檢查 GitHub repository（先不啟用 LFS，稍後根據檢測結果決定）
			createResult = await retry(
				() => this.githubAPI.createRepository(name, false),
				3,
				2000
			);
			
			if (createResult.skipped) {
				this.logger.info(`跳過創建步驟: ${name} - ${createResult.reason}`);
			}
			
			// 3. Clone Bitbucket repository
			await this.gitOps.cloneBitbucketRepo(name, branch);
			
			// 4. 混合式 LFS 處理（配置優先，自動檢測後備）
			const lfsInfo = await this.gitOps.handleLFS(name);
			this.logger.info(`LFS 檔案檢測: ${name} - ${lfsInfo.hasLFS ? `有 ${lfsInfo.filesCount} 個檔案` : '無 LFS 檔案'} (${lfsInfo.source})`);
			
			if (lfsInfo.hasLFS && lfsInfo.files.length > 0) {
				this.logger.info(`LFS 檔案清單: ${lfsInfo.files.slice(0, 3).join(', ')}${lfsInfo.files.length > 3 ? '...' : ''}`);
				
				// 如果檢測到 LFS 檔案，啟用 GitHub repository 的 LFS
				try {
					await this.githubAPI.enableLFS(name);
					this.logger.info(`已啟用 GitHub LFS: ${name}`);
				} catch (error) {
					this.logger.warn(`啟用 GitHub LFS 失敗: ${name} - ${error.message}`);
				}
			}
			
			// 5. Push 到 GitHub
			await this.gitOps.pushToGitHub(name, branch, lfsInfo);
			
			// 6. 清理本地檔案
			await this.gitOps.cleanupRepo(name);
			
			// 7. 標記為完成
			await this.stateManager.markAsCompleted(name, createResult.created_at);
			
			this.stats.succeeded++;
			this.logger.success(`遷移完成: ${name}`);
			
		} catch (error) {
			this.stats.failed++;
			this.logger.error(`遷移失敗: ${name} - ${error.message}`);
			
			// 清理失敗的資源
			try {
				// 只有在創建了新 repository 的情況下才刪除
				// 如果是已存在的空 repository，不要刪除
				if (!createResult || !createResult.skipped) {
					await this.githubAPI.deleteRepository(name);
				}
				await this.gitOps.cleanupRepo(name);
			} catch (cleanupError) {
				this.logger.warn(`清理失敗資源時發生錯誤: ${cleanupError.message}`);
			}
			
			// 記錄錯誤狀態
			await this.stateManager.markAsError(name, error.message);
			
			throw error;
		} finally {
			this.stats.processed++;
		}
	}

	/**
	 * 顯示遷移統計
	 */
	async showStatistics() {
		const stats = await this.stateManager.getStatistics();
		const elapsedTime = (Date.now() - this.stats.startTime) / 1000;

		console.log('\n' + '='.repeat(60));
		console.log('📊 遷移統計報告');
		console.log('='.repeat(60));
		console.log(`總 repositories:     ${stats.total}`);
		console.log(`已完成:              ${stats.transferred} (${stats.progress}%)`);
		console.log(`處理中:              ${stats.processing}`);
		console.log(`失敗:                ${stats.errors}`);
		console.log(`待處理:              ${stats.pending}`);
		console.log(`LFS repositories:    ${stats.lfsTransferred}/${stats.lfsRepos}`);
		console.log(`本次處理:            ${this.stats.processed}`);
		console.log(`本次成功:            ${this.stats.succeeded}`);
		console.log(`本次失敗:            ${this.stats.failed}`);
		console.log(`執行時間:            ${formatTime(elapsedTime)}`);

		if (stats.transferred > 0 && stats.pending > 0) {
			const remaining = estimateTimeRemaining(
				stats.transferred,
				stats.total,
				Date.now() - this.stats.startTime
			);
			console.log(`預估剩餘時間:        ${remaining}`);
		}

		console.log('='.repeat(60));
	}

	/**
	 * 顯示失敗的 repositories
	 */
	async showFailedRepos() {
		const failedRepos = await this.stateManager.getFailedRepos();

		if (failedRepos.length > 0) {
			console.log('\n❌ 失敗的 Repositories:');
			failedRepos.forEach((repo, index) => {
				console.log(`${index + 1}. ${repo.name} (重試 ${repo.retry_count} 次)`);
				console.log(`   錯誤: ${repo.error}`);
			});
		}
	}

	/**
	 * 執行遷移
	 */
	async migrate() {
		try {
			this.logger.info('開始 Bitbucket 到 GitHub 遷移程序');

			// 檢查依賴
			GitOperations.checkDependencies();
			this.logger.success('依賴檢查通過');

			// 重置異常中斷的處理狀態
			await this.stateManager.resetProcessingRepos();

			// 備份當前狀態
			const backupPath = await this.stateManager.backup();
			this.logger.info(`狀態已備份至: ${backupPath}`);

			// 準備暫存目錄
			await this.gitOps.ensureTempDir();

			// 取得待處理的 repositories
			const pendingRepos = await this.stateManager.getPendingRepos();

			if (pendingRepos.length === 0) {
				this.logger.info('沒有待處理的 repositories');
				await this.showStatistics();
				return;
			}

			this.logger.info(`找到 ${pendingRepos.length} 個待處理的 repositories`);

			// 顯示初始統計
			await this.showStatistics();

			// 逐一處理每個 repository
			for (let i = 0; i < pendingRepos.length; i++) {
				const repo = pendingRepos[i];
				const progress = `(${i + 1}/${pendingRepos.length})`;

								try {
					showProgress(i, pendingRepos.length, `正在處理: ${repo.name}`);
					await this.migrateRepository(repo);
					
					// 每處理 5 個 repository 後稍作休息
					if ((i + 1) % 5 === 0) {
						this.logger.info('稍作休息 3 秒...');
						await delay(3000);
					}
					
				} catch (error) {
					// 檢查是否是 rate limit 問題
					const rateLimitInfo = checkRateLimit(error);
					
					if (rateLimitInfo) {
						this.logger.warn(`遭遇 GitHub API rate limit，需等待 ${rateLimitInfo.waitMinutes} 分鐘`);
						this.logger.info(`Rate limit 將於 ${rateLimitInfo.resetTime.toLocaleString()} 重置`);
						
						// 等待 rate limit 重置
						if (rateLimitInfo.waitTime > 0) {
							this.logger.info(`等待 ${rateLimitInfo.waitMinutes} 分鐘後繼續...`);
							await delay(rateLimitInfo.waitTime + 5000); // 多等 5 秒確保重置
						}
						
						// 重試當前 repository
						try {
							await this.migrateRepository(repo);
							this.logger.success(`Rate limit 重置後遷移成功: ${repo.name}`);
						} catch (retryError) {
							this.logger.error(`Rate limit 重置後仍然失敗: ${repo.name}`);
							// 標記為處理中以避免狀態混亂
							await this.stateManager.updateRepoStatus(repo.name, { processing: false });
						}
					} else {
						// 個別錯誤已在 migrateRepository 中處理
						// 這裡只需要決定是否繼續
						const shouldContinue = repo.retry_count < 3;
						
						if (!shouldContinue) {
							this.logger.error(`Repository ${repo.name} 已達最大重試次數，跳過`);
						}
					}
					
					// 繼續處理下一個
					continue;
				}
			}

			// 完成進度條
			showProgress(pendingRepos.length, pendingRepos.length, '處理完成');

		} catch (error) {
			this.logger.error(`遷移程序發生嚴重錯誤: ${error.message}`);
			throw error;
		} finally {
			// 顯示最終統計
			await this.showStatistics();
			await this.showFailedRepos();
			await this.cleanup();
		}
	}

	/**
	 * 清理資源
	 */
	async cleanup() {
		this.logger.info('正在清理資源...');
		try {
			await this.gitOps.cleanupAll();
			await this.stateManager.resetProcessingRepos();
		} catch (error) {
			this.logger.warn(`清理過程發生錯誤: ${error.message}`);
		}
	}

	/**
	 * 重試失敗的 repositories
	 */
	async retryFailed() {
		this.logger.info('重試失敗的 repositories');

		const failedRepos = await this.stateManager.getFailedRepos();
		if (failedRepos.length === 0) {
			this.logger.info('沒有失敗的 repositories 需要重試');
			return;
		}

		this.logger.info(`找到 ${failedRepos.length} 個失敗的 repositories`);

		// 清除錯誤狀態
		for (const repo of failedRepos) {
			await this.stateManager.clearError(repo.name);
		}

		// 重新執行遷移
		await this.migrate();
	}
}

// 主程序
async function main() {
	const migrator = new RepositoryMigrator();

	// 檢查命令行參數
	const args = process.argv.slice(2);

	try {
		if (args.includes('--retry')) {
			await migrator.retryFailed();
		} else if (args.includes('--stats')) {
			await migrator.showStatistics();
		} else {
			await migrator.migrate();
		}
	} catch (error) {
		console.error('\n❌ 程序執行失敗:', error.message);
		process.exit(1);
	}
}

// 如果直接執行此檔案
if (require.main === module) {
	main();
}

module.exports = RepositoryMigrator; 