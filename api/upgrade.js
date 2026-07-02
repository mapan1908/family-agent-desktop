/**
 * API: 升级管理
 *
 * - GET /api/upgrade/check — 检查是否有新版本
 * - POST /api/upgrade/run — 执行升级（下载 + 迁移 + 重启）
 */

import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function parseVersion(v) {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function isNewer(current, remote) {
  const c = parseVersion(current);
  const r = parseVersion(remote);
  if (r.major !== c.major) return r.major > c.major;
  if (r.minor !== c.minor) return r.minor > c.minor;
  return r.patch > c.patch;
}

export function router(db) {
  const r = Router();

  // 检查是否有新版本
  r.get('/check', async (_req, res) => {
    const upgradeUrl = process.env.UPGRADE_URL || '';

    if (!upgradeUrl) {
      return res.json({
        current: getVersion(),
        latest: null,
        hasUpdate: false,
        message: '未配置升级服务器（设置 UPGRADE_URL 环境变量）',
      });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(upgradeUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.json({ current: getVersion(), latest: null, hasUpdate: false, message: '检查失败' });
      }

      const data = await response.json();
      const current = getVersion();
      const latest = data.version || '0.0.0';
      const hasUpdate = isNewer(current, latest);

      res.json({
        current,
        latest,
        hasUpdate,
        downloadUrl: data.downloadUrl || null,
        changelog: data.changelog || '',
      });
    } catch (e) {
      res.json({ current: getVersion(), latest: null, hasUpdate: false, message: `检查失败: ${e.message}` });
    }
  });

  // 执行升级
  r.post('/run', async (req, res) => {
    const { downloadUrl } = req.body;

    if (!downloadUrl) {
      return res.status(400).json({ error: '缺少 downloadUrl' });
    }

    try {
      // 1. 备份当前代码
      const backupDir = join(PROJECT_ROOT, '.backup');
      execSync(`mkdir -p ${backupDir}`);
      execSync(`cp -r ${join(PROJECT_ROOT, 'agent')} ${join(PROJECT_ROOT, 'api')} ${join(PROJECT_ROOT, 'db')} ${join(PROJECT_ROOT, 'cron')} ${join(PROJECT_ROOT, 'index.js')} ${join(PROJECT_ROOT, 'package.json')} ${backupDir}/`);
      console.log('📦 备份完成');

      // 2. 下载新版本
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`下载失败: ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      const archivePath = join(PROJECT_ROOT, '.upgrade.tar.gz');
      const fs = await import('node:fs/promises');
      await fs.writeFile(archivePath, buffer);
      console.log('📦 下载完成');

      // 3. 解压（覆盖 agent/ api/ db/ cron/ index.js package.json）
      execSync(`tar -xzf ${archivePath} -C ${PROJECT_ROOT} --strip-components=1`);
      await fs.unlink(archivePath);
      console.log('📦 解压完成');

      // 4. 安装依赖
      execSync('npm install --production', { cwd: PROJECT_ROOT, stdio: 'pipe' });
      console.log('📦 依赖安装完成');

      // 5. 运行迁移
      const { runMigrations } = await import('./db/migrate.js');
      runMigrations(db);
      console.log('📦 数据库迁移完成');

      res.json({ ok: true, message: '升级成功，即将重启...' });

      // 6. 延迟重启
      setTimeout(() => {
        console.log('🔄 正在重启...');
        process.exit(0); // 由外部进程管理器（systemd/docker/Tauri）自动重启
      }, 2000);
    } catch (e) {
      console.error('❌ 升级失败:', e.message);
      res.status(500).json({ error: `升级失败: ${e.message}` });
    }
  });

  return r;
}
