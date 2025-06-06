const fs = require('fs/promises');
const path = require('path');
const { execSync } = require('child_process');
const { glob } = require('glob');
const CONFIG = require('./config');

class LFSManager {
	constructor(settingsPath = null) {
		this.settingsPath = settingsPath || path.join(__dirname, CONFIG.paths.lfsSettings);
		this.settings = null;
		this.systemConfig = CONFIG;
	}

	/**
	 * 載入 LFS 用戶設定（可選）
	 */
	async loadSettings() {
		try {
			const settingsData = await fs.readFile(this.settingsPath, 'utf-8');
			this.settings = JSON.parse(settingsData);
			console.log(`✅ 載入 LFS 設定檔案: ${this.settings.repositories ? Object.keys(this.settings.repositories).length : 0} 個 repositories`);
		} catch (error) {
			// 檔案不存在是正常的，使用純自動檢測模式
			this.settings = {
				repositories: {}
			};
			console.log('ℹ️ 未找到 LFS 設定檔案，使用純自動檢測模式');
		}
	}

	/**
	 * 取得系統配置的檔案大小閾值
	 * @returns {string} 檔案大小閾值
	 */
	getDefaultThreshold() {
		return this.systemConfig.lfs.defaultThreshold;
	}

	/**
	 * 檢查 repository 是否有用戶預設的 LFS 配置
	 * @param {string} repoName - repository 名稱
	 * @returns {boolean} 是否有預設配置
	 */
	hasLFSConfig(repoName) {
		if (!this.settings) return false;
		return Boolean(this.settings.repositories[repoName]);
	}

	/**
	 * 取得 repository 的 LFS 用戶配置
	 * @param {string} repoName - repository 名稱
	 * @returns {object|null} LFS 配置
	 */
	getRepoLFSConfig(repoName) {
		if (!this.settings) return null;
		return this.settings.repositories[repoName] || null;
	}

	/**
	 * 混合式檢查：是否需要進行 LFS 處理（配置 + 自動檢測）
	 * @param {string} repoName - repository 名稱
	 * @returns {string} 檢測模式：'configured', 'auto-detect', 'none'
	 */
	getLFSMode(repoName) {
		if (this.hasLFSConfig(repoName)) {
			return 'configured';
		}
		// 混合式方案：沒有配置則使用自動檢測
		return 'auto-detect';
	}

	/**
	 * 將檔案大小字串轉換為位元組
	 * @param {string} sizeStr - 檔案大小字串（如 "50MB"）
	 * @returns {number} 位元組數
	 */
	parseSize(sizeStr) {
		const units = {
			'B': 1,
			'KB': 1024,
			'MB': 1024 * 1024,
			'GB': 1024 * 1024 * 1024
		};

		const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
		if (!match) {
			throw new Error(`無效的檔案大小格式: ${sizeStr}`);
		}

		const [, size, unit] = match;
		return parseFloat(size) * units[unit.toUpperCase()];
	}

	/**
	 * 檢查檔案是否超過大小閾值
	 * @param {string} filePath - 檔案路徑
	 * @param {string} threshold - 大小閾值（如 "50MB"）
	 * @returns {Promise<boolean>} 是否超過閾值
	 */
	async isFileOversized(filePath, threshold = null) {
		try {
			const stats = await fs.stat(filePath);
			const thresholdBytes = this.parseSize(threshold || this.getDefaultThreshold());
			return stats.size > thresholdBytes;
		} catch (error) {
			return false;
		}
	}

	/**
	 * 混合式掃描：根據配置和自動檢測找出需要 LFS 的檔案
	 * @param {string} repoPath - repository 路徑
	 * @param {string} repoName - repository 名稱
	 * @returns {Promise<object>} LFS 檔案資訊和檢測模式
	 */
	async scanLFSFiles(repoPath, repoName) {
		const lfsFiles = new Set();
		const historyFiles = new Set();
		const mode = this.getLFSMode(repoName);
		const repoConfig = this.getRepoLFSConfig(repoName);

		if (mode === 'configured' && repoConfig) {
			// === 配置模式：使用用戶預設配置 ===

			// 處理明確指定的檔案
			if (repoConfig.files) {
				for (const file of repoConfig.files) {
					const fullPath = path.join(repoPath, file);
					try {
						await fs.access(fullPath);
						lfsFiles.add(file);
						console.log(`✅ 配置檔案存在: ${file}`);
					} catch (error) {
						console.warn(`⚠️ 指定的 LFS 檔案不存在: ${file} (可能在歷史中)`);
						// 將不存在的配置檔案標記為歷史檔案
						historyFiles.add(file);
					}
				}
			}

			// 處理檔案模式匹配
			if (repoConfig.patterns) {
				for (const pattern of repoConfig.patterns) {
					try {
						const matches = await glob(pattern, { cwd: repoPath });
						matches.forEach(match => lfsFiles.add(match));
					} catch (error) {
						console.warn(`⚠️ 檔案模式匹配失敗: ${pattern}`);
					}
				}
			}

			// 如果配置中啟用自動檢測
			if (repoConfig.autoDetect) {
				const autoDetected = await this.autoDetectLFSFiles(repoPath);
				autoDetected.forEach(file => lfsFiles.add(file));
			}
		} else {
			// === 自動檢測模式：混合式方案的後備選項 ===
			const autoDetected = await this.autoDetectLFSFiles(repoPath);
			autoDetected.forEach(file => lfsFiles.add(file));
		}

		// === 檢測 Git 歷史中的大檔案 ===
		try {
			const historyLargeFiles = await this.detectLargeFilesInHistory(repoPath);
			historyLargeFiles.forEach(file => historyFiles.add(file));
		} catch (error) {
			console.warn(`⚠️ Git 歷史檢測失敗: ${error.message}`);
		}

		// 合併當前檔案和歷史檔案
		const allLfsFiles = new Set([...lfsFiles, ...historyFiles]);

		return {
			files: Array.from(lfsFiles),           // 當前存在的檔案
			historyFiles: Array.from(historyFiles), // 歷史中的檔案
			allFiles: Array.from(allLfsFiles),     // 所有需要 LFS 的檔案
			mode: mode,
			hasConfig: mode === 'configured'
		};
	}

	/**
	 * 自動檢測需要 LFS 的檔案（根據檔案大小）
	 * @param {string} repoPath - repository 路徑
	 * @returns {Promise<Array>} 需要 LFS 的檔案清單
	 */
	async autoDetectLFSFiles(repoPath) {
		const lfsFiles = [];
		const threshold = this.getDefaultThreshold();

		try {
			// 遞迴掃描所有檔案
			const allFiles = await glob('**/*', {
				cwd: repoPath,
				nodir: true,
				ignore: this.systemConfig.lfs.autoDetectIgnore
			});

			for (const file of allFiles) {
				const fullPath = path.join(repoPath, file);
				if (await this.isFileOversized(fullPath, threshold)) {
					lfsFiles.push(file);
				}
			}

			if (lfsFiles.length > 0) {
				console.log(`🔍 自動檢測到 ${lfsFiles.length} 個大檔案 (>${threshold})`);
			}
		} catch (error) {
			console.warn(`⚠️ 自動檢測 LFS 檔案失敗: ${error.message}`);
		}

		return lfsFiles;
	}

	/**
	 * 檢測 Git 歷史中的大檔案（包括已刪除的檔案）
	 * @param {string} repoPath - repository 路徑
	 * @returns {Promise<Array>} Git 歷史中的大檔案清單
	 */
	async detectLargeFilesInHistory(repoPath) {
		const originalCwd = process.cwd();
		const threshold = this.parseSize(this.getDefaultThreshold());
		const largeFiles = new Set();

		try {
			process.chdir(repoPath);

			console.log(`🔍 掃描 Git 歷史中的大檔案 (>${this.getDefaultThreshold()})...`);

			// 使用 git rev-list 和 git ls-tree 來檢查所有歷史中的檔案
			const allCommits = execSync('git rev-list --all', { encoding: 'utf8' });
			const commits = allCommits.trim().split('\n').filter(commit => commit.trim());

			// 限制檢查的 commits 數量以避免過長的處理時間
			const maxCommits = Math.min(commits.length, 50);
			console.log(`📊 檢查最近 ${maxCommits} 個 commits 中的大檔案...`);

			for (let i = 0; i < maxCommits; i++) {
				const commit = commits[i];
				try {
					// 獲取該 commit 中的所有檔案及其大小
					const lsTreeOutput = execSync(`git ls-tree -r -l ${commit}`, { encoding: 'utf8' });
					const lines = lsTreeOutput.trim().split('\n');

					for (const line of lines) {
						if (!line.trim()) continue;

						// 解析 git ls-tree 的輸出格式
						// 格式: <mode> <type> <hash> <size> <filename>
						const parts = line.trim().split(/\s+/);
						if (parts.length >= 5) {
							const size = parseInt(parts[3], 10);
							const filename = parts.slice(4).join(' ');

							// 檢查檔案大小是否超過閾值
							if (size > threshold) {
								largeFiles.add(filename);
								console.log(`📦 發現歷史大檔案: ${filename} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
							}
						}
					}
				} catch (commitError) {
					// 忽略單個 commit 的錯誤，繼續處理下一個
					continue;
				}
			}

		} catch (error) {
			console.warn(`⚠️ 檢測 Git 歷史大檔案失敗: ${error.message}`);
		} finally {
			process.chdir(originalCwd);
		}

		return Array.from(largeFiles);
	}

	/**
	 * 生成 .gitattributes 檔案內容
	 * @param {Array} lfsFiles - 需要 LFS 的檔案清單
	 * @returns {string} .gitattributes 檔案內容
	 */
	generateGitAttributes(lfsFiles) {
		if (!lfsFiles || lfsFiles.length === 0) {
			return '';
		}

		const lines = [
			'# Git LFS configuration',
			'# Generated by bitbucket-to-github migration tool',
			''
		];

		lfsFiles.forEach(file => {
			// 如果是路徑，直接使用；如果是檔案，需要正確處理
			if (file.includes('/')) {
				lines.push(`${file} filter=lfs diff=lfs merge=lfs -text`);
			} else {
				lines.push(`${file} filter=lfs diff=lfs merge=lfs -text`);
			}
		});

		return lines.join('\n') + '\n';
	}

	/**
	 * 設置 repository 的 LFS
	 * @param {string} repoPath - repository 路徑
	 * @param {string} repoName - repository 名稱
	 * @returns {Promise<object>} 設置結果
	 */
	async setupLFS(repoPath, repoName) {
		const originalCwd = process.cwd();

		try {
			process.chdir(repoPath);

			// 載入設定（如果尚未載入）
			if (!this.settings) {
				await this.loadSettings();
			}

			// 混合式掃描 LFS 檔案
			const scanResult = await this.scanLFSFiles(repoPath, repoName);
			const { files: lfsFiles, historyFiles, allFiles, mode, hasConfig } = scanResult;

			if (allFiles.length === 0) {
				console.log(`ℹ️ 沒有找到需要 LFS 的檔案: ${repoName} (${mode} 模式)`);
				return {
					hasLFS: false,
					filesCount: 0,
					files: [],
					mode: mode
				};
			}

			const modeText = hasConfig ? '配置' : '自動檢測';
			console.log(`📦 發現需要 LFS 處理的檔案: ${repoName} (${modeText})`);
			console.log(`   當前檔案: ${lfsFiles.length} 個`);
			console.log(`   歷史檔案: ${historyFiles.length} 個`);
			console.log(`   總計: ${allFiles.length} 個`);
			
			if (lfsFiles.length > 0) {
				console.log(`📄 當前存在的 LFS 檔案:`);
				lfsFiles.forEach(file => console.log(`   - ${file}`));
			}
			
			if (historyFiles.length > 0) {
				console.log(`📋 Git 歷史中的大檔案:`);
				historyFiles.forEach(file => console.log(`   - ${file} (歷史)`));
			}

			// 初始化 LFS
			try {
				execSync('git lfs install', { stdio: 'inherit' });
			} catch (error) {
				console.warn('⚠️ Git LFS install 失敗，可能已安裝');
			}

			// 生成並寫入 .gitattributes（包含所有需要 LFS 的檔案）
			const gitAttributesContent = this.generateGitAttributes(allFiles);
			const gitAttributesPath = path.join(repoPath, '.gitattributes');
			await fs.writeFile(gitAttributesPath, gitAttributesContent, 'utf-8');
			console.log(`✅ 生成 .gitattributes 檔案: ${repoName} (包含 ${allFiles.length} 個檔案規則)`);

			// 追蹤所有 LFS 檔案
			for (const file of allFiles) {
				try {
					execSync(`git lfs track "${file}"`, { stdio: 'inherit' });
				} catch (error) {
					console.warn(`⚠️ 追蹤 LFS 檔案失敗: ${file}`);
				}
			}

			// 添加 .gitattributes 到 git 並提交，確保 Git 知道 LFS 規則
			try {
				execSync('git add .gitattributes', { stdio: 'inherit' });
				// 提交 .gitattributes 以確保 Git 應用新的 LFS 規則
				execSync('git commit -m "Add .gitattributes for LFS"', { stdio: 'inherit' });
				console.log(`✅ 已提交 .gitattributes: ${repoName}`);
			} catch (error) {
				console.warn('⚠️ 提交 .gitattributes 失敗，嘗試重置並重新提交');
				try {
					// 如果提交失敗（可能因為沒有變更），強制重置並重新配置
					execSync('git reset --soft HEAD', { stdio: 'ignore' });
					execSync('git add .gitattributes', { stdio: 'inherit' });
				} catch (resetError) {
					console.warn('⚠️ .gitattributes 處理失敗');
				}
			}

			// 重要：重新處理已存在的大檔案，確保它們被轉換為 LFS 指針
			console.log(`🔄 處理大檔案以啟用 LFS: ${repoName}`);
			
			// 策略決定：如果有歷史檔案，使用基於大小的 migrate；否則使用檔案列表 migrate
			if (allFiles.length > 0) {
				try {
					if (historyFiles.length > 0) {
						// === 策略 A：有歷史檔案，使用基於檔案大小的全面遷移 ===
						console.log(`🚀 檢測到歷史大檔案，使用基於大小的 LFS 遷移策略`);
						
						const thresholdMB = parseInt(this.getDefaultThreshold().replace('MB', ''));
						console.log(`🔧 遷移所有 >${thresholdMB}MB 的檔案到 LFS`);
						
						// 使用檔案大小閾值來遷移，這會處理所有歷史中的大檔案
						execSync(`git lfs migrate import --above=${thresholdMB}MB --everything --yes`, { 
							stdio: 'inherit' 
						});
						
						console.log(`✅ 基於大小的 Git LFS migrate 完成`);
						
					} else if (lfsFiles.length > 0) {
						// === 策略 B：只有當前檔案，使用明確檔案列表遷移 ===
						console.log(`🚀 使用檔案列表進行 LFS 遷移`);
						
						// 使用明確的檔案列表進行遷移
						execSync(`git lfs migrate import --include="${lfsFiles.join(',')}" --everything --yes`, { 
							stdio: 'inherit' 
						});
						
						console.log(`✅ 基於檔案列表的 Git LFS migrate 完成`);
					}
					
					// 檢查遷移結果
					const lfsStatus = execSync('git lfs ls-files', { encoding: 'utf8' });
					const lfsFilesList = lfsStatus.trim().split('\n').filter(line => line.trim());
					
					if (lfsFilesList.length > 0) {
						console.log(`📋 遷移後的 LFS 檔案 (${lfsFilesList.length} 個):`);
						lfsFilesList.forEach(file => {
							const fileName = file.split(' - ')[1] || file;
							console.log(`   ✅ ${fileName}`);
						});
						
						console.log(`🎉 成功遷移 ${lfsFilesList.length} 個檔案到 LFS`);
						return {
							hasLFS: true,
							filesCount: lfsFilesList.length,
							files: lfsFilesList.map(file => file.split(' - ')[1] || file),
							mode: mode
						};
					} else {
						console.warn(`⚠️ migrate 執行完成但沒有檔案在 LFS 中，嘗試手動處理`);
					}
					
				} catch (migrateError) {
					console.warn(`⚠️ Git LFS migrate 失敗: ${migrateError.message}`);
					console.log(`🔄 嘗試手動處理當前檔案...`);
				}
			}
			
			// 如果 migrate 失敗，回到手動處理
			for (const file of lfsFiles) {
				try {
					// 檢查檔案是否存在
					const filePath = path.join(repoPath, file);
					await fs.access(filePath);
					
					console.log(`處理檔案: ${file}`);
					
					// 先從 Git 暫存區移除檔案（保留工作目錄中的檔案）
					execSync(`git rm --cached "${file}"`, { stdio: 'inherit' });
					
					// 刷新 Git LFS 狀態，確保 Git 重新檢查 .gitattributes
					execSync('git lfs track', { stdio: 'inherit' });
					
					// 重新添加檔案，這次會被 LFS 處理
					execSync(`git add "${file}"`, { stdio: 'inherit' });
					
					// 驗證檔案是否真的被轉換為 LFS 指針
					try {
						const lfsStatus = execSync('git lfs ls-files', { encoding: 'utf8' });
						if (lfsStatus.includes(file)) {
							console.log(`✅ 已將 ${file} 轉換為 LFS 指針`);
						} else {
							console.warn(`⚠️ 檔案 ${file} 未正確轉換為 LFS，嘗試強制轉換`);
							
							// 如果普通方法失敗，嘗試更激進的方法
							try {
								// 先移除檔案的所有 Git 追蹤
								execSync(`git rm --cached "${file}"`, { stdio: 'ignore' });
								
								// 確保 .gitattributes 生效
								execSync('git add .gitattributes', { stdio: 'inherit' });
								
								// 強制清理 Git 狀態
								execSync('git lfs track', { stdio: 'inherit' });
								
								// 重新添加檔案，並強制使用 LFS
								execSync(`git add "${file}"`, { stdio: 'inherit' });
								
								// 再次檢查
								const retryLfsStatus = execSync('git lfs ls-files', { encoding: 'utf8' });
								if (retryLfsStatus.includes(file)) {
									console.log(`✅ 強制轉換成功: ${file}`);
								} else {
									console.error(`❌ 無法將 ${file} 轉換為 LFS 指針，這個檔案可能會導致推送失敗`);
								}
							} catch (forceError) {
								console.error(`❌ 強制轉換失敗: ${file} - ${forceError.message}`);
							}
						}
					} catch (statusError) {
						console.warn(`⚠️ 無法檢查 LFS 狀態: ${file}`);
					}
					
					// 額外檢查：確認檔案在暫存區的大小
					try {
						const gitStatus = execSync(`git ls-files -s "${file}"`, { encoding: 'utf8' });
						console.log(`📊 Git 暫存區狀態: ${file} - ${gitStatus.trim()}`);
					} catch (sizeError) {
						console.warn(`⚠️ 無法檢查檔案暫存區狀態: ${file}`);
					}
					
				} catch (error) {
					console.warn(`⚠️ 重新處理 LFS 檔案失敗: ${file} - ${error.message}`);
				}
			}

			// 返回最終結果
			const finalLfsStatus = execSync('git lfs ls-files', { encoding: 'utf8' });
			const finalLfsFiles = finalLfsStatus.trim().split('\n')
				.filter(line => line.trim())
				.map(file => file.split(' - ')[1] || file);

			return {
				hasLFS: finalLfsFiles.length > 0,
				filesCount: finalLfsFiles.length,
				files: finalLfsFiles,
				currentFiles: lfsFiles,       // 當前存在的檔案
				historyFiles: historyFiles,   // 歷史中的檔案
				mode: mode
			};

		} catch (error) {
			throw new Error(`LFS 設置失敗 ${repoName}: ${error.message}`);
		} finally {
			process.chdir(originalCwd);
		}
	}

	/**
	 * 檢查現有的 LFS 檔案
	 * @param {string} repoPath - repository 路徑
	 * @returns {Promise<Array>} 現有的 LFS 檔案清單
	 */
	async getExistingLFSFiles(repoPath) {
		const originalCwd = process.cwd();

		try {
			process.chdir(repoPath);

			const lfsFiles = execSync('git lfs ls-files', { encoding: 'utf8' });
			return lfsFiles.trim().split('\n').filter(line => line.trim());
		} catch (error) {
			// 沒有 LFS 檔案或 LFS 未初始化
			return [];
		} finally {
			process.chdir(originalCwd);
		}
	}
}

module.exports = LFSManager;