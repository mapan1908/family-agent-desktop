/**
 * 平台路径适配层
 *
 * 业务代码统一从这里读路径，**不要**直接用 process.env.DATA_DIR / './data'。
 *
 * 支持 5 种部署形态：
 *   1. NAS + Docker:    /config, /data
 *   2. macOS 桌面:      ~/Library/Application Support/family-agent
 *   3. Windows 桌面:    %APPDATA%\family-agent
 *   4. Linux 桌面:      ~/.config + ~/.local/share
 *   5. 开发模式:        ./config, ./data
 *
 * 优先级：
 *   - 环境变量 FAMILY_CONFIG_DIR / FAMILY_DATA_DIR / SCAN_PATPS 优先
 *   - DATA_DIR 兼容旧 .env
 *   - 平台默认路径兜底
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/** 开发模式检测：npm run dev / node --watch / dotenv 找不到时 */
function isDevMode() {
  // 1. Tauri 开发模式显式设置 NODE_ENV=development
  if (process.env.NODE_ENV === 'development') return true;
  // 2. 生产模式显式设置 → 直接判定非开发
  if (process.env.NODE_ENV === 'production') return false;
  // 3. 兜底：项目根有 package.json（node index.js 直接启动）
  try {
    if (fs.existsSync(path.join(process.cwd(), 'package.json'))) return true;
  } catch {}
  return false;
}

/** 配置目录（.env、未来的应用配置） */
function getConfigDir() {
  if (process.env.FAMILY_CONFIG_DIR) return process.env.FAMILY_CONFIG_DIR;
  if (isDevMode()) return path.join(process.cwd(), 'config');
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'family-agent');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'family-agent');
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'family-agent'
  );
}

/** 数据目录（db、files、notes） */
function getDataDir() {
  if (process.env.FAMILY_DATA_DIR) return process.env.FAMILY_DATA_DIR;
  // 兼容旧 .env
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (isDevMode()) return path.join(process.cwd(), 'data');
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'family-agent', 'data');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'family-agent', 'data');
  }
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'family-agent'
  );
}

/** 扫描路径列表（SCAN_PATHS 逗号分隔） */
function getScanPaths() {
  if (process.env.SCAN_PATHS) {
    return process.env.SCAN_PATHS
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  // 开发模式默认扫 ./data/files 和 ./data/notes
  if (isDevMode()) {
    const d = path.join(process.cwd(), 'data');
    return [path.join(d, 'files'), path.join(d, 'notes')];
  }
  // 桌面端 / NAS：依赖首次启动向导或 docker-compose 配置
  return [];
}

/** Web 面板端口 */
function getPort() {
  return parseInt(process.env.FAMILY_PORT || '3099', 10);
}

/** SQLite db 路径 */
function getDbFile() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return path.join(getDataDir(), 'agent.db');
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

// 启动时确保目录存在（NAS 部署时 mount 进来的目录已存在，此处是兜底）
const configDir = ensureDir(getConfigDir());
const dataDir = ensureDir(getDataDir());
const filesDir = ensureDir(path.join(dataDir, 'files'));
const notesDir = ensureDir(path.join(dataDir, 'notes'));
const dbFileDir = ensureDir(path.dirname(getDbFile()));

export const paths = {
  // 目录
  configDir,
  dataDir,
  filesDir,
  notesDir,
  // 文件
  envFile: path.join(configDir, '.env'),
  dbFile: getDbFile(),
  // 列表
  scanPaths: getScanPaths(),
  // 其他
  port: getPort(),
};

/** 调试用：打印当前解析结果 */
export function logPaths() {
  console.log('📁 路径配置:');
  console.log(`   configDir: ${paths.configDir}`);
  console.log(`   dataDir:   ${paths.dataDir}`);
  console.log(`   dbFile:    ${paths.dbFile}`);
  console.log(`   envFile:   ${paths.envFile}`);
  console.log(`   scanPaths: ${JSON.stringify(paths.scanPaths)}`);
  console.log(`   port:      ${paths.port}`);
}
