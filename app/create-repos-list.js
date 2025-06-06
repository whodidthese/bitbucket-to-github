const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const LFSManager = require('./lib/lfs-manager');
require('dotenv').config();

// ======環境變數=======
const {
	BB_USER, BB_APP_PASSWORD, BB_WORKSPACE,
	// GH_TOKEN, GH_OWNER,
} = process.env;

// 1. 列出 Bitbucket repo + default branch
async function listBBRepos() {
	let url = `https://api.bitbucket.org/2.0/repositories/${BB_WORKSPACE}?pagelen=100`;
	const out = [];
	while (url) {
		const { data } = await axios.get(url, {
			auth: { username: BB_USER, password: BB_APP_PASSWORD },
		});
		data.values.forEach(r => {
			out.push({ name: r.slug, branch: r.mainbranch?.name || 'master' });
		});
		url = data.next;
	}
	return out;
}

(async () => {
	const repos = await listBBRepos();
	
	// 初始化 LFS 管理器並載入設定
	const lfsManager = new LFSManager();
	await lfsManager.loadSettings();
	
	const reposWithStatus = repos.map(r => ({
		name: r.name,
		branch: r.branch,
		transferred: false,
		processing: false,           // 防止同時處理
		created_at: null,            // GitHub repository 創建時間
		pushed_at: null,             // 代碼推送完成時間
		error: null,                 // 錯誤訊息
		retry_count: 0               // 重試次數
	}));
	
	const dataDir = path.join(__dirname, '../data');
	await fs.mkdir(dataDir, { recursive: true });
	await fs.writeFile(
		path.join(dataDir, 'repos.json'),
		JSON.stringify(reposWithStatus, null, 2),
		'utf-8'
	);
	
	// 顯示統計和 LFS 配置資訊
	const configuredLFS = repos.filter(r => lfsManager.hasLFSConfig(r.name));
	console.log(`repositories 總數: ${repos.length}`);
	console.log(`預設 LFS 配置: ${configuredLFS.length} 個`);
	console.log(`混合式檢測: 所有 repositories 都支援自動 LFS 檢測`);
	
	if (configuredLFS.length > 0) {
		console.log('\n預設 LFS 配置的 repositories:');
		configuredLFS.forEach(repo => {
			const mode = lfsManager.getLFSMode(repo.name);
			console.log(`  - ${repo.name} (${mode})`);
		});
	}
})();