# Bitbucket to GitHub Migration Tool

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

自動化腳本，協助將所有的 Bitbucket Repositories 批量遷移到 GitHub，支援智能 LFS 管理、斷點續傳和錯誤重試。

此專案為 Vibe Coding。由 `cursor` IDE 在 `cloude-4-sonnet` 的 **MAX** 模式下完成 99% 的程式碼。
我因個人需求開發。開發時間約 4~5 小時。包含遷移我在 Bitbucket 上面的 300 多個 Repository。

## 🚀 功能特色

- ✅ **批量遷移**：自動遷移多個 repositories
- ✅ **混合式 LFS 管理**：配置優先 + 自動檢測後備的智能 LFS 處理
- ✅ **歷史檔案檢測**：🆕 自動檢測 Git 歷史中的大檔案，解決已刪除大檔案的推送問題
- ✅ **智能遷移策略**：🆕 根據檔案分佈選擇最佳的 LFS migrate 方法
- ✅ **自動 .gitattributes 生成**：根據檢測結果自動創建和管理 LFS 追蹤規則
- ✅ **全自動化處理**：🆕 無需手動干預，自動回答所有交互式提示
- ✅ **智能檢查**：自動檢查 GitHub repository 是否已存在且為空
- ✅ **Rate Limit 處理**：智能處理 GitHub API 限制，自動等待並重試
- ✅ **斷點續傳**：程序中斷後可從斷點繼續
- ✅ **錯誤重試**：自動重試失敗的 repositories（最多 3 次）
- ✅ **進度追蹤**：即時顯示遷移進度和統計
- ✅ **狀態管理**：詳細的狀態記錄和備份
- ✅ **模組化設計**：易於維護和擴展

## 📦 安裝與設定

### 1. 安裝依賴

```bash
# 安裝 Node.js 依賴
npm install

# 確保已安裝 Git 和 Git LFS
git --version
git lfs version
```

### 2. 環境變數設定

複製並編輯 `.env` 檔案：

```bash
cp .env.sample .env
```

填入以下環境變數：

```env
# Bitbucket 設定
BB_WORKSPACE=your_bitbucket_workspace
BB_USER=your_bitbucket_username
BB_APP_PASSWORD=your_bitbucket_app_password

# GitHub 設定
GH_TOKEN=your_github_token_classic
GH_OWNER=your_github_username_or_org
```

### 3. LFS 配置設定（可選）

**混合式 LFS 管理**：系統支援配置優先 + 自動檢測後備的策略。

如需要精確控制特定 repositories，可參考 `data/lfs-settings.sample.json`，編輯 `data/lfs-settings.json`：

```json
{
  "repositories": {
    "your-repo-name": {
      "files": [
        "path/to/large/file.dat"
      ]
    },
    "another-repo": {
      "patterns": [
        "**/*.mp4",
        "**/*.zip"
      ]
    },
    "auto-detect-repo": {
      "autoDetect": true,
      "comment": "自動檢測大檔案"
    }
  }
}
```

#### 🔧 LFS 配置選項說明

- **files**：明確指定需要 LFS 的檔案路徑
- **patterns**：使用 glob 模式匹配檔案（如 `**/*.mp4`）
- **autoDetect**：自動檢測超過 50MB 的檔案
- **無配置檔案**：所有 repositories 使用純自動檢測模式

#### 📁 檔案大小閾值設定

系統預設值在 `app/lib/config.js` 中管理：
```javascript
lfs: {
  defaultThreshold: '50MB'  // 可調整閾值
}
```

#### 🔑 Token 設定說明

**Bitbucket App Password**：
1. 前往 Bitbucket → Settings → App passwords
2. 創建新的 App password
3. 勾選 Repositories (Read) 權限

**GitHub Personal Access Token**：
1. 前往 GitHub → Settings → Developer settings → Personal access tokens
2. 創建 Classic token
3. 勾選以下權限：
   - `repo` (完整權限)
   - `admin:org` (如果要創建到組織下)

### 4. 生成 Repository 清單

```bash
# 生成包含所有 repositories 的 repos.json（混合式 LFS 檢測）
node create-repos-list.js
```

系統會自動載入 LFS 設定檔案並顯示檢測策略：
- **有配置檔案**：顯示預設配置的 repositories
- **無配置檔案**：使用純自動檢測模式

## 🚀 使用方法

### 基本遷移

```bash
# 執行完整遷移
node do-migrate-repos.js
```

### 其他命令

```bash
# 查看統計資訊
node do-migrate-repos.js --stats

# 重試失敗的 repositories
node do-migrate-repos.js --retry

# 啟用詳細日誌
DEBUG=1 node do-migrate-repos.js
```

## 📊 檔案結構

```
app/
├── create-repos-list.js      # 生成 repository 清單
├── do-migrate-repos.js       # 主遷移腳本
├── lib/
│   ├── config.js             # 系統配置（閾值、路徑等）
│   ├── github-api.js         # GitHub API 操作
│   ├── git-operations.js     # Git 指令操作
│   ├── lfs-manager.js        # 混合式 LFS 管理器
│   ├── state-manager.js      # 狀態管理
│   └── utils.js              # 工具函數
├── .env                      # 環境變數（需自行創建）
├── .env.sample               # 環境變數範例
├── package.json              # Node.js 依賴
└── README.md                 # 使用說明

data/
├── repos.json                # Repository 清單（自動生成）
├── repos-backup-*.json       # 狀態備份檔案
└── lfs-settings.json         # LFS 用戶配置（可選）
└── lfs-settings.sample.json  # LFS 用戶配置範例

temp/                         # 暫存目錄（自動創建和清理）
```

## 📋 Repository 狀態說明

`repos.json` 中每個 repository 包含以下狀態：

```json
{
  "name": "repository-name",
  "branch": "main",
  "transferred": false,        // 是否已遷移完成
  "processing": false,         // 是否正在處理中
  "created_at": null,          // GitHub repository 創建時間
  "pushed_at": null,           // 代碼推送完成時間
  "error": null,               // 錯誤訊息
  "retry_count": 0             // 重試次數
}
```

**注意**：LFS 檢測現在是動態的。系統會在遷移過程中自動檢測每個 repository 的 LFS 需求並清理歷史紀錄。

## 🔥 最新功能改進

### 🆕 歷史檔案檢測功能

**解決問題**：許多 repositories 在遷移時會遇到「檔案超過 100MB 限制」的錯誤，即使這些檔案在當前工作目錄中已經不存在。

**原因分析**：這些大檔案存在於 Git 歷史記錄中的某些 commits，雖然已被刪除，但推送時 Git 仍會檢查整個歷史。

**智能解決方案**：
- 🔍 **歷史掃描**：自動掃描最近 50 個 commits 中的所有檔案
- 📊 **大小檢測**：識別歷史中超過閾值的大檔案（如 103.48MB 的 Electron 檔案）
- ⚡ **智能策略**：根據檔案分佈選擇最佳遷移方法

### 🆕 智能遷移策略

系統現在採用雙重策略：

| **策略** | **觸發條件** | **命令** | **適用場景** |
|----------|-------------|----------|-------------|
| **策略 A** | 檢測到歷史大檔案 | `git lfs migrate import --above=50MB --everything --yes` | 處理歷史中的所有大檔案 |
| **策略 B** | 只有當前檔案 | `git lfs migrate import --include="檔案列表" --everything --yes` | 精確處理特定檔案 |

### 🆕 全自動化處理

- **自動回答提示**：添加 `--yes` 參數，無需手動確認
- **清理配置結構**：移除不必要的 `defaultThreshold` 和 `globalPatterns`
- **統一設定管理**：所有系統設定集中在 `app/lib/config.js`

## 🗂 混合式 LFS 管理功能

### 智能檢測策略

系統採用**配置優先 + 自動檢測後備**的混合式策略：

| **模式** | **觸發條件** | **檢測方式** |
|----------|-------------|-------------|
| **配置模式** | 有 `lfs-settings.json` 且 repository 有配置 | 使用預設的 files/patterns/autoDetect |
| **自動檢測模式** | 無配置或無此 repository 設定 | 掃描所有檔案，超過 50MB 自動啟用 LFS |
| **混合模式** | 配置中設定 `autoDetect: true` | 結合配置和自動檢測 |

### LFS 檔案檢測方式

1. **明確檔案路徑**：`"files": ["path/to/file.dat"]`
2. **模式匹配**：`"patterns": ["**/*.mp4", "**/*.zip"]`
3. **自動檔案大小檢測**：檔案 > 50MB 自動啟用
4. **現有 LFS 檢測**：自動檢測已有的 LFS 檔案

### .gitattributes 自動生成 ✨

系統會自動：
- 🔍 掃描所有符合條件的 LFS 檔案
- 📝 生成對應的 `.gitattributes` 檔案
- ⚙️ 設定正確的 LFS 追蹤規則
- 📂 添加到 Git repository 並提交

生成的 `.gitattributes` 檔案範例：
```
# Git LFS configuration
# Generated by bitbucket-to-github migration tool

lib/data/MyLargeFile.dat filter=lfs diff=lfs merge=lfs -text
assets/my_lfs_file.zip filter=lfs diff=lfs merge=lfs -text
**/*.mp4 filter=lfs diff=lfs merge=lfs -text
```

## 🔧 常見問題

### Q: 如何新增 LFS repository 配置？
A: 編輯 `data/lfs-settings.json` 檔案，新增 repository 配置。如果檔案不存在，系統會使用純自動檢測模式。

### Q: 不想手動配置 LFS，可以完全自動檢測嗎？
A: 可以！刪除或不創建 `data/lfs-settings.json` 檔案，系統會對所有 repositories 使用自動檢測模式（檔案 > 50MB 自動啟用 LFS）。

### Q: 如何處理現有的 LFS repository？
A: 系統會自動檢測現有的 LFS 檔案並處理，無需額外配置。現有 LFS 檔案會被正確遷移。

### Q: 可以調整自動檢測的檔案大小閾值嗎？
A: 可以！修改 `app/lib/config.js` 中的 `lfs.defaultThreshold` 設定。

### Q: 程序中斷後如何繼續？
A: 直接重新執行 `node do-migrate-repos.js`，系統會自動跳過已完成的 repositories。

### Q: 如何重試失敗的 repositories？
A: 執行 `node do-migrate-repos.js --retry`。

### Q: 如何查看詳細進度？
A: 執行 `node do-migrate-repos.js --stats`。

### Q: 遇到 GitHub API rate limit 怎麼辦？
A: 系統會自動檢測 rate limit 並等待重置，無需手動處理。

### Q: 如何處理已存在的 GitHub repositories？
A: 系統會自動檢查，如果 repository 已存在且為空，會跳過創建步驟直接推送代碼。

### Q: LFS 檔案過大導致超時怎麼辦？
A: 系統會自動重試，如果持續失敗可檢查網路連接或調整檔案大小閾值。

### Q: 遇到「檔案超過 100MB 限制」但檔案在當前目錄中不存在怎麼辦？
A: 🆕 系統現在會自動檢測 Git 歷史中的大檔案，使用智能遷移策略處理這種情況，無需手動干預。

### Q: 歷史檔案檢測會影響遷移速度嗎？
A: 🆕 歷史檔案檢測僅掃描最近 50 個 commits，對速度影響很小，但能有效解決大檔案推送問題。

### Q: 如何確認系統是否正確檢測到歷史大檔案？
A: 🆕 遷移日誌會清楚顯示當前檔案和歷史檔案的數量，以及採用的遷移策略（基於大小 vs 基於檔案列表）。

### Q: 為什麼不再需要手動配置 defaultThreshold？
A: 🆕 系統設定已統一管理在 `app/lib/config.js` 中，用戶配置 `data/lfs-settings.json` 只需專注於特定 repository 的檔案設定。

## ⚠️ 注意事項

1. **GitHub API 限制**：每小時 5000 次請求限制
2. **LFS 儲存限制**：GitHub 免費帳戶有 1GB LFS 儲存限制
3. **網路穩定性**：建議在穩定的網路環境下執行
4. **磁碟空間**：確保有足夠的磁碟空間存放暫存檔案（特別是 LFS 檔案）
5. **備份重要**：遷移前建議備份重要 repositories
6. **Token 權限**：確保 GitHub token 有足夠的權限
7. **LFS 混合式檢測**：系統會自動檢測 LFS 需求，也可透過 `data/lfs-settings.json` 精確控制
8. **自動 .gitattributes**：系統會自動生成 LFS 追蹤規則，無需手動管理

## 📈 預估執行時間

- **小型 repository**（無 LFS）：2-3 分鐘
- **中型 repository**（少量 LFS）：5-10 分鐘  
- **大型 repository**（多 LFS 檔案）：15-30 分鐘
- **總體預估**：依 repository 大小和 LFS 檔案數量而定

## 🛠 開發說明

### 模組介紹

- **config.js**：系統配置管理（閾值、路徑、系統參數）
- **GitHubAPI**：處理 GitHub API 操作和 LFS 啟用
- **GitOperations**：處理 Git 指令操作
- **LFSManager**：混合式 LFS 管理（配置 + 自動檢測）
- **StateManager**：管理 repository 狀態
- **Utils**：提供工具函數

### 混合式 LFS 功能

- **配置優先策略**：`lfs-settings.json` 精確控制
- **自動檢測後備**：檔案大小自動判斷
- **歷史檔案檢測**：🆕 掃描 Git 歷史中的大檔案
- **智能遷移策略**：🆕 根據檔案分佈選擇最佳 migrate 方法
- **智能 .gitattributes 生成**：自動創建追蹤規則
- **全自動化處理**：🆕 無需手動干預，自動回答所有提示
- **四種檢測模式**：配置、自動檢測、混合、歷史檢測
- **詳細處理日誌**：顯示當前和歷史檔案統計

### 擴展功能

可以輕鬆擴展以下功能：
- **自定義檢測策略**：新增更多檔案類型或檢測條件
- **動態閾值調整**：根據 repository 特性調整大小閾值
- **複雜匹配規則**：支援更複雜的 glob 模式和條件邏輯
- **LFS 統計報告**：生成詳細的 LFS 使用統計
- **多種檢測模式**：擴展配置、自動檢測、混合模式的組合
- **歷史檔案處理**：🆕 增強對 Git 歷史中大檔案的檢測和處理能力

## 🏆 版本更新摘要

### v2.0 重大更新

**🔥 核心功能改進**：
- 新增歷史檔案檢測功能，解決已刪除大檔案的推送問題
- 智能遷移策略，根據檔案分佈自動選擇最佳方法
- 全自動化處理，無需手動干預
- 配置結構優化，移除冗餘設定

**🛠 技術改進**：
- 統一配置管理：系統設定集中在 `config.js`
- 清理用戶配置：`lfs-settings.json` 僅保留必要的 repository 特定設定
- 增強錯誤處理和日誌顯示

**✅ 解決的關鍵問題**：
- ✅ 歷史大檔案導致的推送失敗
- ✅ Git LFS migrate 交互式提示需要手動確認
- ✅ 配置檔案結構冗餘和混亂
- ✅ 缺乏對 Git 歷史的全面檢測

**🎯 成果**：所有原本因大檔案問題失敗的 repositories 現在都能成功遷移！
