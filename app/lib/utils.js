/**
 * 工具函數模組
 */

/**
 * 驗證必要的環境變數
 * @param {Array<string>} requiredVars - 必要的環境變數名稱
 * @throws {Error} 如果缺少必要的環境變數
 */
function validateEnvironmentVars(requiredVars) {
	const missing = requiredVars.filter(varName => !process.env[varName]);

	if (missing.length > 0) {
		throw new Error(`缺少必要的環境變數: ${missing.join(', ')}\n請檢查 .env 檔案`);
	}
}

/**
 * 延遲執行（用於錯誤重試）
 * @param {number} ms - 延遲毫秒數
 * @returns {Promise} Promise 物件
 */
function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 格式化時間
 * @param {number} seconds - 秒數
 * @returns {string} 格式化的時間字串
 */
function formatTime(seconds) {
	if (seconds < 60) {
		return `${Math.round(seconds)} 秒`;
	} else if (seconds < 3600) {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.round(seconds % 60);
		return `${minutes} 分 ${secs} 秒`;
	} else {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${hours} 小時 ${minutes} 分`;
	}
}

/**
 * 計算預估剩餘時間
 * @param {number} completed - 已完成數量
 * @param {number} total - 總數量
 * @param {number} elapsedMs - 已耗時（毫秒）
 * @returns {string} 預估剩餘時間
 */
function estimateTimeRemaining(completed, total, elapsedMs) {
	if (completed === 0) {
		return '計算中...';
	}

	const avgTimePerItem = elapsedMs / completed;
	const remaining = total - completed;
	const estimatedMs = remaining * avgTimePerItem;

	return formatTime(estimatedMs / 1000);
}

/**
 * 顯示進度條
 * @param {number} completed - 已完成數量
 * @param {number} total - 總數量
 * @param {string} description - 描述文字
 */
function showProgress(completed, total, description = '') {
	const percentage = total > 0 ? (completed / total * 100).toFixed(1) : 0;
	const barLength = 30;
	const filledLength = Math.round(barLength * completed / total);
	const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

	process.stdout.write(`\r📊 進度: [${bar}] ${percentage}% (${completed}/${total}) ${description}`);

	if (completed === total) {
		process.stdout.write('\n');
	}
}

/**
 * 安全的 JSON 解析
 * @param {string} jsonString - JSON 字串
 * @param {any} defaultValue - 預設值
 * @returns {any} 解析結果或預設值
 */
function safeJSONParse(jsonString, defaultValue = null) {
	try {
		return JSON.parse(jsonString);
	} catch (error) {
		return defaultValue;
	}
}

/**
 * 清理敏感資訊（用於日誌）
 * @param {string} text - 原始文字
 * @returns {string} 清理後的文字
 */
function sanitizeForLog(text) {
	return text
		.replace(/(:\/\/)[^:]+:[^@]+(@)/g, '$1***:***$2')  // 隱藏用戶名和密碼
		.replace(/(Bearer\s+)[^\s]+/g, '$1***');          // 隱藏 token
}

/**
 * 重試執行函數
 * @param {Function} fn - 要執行的函數
 * @param {number} maxRetries - 最大重試次數
 * @param {number} delayMs - 重試間隔（毫秒）
 * @returns {Promise} 執行結果
 */
async function retry(fn, maxRetries = 3, delayMs = 1000) {
	let lastError;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			if (attempt === maxRetries) {
				break;
			}

			console.warn(`⚠️ 第 ${attempt} 次嘗試失敗，${delayMs}ms 後重試: ${error.message}`);
			await delay(delayMs);
		}
	}

	throw lastError;
}

/**
 * 檢查字串是否為有效的 repository 名稱
 * @param {string} name - repository 名稱
 * @returns {boolean} 是否有效
 */
function isValidRepoName(name) {
	// GitHub repository 名稱規則
	const pattern = /^[a-zA-Z0-9._-]+$/;
	return pattern.test(name) && name.length > 0 && name.length <= 100;
}

/**
 * 取得檔案大小的人類可讀格式
 * @param {number} bytes - 位元組數
 * @returns {string} 格式化的檔案大小
 */
function formatFileSize(bytes) {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 創建日誌記錄器
 * @param {string} prefix - 日誌前綴
 * @returns {object} 日誌記錄器物件
 */
function createLogger(prefix = '') {
	const logPrefix = prefix ? `[${prefix}] ` : '';

	return {
		info: (message) => console.log(`${logPrefix}ℹ️ ${message}`),
		success: (message) => console.log(`${logPrefix}✅ ${message}`),
		warn: (message) => console.warn(`${logPrefix}⚠️ ${message}`),
		error: (message) => console.error(`${logPrefix}❌ ${message}`),
		debug: (message) => {
			if (process.env.DEBUG) {
				console.log(`${logPrefix}🔍 ${message}`);
			}
		}
	};
}

/**
 * 檢查 GitHub API 回應是否包含 rate limit 資訊
 * @param {object} error - 錯誤物件
 * @returns {object|null} rate limit 資訊或 null
 */
function checkRateLimit(error) {
	if (error.response?.status === 403) {
		const headers = error.response.headers;
		const rateLimit = {
			remaining: parseInt(headers['x-ratelimit-remaining'] || '0'),
			limit: parseInt(headers['x-ratelimit-limit'] || '5000'),
			reset: parseInt(headers['x-ratelimit-reset'] || '0')
		};
		
		if (rateLimit.remaining === 0) {
			const resetTime = new Date(rateLimit.reset * 1000);
			const waitTime = Math.max(0, resetTime.getTime() - Date.now());
			
			return {
				...rateLimit,
				resetTime,
				waitTime,
				waitMinutes: Math.ceil(waitTime / 60000)
			};
		}
	}
	
	return null;
}

/**
 * 處理程序中斷信號
 * @param {Function} cleanupFn - 清理函數
 */
function handleProcessExit(cleanupFn) {
	const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
	
	signals.forEach(signal => {
		process.on(signal, async () => {
			console.log(`\n收到 ${signal} 信號，正在清理...`);
			try {
				await cleanupFn();
			} catch (error) {
				console.error('清理過程發生錯誤:', error.message);
			}
			process.exit(0);
		});
	});
}

module.exports = {
	validateEnvironmentVars,
	delay,
	formatTime,
	estimateTimeRemaining,
	showProgress,
	safeJSONParse,
	sanitizeForLog,
	retry,
	isValidRepoName,
	formatFileSize,
	createLogger,
	handleProcessExit,
	checkRateLimit
}; 