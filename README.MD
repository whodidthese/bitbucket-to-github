# Bitbucket to GitHub Migration Tool

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Automated script to help batch migrate all Bitbucket repositories to GitHub, with intelligent LFS management, resume capability, and error retry.

This project is a Vibe Coding project. 99% of the code was completed by `cursor` IDE in `claude-4-sonnet` **MAX** mode.
Developed for personal needs. Development time was approximately 4-5 hours, including migrating my 300+ repositories from Bitbucket.

## 🚀 Key Features

- ✅ **Batch Migration**: Automatically migrate multiple repositories
- ✅ **Hybrid LFS Management**: Smart LFS handling with configuration priority + auto-detection fallback
- ✅ **Historical File Detection**: 🆕 Automatically detect large files in Git history, solving push issues with deleted large files
- ✅ **Smart Migration Strategy**: 🆕 Choose optimal LFS migrate method based on file distribution
- ✅ **Auto .gitattributes Generation**: Automatically create and manage LFS tracking rules based on detection results
- ✅ **Fully Automated Processing**: 🆕 No manual intervention required, automatically responds to all interactive prompts
- ✅ **Smart Checks**: Automatically check if GitHub repository exists and is empty
- ✅ **Rate Limit Handling**: Intelligently handle GitHub API limits, auto-wait and retry
- ✅ **Resume Capability**: Resume from breakpoint after program interruption
- ✅ **Error Retry**: Automatically retry failed repositories (up to 3 times)
- ✅ **Progress Tracking**: Real-time migration progress and statistics display
- ✅ **State Management**: Detailed status recording and backup
- ✅ **Modular Design**: Easy to maintain and extend

## 📦 Installation & Setup

### 1. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Ensure Git and Git LFS are installed
git --version
git lfs version
```

### 2. Environment Variables Setup

Copy and edit the `.env` file:

```bash
cp .env.sample .env
```

Fill in the following environment variables:

```env
# Bitbucket Settings
BB_WORKSPACE=your_bitbucket_workspace
BB_USER=your_bitbucket_username
BB_APP_PASSWORD=your_bitbucket_app_password

# GitHub Settings
GH_TOKEN=your_github_token_classic
GH_OWNER=your_github_username_or_org
```

### 3. LFS Configuration Setup (Optional)

**Hybrid LFS Management**: The system supports configuration priority + auto-detection fallback strategy.

For precise control over specific repositories, refer to `data/lfs-settings.sample.json` and edit `data/lfs-settings.json`:

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
      "comment": "Automatically detect large files"
    }
  }
}
```

#### 🔧 LFS Configuration Options

- **files**: Explicitly specify file paths that need LFS
- **patterns**: Use glob patterns to match files (e.g., `**/*.mp4`)
- **autoDetect**: Automatically detect files over 50MB
- **No config file**: All repositories use pure auto-detection mode

#### 📁 File Size Threshold Settings

System defaults are managed in `app/lib/config.js`:
```javascript
lfs: {
  defaultThreshold: '50MB'  // Adjustable threshold
}
```

#### 🔑 Token Setup Instructions

**Bitbucket App Password**:
1. Go to Bitbucket → Settings → App passwords
2. Create new App password
3. Check Repositories (Read) permission

**GitHub Personal Access Token**:
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Create Classic token
3. Check the following permissions:
   - `repo` (full access)
   - `admin:org` (if creating under organization)

### 4. Generate Repository List

```bash
# Generate repos.json containing all repositories (hybrid LFS detection)
node create-repos-list.js
```

The system will automatically load LFS settings and display detection strategy:
- **With config file**: Shows repositories with predefined configurations
- **Without config file**: Uses pure auto-detection mode

## 🚀 Usage

### Basic Migration

```bash
# Execute full migration
node do-migrate-repos.js
```

### Other Commands

```bash
# View statistics
node do-migrate-repos.js --stats

# Retry failed repositories
node do-migrate-repos.js --retry

# Enable verbose logging
DEBUG=1 node do-migrate-repos.js
```

## 📊 File Structure

```
app/
├── create-repos-list.js      # Generate repository list
├── do-migrate-repos.js       # Main migration script
├── lib/
│   ├── config.js             # System configuration (thresholds, paths, etc.)
│   ├── github-api.js         # GitHub API operations
│   ├── git-operations.js     # Git command operations
│   ├── lfs-manager.js        # Hybrid LFS manager
│   ├── state-manager.js      # State management
│   └── utils.js              # Utility functions
├── .env                      # Environment variables (create yourself)
├── .env.sample               # Environment variables sample
├── package.json              # Node.js dependencies
└── README.md                 # Usage instructions

data/
├── repos.json                # Repository list (auto-generated)
├── repos-backup-*.json       # Status backup files
├── lfs-settings.json         # User LFS configuration (optional)
└── lfs-settings.sample.json  # LFS configuration sample

temp/                         # Temporary directory (auto-created and cleaned)
```

## 📋 Repository Status Description

Each repository in `repos.json` contains the following status:

```json
{
  "name": "repository-name",
  "branch": "main",
  "transferred": false,        // Whether migration is complete
  "processing": false,         // Whether currently processing
  "created_at": null,          // GitHub repository creation time
  "pushed_at": null,           // Code push completion time
  "error": null,               // Error message
  "retry_count": 0             // Retry count
}
```

**Note**: LFS detection is now dynamic. The system will automatically detect LFS requirements for each repository during migration and clean up history records.

## 🔥 Latest Feature Improvements

### 🆕 Historical File Detection Feature

**Problem Solved**: Many repositories encounter "file exceeds 100MB limit" errors during migration, even when these files no longer exist in the current working directory.

**Root Cause Analysis**: These large files exist in certain commits in Git history. Although deleted, Git still checks the entire history when pushing.

**Smart Solution**:
- 🔍 **History Scanning**: Automatically scan all files in the last 50 commits
- 📊 **Size Detection**: Identify large files in history that exceed the threshold (e.g., 103.48MB Electron files)
- ⚡ **Smart Strategy**: Choose optimal migration method based on file distribution

### 🆕 Smart Migration Strategy

The system now adopts a dual strategy:

| **Strategy** | **Trigger Condition** | **Command** | **Use Case** |
|-------------|----------------------|-------------|-------------|
| **Strategy A** | Historical large files detected | `git lfs migrate import --above=50MB --everything --yes` | Handle all large files in history |
| **Strategy B** | Current files only | `git lfs migrate import --include="file-list" --everything --yes` | Precisely handle specific files |

### 🆕 Fully Automated Processing

- **Auto-answer prompts**: Added `--yes` parameter, no manual confirmation required
- **Clean configuration structure**: Removed unnecessary `defaultThreshold` and `globalPatterns`
- **Unified settings management**: All system settings centralized in `app/lib/config.js`

## 🗂 Hybrid LFS Management Features

### Smart Detection Strategy

The system adopts a **configuration priority + auto-detection fallback** hybrid strategy:

| **Mode** | **Trigger Condition** | **Detection Method** |
|----------|---------------------|-------------------|
| **Configuration Mode** | Has `lfs-settings.json` and repository has configuration | Use predefined files/patterns/autoDetect |
| **Auto-detection Mode** | No configuration or no repository settings | Scan all files, auto-enable LFS for files > 50MB |
| **Hybrid Mode** | Set `autoDetect: true` in configuration | Combine configuration and auto-detection |

### LFS File Detection Methods

1. **Explicit file paths**: `"files": ["path/to/file.dat"]`
2. **Pattern matching**: `"patterns": ["**/*.mp4", "**/*.zip"]`
3. **Auto file size detection**: Files > 50MB auto-enable LFS
4. **Existing LFS detection**: Auto-detect existing LFS files

### Auto .gitattributes Generation ✨

The system automatically:
- 🔍 Scans all LFS-eligible files
- 📝 Generates corresponding `.gitattributes` file
- ⚙️ Sets correct LFS tracking rules
- 📂 Adds to Git repository and commits

Generated `.gitattributes` file example:
```
# Git LFS configuration
# Generated by bitbucket-to-github migration tool

lib/data/MyLargeFile.dat filter=lfs diff=lfs merge=lfs -text
assets/my_lfs_file.zip filter=lfs diff=lfs merge=lfs -text
**/*.mp4 filter=lfs diff=lfs merge=lfs -text
```

## 🔧 FAQ

### Q: How to add LFS repository configuration?
A: Edit the `data/lfs-settings.json` file and add repository configuration. If the file doesn't exist, the system will use pure auto-detection mode.

### Q: Can I use fully automatic detection without manual LFS configuration?
A: Yes! Delete or don't create the `data/lfs-settings.json` file, and the system will use auto-detection mode for all repositories (files > 50MB auto-enable LFS).

### Q: How to handle existing LFS repositories?
A: The system will automatically detect and handle existing LFS files without additional configuration. Existing LFS files will be migrated correctly.

### Q: Can I adjust the file size threshold for auto-detection?
A: Yes! Modify the `lfs.defaultThreshold` setting in `app/lib/config.js`.

### Q: How to continue after program interruption?
A: Simply re-run `node do-migrate-repos.js`, the system will automatically skip completed repositories.

### Q: How to retry failed repositories?
A: Run `node do-migrate-repos.js --retry`.

### Q: How to view detailed progress?
A: Run `node do-migrate-repos.js --stats`.

### Q: What to do when encountering GitHub API rate limit?
A: The system automatically detects rate limits and waits for reset, no manual intervention required.

### Q: How to handle existing GitHub repositories?
A: The system automatically checks if repositories exist and are empty, skipping creation and directly pushing code.

### Q: What to do when LFS files are too large and cause timeout?
A: The system will automatically retry. If failures persist, check network connection or adjust file size threshold.

### Q: What to do when encountering "file exceeds 100MB limit" but the file doesn't exist in current directory?
A: 🆕 The system now automatically detects large files in Git history and uses smart migration strategy to handle this situation without manual intervention.

### Q: Will historical file detection affect migration speed?
A: 🆕 Historical file detection only scans the last 50 commits, with minimal speed impact, but effectively solves large file push issues.

### Q: How to confirm the system correctly detected historical large files?
A: 🆕 Migration logs clearly show the count of current and historical files, and the migration strategy adopted (size-based vs file-list-based).

### Q: Why is manual defaultThreshold configuration no longer needed?
A: 🆕 System settings are now unified in `app/lib/config.js`, user configuration `data/lfs-settings.json` only needs to focus on specific repository file settings.

## ⚠️ Important Notes

1. **GitHub API Limits**: 5000 requests per hour limit
2. **LFS Storage Limits**: GitHub free accounts have 1GB LFS storage limit
3. **Network Stability**: Recommended to run in stable network environment
4. **Disk Space**: Ensure sufficient disk space for temporary files (especially LFS files)
5. **Backup Important**: Recommended to backup important repositories before migration
6. **Token Permissions**: Ensure GitHub token has sufficient permissions
7. **Hybrid LFS Detection**: System automatically detects LFS requirements, also controllable via `data/lfs-settings.json`
8. **Auto .gitattributes**: System automatically generates LFS tracking rules, no manual management required

## 📈 Estimated Execution Time

- **Small repository** (no LFS): 2-3 minutes
- **Medium repository** (few LFS files): 5-10 minutes  
- **Large repository** (many LFS files): 15-30 minutes
- **Overall estimate**: Depends on repository size and number of LFS files

## 🛠 Development Notes

### Module Introduction

- **config.js**: System configuration management (thresholds, paths, system parameters)
- **GitHubAPI**: Handle GitHub API operations and LFS enablement
- **GitOperations**: Handle Git command operations
- **LFSManager**: Hybrid LFS management (configuration + auto-detection)
- **StateManager**: Manage repository states
- **Utils**: Provide utility functions

### Hybrid LFS Features

- **Configuration priority strategy**: `lfs-settings.json` precise control
- **Auto-detection fallback**: File size automatic judgment
- **Historical file detection**: 🆕 Scan large files in Git history
- **Smart migration strategy**: 🆕 Choose optimal migrate method based on file distribution
- **Smart .gitattributes generation**: Auto-create tracking rules
- **Fully automated processing**: 🆕 No manual intervention, auto-answer all prompts
- **Four detection modes**: Configuration, auto-detection, hybrid, historical detection
- **Detailed processing logs**: Show current and historical file statistics

### Extension Features

Can easily extend the following features:
- **Custom detection strategies**: Add more file types or detection conditions
- **Dynamic threshold adjustment**: Adjust size thresholds based on repository characteristics
- **Complex matching rules**: Support more complex glob patterns and conditional logic
- **LFS statistics reports**: Generate detailed LFS usage statistics
- **Multiple detection modes**: Extend combinations of configuration, auto-detection, and hybrid modes
- **Historical file processing**: 🆕 Enhanced detection and processing capabilities for large files in Git history

## 🏆 Version Update Summary

### v2.0 Major Update

**🔥 Core Feature Improvements**:
- Added historical file detection feature, solving push issues with deleted large files
- Smart migration strategy, automatically choosing optimal method based on file distribution
- Fully automated processing, no manual intervention required
- Configuration structure optimization, removing redundant settings

**🛠 Technical Improvements**:
- Unified configuration management: System settings centralized in `config.js`
- Cleaned user configuration: `lfs-settings.json` only retains necessary repository-specific settings
- Enhanced error handling and log display

**✅ Key Problems Solved**:
- ✅ Push failures caused by historical large files
- ✅ Git LFS migrate interactive prompts requiring manual confirmation
- ✅ Redundant and confusing configuration file structure
- ✅ Lack of comprehensive Git history detection

**🎯 Results**: All repositories that previously failed due to large file issues can now be successfully migrated!
