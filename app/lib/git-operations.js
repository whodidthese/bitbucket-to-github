const { execSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const LFSManager = require('./lfs-manager');

class GitOperations {
	constructor(tempDir, bbUser, bbPassword, bbWorkspace, ghToken, ghOwner) {
		this.tempDir = tempDir;
		this.bbUser = bbUser;
		this.bbPassword = bbPassword;
		this.bbWorkspace = bbWorkspace;
		this.ghToken = ghToken;
		this.ghOwner = ghOwner;
		this.lfsManager = new LFSManager();
	}

	/**
	 * 確保暫存目錄存在
	 */
	async ensureTempDir() {
		try {
			await fs.mkdir(this.tempDir, { recursive: true });
		} catch (error) {
			throw new Error(`無法創建暫存目錄: ${error.message}`);
		}
	}

	/**
	 * 取得 repository 的本地路徑
	 * @param {string} repoName - repository 名稱
	 * @returns {string} 本地路徑
	 */
	getRepoPath(repoName) {
		return path.join(this.tempDir, repoName);
	}

	/**
	 * Clone Bitbucket repository
	 * @param {string} repoName - repository 名稱
	 * @param {string} branch - 分支名稱
	 * @returns {Promise<string>} 本地路徑
	 */
	async cloneBitbucketRepo(repoName, branch) {
		const repoPath = this.getRepoPath(repoName);
		const cloneUrl = `https://${this.bbUser}:${this.bbPassword}@bitbucket.org/${this.bbWorkspace}/${repoName}.git`;

		try {
			console.log(`📥 Clone Bitbucket repository: ${repoName}`);

			// 先清理可能存在的目錄
			await this.cleanupRepo(repoName);

			// Clone repository（只抓指定分支）
			execSync(`git clone --single-branch --branch ${branch} ${cloneUrl} ${repoPath}`, {
				stdio: 'inherit',
				cwd: this.tempDir
			});

			console.log(`✅ Clone 完成: ${repoName}`);
			return repoPath;
		} catch (error) {
			throw new Error(`Clone 失敗 ${repoName}: ${error.message}`);
		}
	}

	/**
	 * 檢查並處理 LFS 檔案
	 * @param {string} repoName - repository 名稱
	 * @returns {Promise<object>} LFS 處理結果
	 */
	async handleLFS(repoName) {
		const repoPath = this.getRepoPath(repoName);
		
		try {
			// 載入 LFS 設定
			await this.lfsManager.loadSettings();
			
			// 混合式檢查：優先配置，後備自動檢測
			const lfsMode = this.lfsManager.getLFSMode(repoName);
			
			// 先檢查是否有現有的 LFS 檔案
			const existingLFS = await this.lfsManager.getExistingLFSFiles(repoPath);
			if (existingLFS.length > 0) {
				console.log(`📦 發現現有 LFS 檔案: ${repoName} (${existingLFS.length} 個檔案)`);
				
				// 獲取現有 LFS 數據
				const originalCwd = process.cwd();
				try {
					process.chdir(repoPath);
					console.log(`📦 獲取現有 LFS 檔案數據: ${repoName}`);
					execSync('git lfs fetch --all', { stdio: 'inherit' });
				} catch (error) {
					console.warn(`⚠️ 獲取 LFS 數據失敗: ${error.message}`);
				} finally {
					process.chdir(originalCwd);
				}
				
				return {
					hasLFS: true,
					filesCount: existingLFS.length,
					files: existingLFS,
					mode: 'existing',
					source: 'existing'
				};
			}

			// 執行混合式 LFS 設置（配置優先，自動檢測後備）
			const lfsResult = await this.lfsManager.setupLFS(repoPath, repoName);
			
			if (lfsResult.hasLFS) {
				// 如果設置了新的 LFS 檔案，獲取 LFS 數據
				const originalCwd = process.cwd();
				try {
					process.chdir(repoPath);
					console.log(`📦 獲取 LFS 檔案數據: ${repoName}`);
					execSync('git lfs fetch --all', { stdio: 'inherit' });
				} catch (error) {
					console.warn(`⚠️ 獲取 LFS 數據失敗: ${error.message}`);
				} finally {
					process.chdir(originalCwd);
				}
			}

			return {
				...lfsResult,
				source: lfsResult.mode === 'configured' ? 'configured' : 'auto-detected'
			};

		} catch (error) {
			throw new Error(`LFS 處理失敗 ${repoName}: ${error.message}`);
		}
	}

	/**
	 * 添加 GitHub remote 並推送代碼
	 * @param {string} repoName - repository 名稱
	 * @param {string} branch - 分支名稱
	 * @param {object|boolean} lfsInfo - LFS 資訊物件或布林值（向後相容）
	 */
	async pushToGitHub(repoName, branch, lfsInfo = false) {
		const repoPath = this.getRepoPath(repoName);
		const originalCwd = process.cwd();

		try {
			process.chdir(repoPath);

			// 添加 GitHub remote
			const githubUrl = `https://${this.ghToken}@github.com/${this.ghOwner}/${repoName}.git`;
			execSync(`git remote add github ${githubUrl}`, { stdio: 'inherit' });

			console.log(`📤 Push 代碼到 GitHub: ${repoName}`);

			// 推送代碼
			execSync(`git push github ${branch}`, { stdio: 'inherit' });

			// 處理 LFS 檔案推送
			const hasLFS = typeof lfsInfo === 'object' ? lfsInfo.hasLFS : lfsInfo;
			if (hasLFS) {
				const filesCount = typeof lfsInfo === 'object' ? lfsInfo.filesCount : '未知數量';
				console.log(`📦 Push LFS 檔案: ${repoName} (${filesCount} 個檔案)`);
				execSync('git lfs push github --all', { stdio: 'inherit' });
			}

			console.log(`✅ Push 完成: ${repoName}`);
		} catch (error) {
			throw new Error(`Push 失敗 ${repoName}: ${error.message}`);
		} finally {
			process.chdir(originalCwd);
		}
	}

	/**
	 * 清理 repository 的本地檔案
	 * @param {string} repoName - repository 名稱
	 */
	async cleanupRepo(repoName) {
		const repoPath = this.getRepoPath(repoName);
		try {
			await fs.rm(repoPath, { recursive: true, force: true });
		} catch (error) {
			// 忽略清理錯誤
		}
	}

	/**
	 * 清理所有暫存檔案
	 */
	async cleanupAll() {
		try {
			const files = await fs.readdir(this.tempDir);
			for (const file of files) {
				await fs.rm(path.join(this.tempDir, file), { recursive: true, force: true });
			}
			console.log('✅ 暫存檔案清理完成');
		} catch (error) {
			console.warn('⚠️ 暫存檔案清理失敗:', error.message);
		}
	}

	/**
	 * 檢查 Git 和 Git LFS 是否可用
	 */
	static checkDependencies() {
		try {
			// 檢查 Git
			execSync('git --version', { stdio: 'ignore' });

			// 檢查 Git LFS
			execSync('git lfs version', { stdio: 'ignore' });

			return true;
		} catch (error) {
			throw new Error('缺少必要的依賴: 請確保已安裝 Git 和 Git LFS');
		}
	}
}

module.exports = GitOperations; 