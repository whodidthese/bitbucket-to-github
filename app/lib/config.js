/**
 * 系統配置檔案
 * 管理 LFS 檢測的預設設定和系統參數
 */

const CONFIG = {
	// LFS 相關設定
	lfs: {
		// 自動檢測的檔案大小閾值
		defaultThreshold: '50MB',

		// 自動檢測時忽略的檔案/目錄
		autoDetectIgnore: [
			'.git/**',
			'node_modules/**',
			'.DS_Store',
			'Thumbs.db',
			'*.log',
			'.env*'
		],

		// 預設的大檔案類型（用於自動檢測提示）
		commonLargeFileTypes: [
			'**/*.zip',
			'**/*.rar',
			'**/*.7z',
			'**/*.tar.gz',
			'**/*.mp4',
			'**/*.avi',
			'**/*.mov',
			'**/*.mkv',
			'**/*.dat',
			'**/*.db',
			'**/*.sqlite',
			'**/*.bin',
			'**/*.pkg',
			'**/*.dmg',
			'**/*.iso'
		]
	},

	// GitHub API 相關設定
	github: {
		rateLimit: {
			// 遭遇 rate limit 時的等待時間（毫秒）
			waitBuffer: 5000,
			// 檢查間隔
			checkInterval: 1000
		}
	},

	// Git 操作相關設定
	git: {
		// Clone 操作超時時間（毫秒）
		cloneTimeout: 300000, // 5 分鐘

		// LFS push 超時時間（毫秒）
		lfsTimeout: 600000,   // 10 分鐘

		// 批次處理間隔（毫秒）
		batchInterval: 3000   // 3 秒
	},

	  // 系統路徑設定
  paths: {
    lfsSettings: '../../data/lfs-settings.json',
    reposData: '../../data/repos.json',
    tempDir: '../../temp',
    backupDir: '../../data'
  }
};

module.exports = CONFIG;
