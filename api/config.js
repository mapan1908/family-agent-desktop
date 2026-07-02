/**
 * API: 系统配置
 */
import { Router } from 'express';
import { paths } from './paths.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// 升级 URL（用户可配置）
const UPGRADE_URL = process.env.UPGRADE_URL || '';

export function router(db) {
  const r = Router();

  // 获取当前配置
  r.get('/', (_req, res) => {
    const rows = db.all('SELECT key, value FROM config');
    const config = {};
    for (const row of rows) config[row.key] = row.value;
    config.imageAi = config.imageAi || process.env.IMAGE_AI || 'off';
    config.scanPaths = config.scanPaths || process.env.SCAN_PATHS || '';
    config.port = config.port || process.env.FAMILY_PORT || '3099';

    // 返回绝对路径（数据库里可能是相对路径）
    config.dataDir = paths.dataDir;
    res.json(config);
  });

  // 保存配置
  r.post('/', (req, res) => {
    const fields = ['llmApiKey', 'llmBaseUrl', 'llmModel', 'imageAi', 'scanPaths', 'port'];
    for (const key of fields) {
      if (req.body[key] !== undefined) {
        db.exec('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, req.body[key]]);
      }
    }
    res.json({ ok: true });
  });

  // 获取状态（面板首页用）
  r.get('/status', (_req, res) => {
    const llmKey = db.get("SELECT value FROM config WHERE key='llmApiKey'");
    const files = db.get("SELECT COUNT(*) as count FROM files");
    const todos = db.get("SELECT COUNT(*) as count FROM todos WHERE done = 0");
    const members = db.get("SELECT COUNT(*) as count FROM members WHERE name NOT LIKE '用户%'");
    const messages = db.get("SELECT COUNT(*) as count FROM messages");
    res.json({
      llmConfigured: !!(llmKey?.value),
      fileCount: files?.count || 0,
      todoCount: todos?.count || 0,
      memberCount: members?.count || 0,
      messageCount: messages?.count || 0,
      appVersion: getVersion(),
    });
  });

  // 版本信息
  r.get('/version', (_req, res) => {
    res.json({
      version: getVersion(),
      upgradeUrl: UPGRADE_URL || null,
    });
  });

  return r;
}
