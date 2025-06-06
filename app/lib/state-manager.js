const fs = require('fs/promises');
const path = require('path');

class StateManager {
	constructor(dataDir = '../../data') {
		this.dataDir = dataDir;
		this.reposFilePath = path.join(__dirname, dataDir, 'repos.json');
	}

	/**
	 * 讀取 repositories 清單
	 * @returns {Promise<Array>} repositories 陣列
	 */
	async loadRepos() {
		try {
			const data = await fs.readFile(this.reposFilePath, 'utf-8');
			return JSON.parse(data);
		} catch (error) {
			throw new Error(`無法讀取 repos.json: ${error.message}`);
		}
	}

	/**
	 * 儲存 repositories 清單
	 * @param {Array} repos - repositories 陣列
	 */
	async saveRepos(repos) {
		try {
			await fs.writeFile(
				this.reposFilePath,
				JSON.stringify(repos, null, 2),
				'utf-8'
			);
		} catch (error) {
			throw new Error(`無法儲存 repos.json: ${error.message}`);
		}
	}

	/**
	 * 取得需要處理的 repositories（過濾已完成和正在處理的）
	 * @returns {Promise<Array>} 待處理的 repositories
	 */
	async getPendingRepos() {
		const repos = await this.loadRepos();
		return repos.filter(repo =>
			!repo.transferred &&
			!repo.processing &&
			repo.retry_count < 3  // 最多重試 3 次
		);
	}

	/**
	 * 取得需要 LFS 的 repositories
	 * @returns {Promise<Array>} LFS repositories
	 */
	async getLFSRepos() {
		const repos = await this.loadRepos();
		return repos.filter(repo => repo.lfs && !repo.transferred);
	}

	/**
	 * 更新單個 repository 的狀態
	 * @param {string} repoName - repository 名稱
	 * @param {object} updates - 要更新的屬性
	 */
	async updateRepoStatus(repoName, updates) {
		const repos = await this.loadRepos();
		const repoIndex = repos.findIndex(repo => repo.name === repoName);

		if (repoIndex === -1) {
			throw new Error(`找不到 repository: ${repoName}`);
		}

		// 更新屬性
		Object.assign(repos[repoIndex], updates);

		// 如果設置為完成，清除錯誤和處理中狀態
		if (updates.transferred === true) {
			repos[repoIndex].processing = false;
			repos[repoIndex].error = null;
			repos[repoIndex].pushed_at = new Date().toISOString();
		}

		await this.saveRepos(repos);
	}

	/**
	 * 標記 repository 為處理中
	 * @param {string} repoName - repository 名稱
	 */
	async markAsProcessing(repoName) {
		await this.updateRepoStatus(repoName, {
			processing: true,
			error: null
		});
	}

	/**
	 * 標記 repository 為完成
	 * @param {string} repoName - repository 名稱
	 * @param {string} createdAt - GitHub repository 創建時間
	 */
	async markAsCompleted(repoName, createdAt) {
		await this.updateRepoStatus(repoName, {
			transferred: true,
			processing: false,
			error: null,
			created_at: createdAt,
			pushed_at: new Date().toISOString()
		});
	}

	/**
	 * 標記 repository 為失敗
	 * @param {string} repoName - repository 名稱
	 * @param {string} errorMessage - 錯誤訊息
	 */
	async markAsError(repoName, errorMessage) {
		const repos = await this.loadRepos();
		const repo = repos.find(r => r.name === repoName);
		const retryCount = repo ? repo.retry_count + 1 : 1;

		await this.updateRepoStatus(repoName, {
			processing: false,
			error: errorMessage,
			retry_count: retryCount
		});
	}

	/**
	 * 重置處理中的 repositories（用於程序異常中斷後的恢復）
	 */
	async resetProcessingRepos() {
		const repos = await this.loadRepos();
		let resetCount = 0;

		for (const repo of repos) {
			if (repo.processing) {
				repo.processing = false;
				resetCount++;
			}
		}

		if (resetCount > 0) {
			await this.saveRepos(repos);
			console.log(`✅ 重置了 ${resetCount} 個處理中的 repositories`);
		}

		return resetCount;
	}

	/**
	 * 取得遷移統計資訊
	 * @returns {Promise<object>} 統計資訊
	 */
	async getStatistics() {
		const repos = await this.loadRepos();

		const total = repos.length;
		const transferred = repos.filter(r => r.transferred).length;
		const processing = repos.filter(r => r.processing).length;
		const errors = repos.filter(r => r.error && !r.transferred).length;
		const pending = repos.filter(r => !r.transferred && !r.processing && r.retry_count < 3).length;
		const lfsRepos = repos.filter(r => r.lfs).length;
		const lfsTransferred = repos.filter(r => r.lfs && r.transferred).length;

		return {
			total,
			transferred,
			processing,
			errors,
			pending,
			lfsRepos,
			lfsTransferred,
			progress: total > 0 ? ((transferred / total) * 100).toFixed(1) : '0.0'
		};
	}

	/**
	 * 取得失敗的 repositories 清單
	 * @returns {Promise<Array>} 失敗的 repositories
	 */
	async getFailedRepos() {
		const repos = await this.loadRepos();
		return repos.filter(repo => repo.error && !repo.transferred);
	}

	/**
	 * 清除指定 repository 的錯誤狀態（用於重試）
	 * @param {string} repoName - repository 名稱
	 */
	async clearError(repoName) {
		await this.updateRepoStatus(repoName, {
			error: null,
			retry_count: 0
		});
	}

	/**
	 * 備份當前狀態
	 * @returns {Promise<string>} 備份檔案路徑
	 */
	async backup() {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const backupPath = path.join(
			path.dirname(this.reposFilePath),
			`repos-backup-${timestamp}.json`
		);

		const repos = await this.loadRepos();
		await fs.writeFile(backupPath, JSON.stringify(repos, null, 2), 'utf-8');

		return backupPath;
	}
}

module.exports = StateManager; 