/**
 * 测试辅助 — 临时数据库 + 工具加载
 *
 * 每个测试文件调用 createTestEnv()，拿到 { db, tools, cleanup }。
 * 测试结束后调用 cleanup() 清理临时文件。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDB } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { loadTools } from '../agent/tools/index.js';

/**
 * 创建隔离的测试环境
 * @returns {{ db, tools: object[], dataDir: string, cleanup: () => void }}
 */
export async function createTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-agent-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const db = await initDB(dbPath);
  runMigrations(db);

  // 加载工具（db 注入到每个 tool 的 this.db）
  const tools = await loadTools(db);

  // 覆盖 dataDir 指向临时目录
  for (const t of tools) {
    t.dataDir = dataDir;
  }

  function cleanup() {
    try { db.close(); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { db, tools, dataDir, tmpDir, cleanup };
}

/**
 * 按名字找工具
 */
export function findTool(tools, name) {
  return tools.find(t => t.name === name);
}

/**
 * 调用工具（自动绑定 this）
 */
export async function callTool(tools, name, params) {
  const t = findTool(tools, name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t.execute.call(t, `test-${name}`, params);
}
