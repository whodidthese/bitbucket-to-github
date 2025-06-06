const axios = require('axios');

class GitHubAPI {
	constructor(token, owner) {
		this.token = token;
		this.owner = owner;
		this.api = axios.create({
			baseURL: 'https://api.github.com',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
	}

		/**
	 * 檢查 repository 是否為空（沒有任何檔案）
	 * @param {string} name - repository 名稱
	 * @returns {Promise<boolean>} 是否為空
	 */
	async isRepositoryEmpty(name) {
		try {
			// 嘗試獲取 repository 的內容
			const response = await this.api.get(`/repos/${this.owner}/${name}/contents`);
			// 如果能獲取到內容，代表不為空
			return Array.isArray(response.data) && response.data.length === 0;
		} catch (error) {
			if (error.response?.status === 404) {
				// 404 可能表示 repository 為空或不存在
				return true;
			}
			throw error;
		}
	}

	/**
	 * 創建 GitHub repository（含存在性檢查）
	 * @param {string} name - repository 名稱
	 * @param {boolean} isLFS - 是否需要啟用 LFS
	 * @returns {Promise<object>} 創建結果
	 */
	async createRepository(name, isLFS = false) {
		try {
			// 先檢查 repository 是否已存在
			const exists = await this.repositoryExists(name);
			
			if (exists) {
				console.log(`ℹ️ Repository 已存在，檢查是否為空: ${name}`);
				
				const isEmpty = await this.isRepositoryEmpty(name);
				if (isEmpty) {
					console.log(`✅ Repository 已存在且為空，跳過創建: ${name}`);
					
					// 如果需要 LFS 且 repository 為空，啟用 LFS
					if (isLFS) {
						await this.enableLFS(name);
					}
					
					return {
						success: true,
						skipped: true,
						reason: 'repository_exists_and_empty',
						data: await this.getRepository(name),
						created_at: new Date().toISOString()
					};
				} else {
					throw new Error(`Repository ${name} 已存在且不為空，請手動處理`);
				}
			}

			// Repository 不存在，創建新的
			const response = await this.api.post('/user/repos', {
				name,
				private: true,
				description: `Migrated from Bitbucket: ${name}${isLFS ? ' (with LFS)' : ''}`,
				has_issues: true,
				has_projects: true,
				has_wiki: true,
				auto_init: false
			});

			console.log(`✅ GitHub repository 創建成功: ${name}`);
			
			// 如果需要 LFS，啟用它
			if (isLFS) {
				await this.enableLFS(name);
			}

			return {
				success: true,
				skipped: false,
				data: response.data,
				created_at: new Date().toISOString()
			};
		} catch (error) {
			if (error.response?.status === 422 && error.response?.data?.errors?.some(e => e.message.includes('already exists'))) {
				// Repository 已存在，但上面的檢查可能失敗了
				console.warn(`⚠️ Repository ${name} 已存在，請檢查其狀態`);
				throw new Error(`Repository ${name} 已存在，可能不為空或檢查失敗`);
			}
			
			console.error(`❌ 創建 GitHub repository 失敗: ${name}`);
			throw new Error(`GitHub API Error: ${error.response?.data?.message || error.message}`);
		}
	}

	/**
	 * 啟用 repository 的 Git LFS
	 * @param {string} name - repository 名稱
	 */
	async enableLFS(name) {
		try {
			await this.api.put(`/repos/${this.owner}/${name}/lfs`);
			console.log(`✅ LFS 已啟用: ${name}`);
		} catch (error) {
			console.warn(`⚠️ 啟用 LFS 失敗: ${name} - ${error.response?.data?.message || error.message}`);
			// LFS 啟用失敗不應該阻止整個流程
		}
	}

	/**
	 * 刪除 repository（用於清理失敗的遷移）
	 * @param {string} name - repository 名稱
	 */
	async deleteRepository(name) {
		try {
			await this.api.delete(`/repos/${this.owner}/${name}`);
			console.log(`✅ 已清理 GitHub repository: ${name}`);
		} catch (error) {
			console.warn(`⚠️ 無法清理 GitHub repository: ${name}`);
		}
	}

	/**
	 * 檢查 repository 是否存在
	 * @param {string} name - repository 名稱
	 * @returns {Promise<boolean>} 是否存在
	 */
	async repositoryExists(name) {
		try {
			await this.api.get(`/repos/${this.owner}/${name}`);
			return true;
		} catch (error) {
			if (error.response?.status === 404) {
				return false;
			}
			throw error;
		}
	}

	/**
	 * 獲取 repository 資訊
	 * @param {string} name - repository 名稱
	 * @returns {Promise<object>} repository 資訊
	 */
	async getRepository(name) {
		try {
			const response = await this.api.get(`/repos/${this.owner}/${name}`);
			return response.data;
		} catch (error) {
			throw new Error(`GitHub API Error: ${error.response?.data?.message || error.message}`);
		}
	}
}

module.exports = GitHubAPI; 