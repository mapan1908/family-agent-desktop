/**
 * 扫描目录 — 把磁盘上的文件建索引到 db
 *
 * 用法：
 *   - LLM 按需调："我手动放了一个文件，扫一下"
 *   - 启动时自动跑（见 initScan），把 scan_paths 下的文件全部入 db
 *
 * 规则：
 *   - 按 path 去重（db 里已有就跳过）
 *   - owner 从路径推断：data/files/{owner}/... 或 data/notes/{owner}/...
 *   - 文本类（.txt/.md/.json/.csv）读 content 入库 + FTS 索引
 *   - 二进制类只入元数据
 *
 * 不会：
 *   - 删除 db 里已有但磁盘上不存在的文件（孤儿记录保留）
 *   - 移动/重命名磁盘文件（只建索引）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Type } from '@earendil-works/pi-ai';

const TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.xml', '.yaml', '.yml']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv']);

function detectType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (TEXT_EXTS.has(ext)) return 'note';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'file';
}

/**
 * 从绝对路径里推断 owner
 *  - /data/files/妈妈/x.jpg  → '妈妈'  （dataDir=/data，rel=files/妈妈/...）
 *  - /data/notes/家庭/x.txt  → '家庭'  （dataDir=/data，rel=notes/家庭/...）
 *  - /tmp/scan/家庭/note.md  → '家庭'  （dataDir=/tmp/scan，rel=家庭/note.md）
 */
function inferOwner(absPath, dataDir) {
  const rel = path.relative(dataDir, absPath).replace(/\\/g, '/');
  const parts = rel.split('/').filter(Boolean);
  if (parts.length === 0) return '家庭';
  // 1) 优先匹配 files/xxx/... 或 notes/xxx/... 形式
  if ((parts[0] === 'files' || parts[0] === 'notes') && parts[1]) return parts[1];
  // 2) 兜底：路径第一段
  return parts[0];
}

/** 单文件入 db（已存在则跳过） */
export async function indexFile(absPath, dataDir, db) {
  // 1. 去重：path 已存在就跳过
  const existing = db.get('SELECT id FROM files WHERE path = ?', [absPath]);
  if (existing) return { action: 'skip', reason: 'already indexed' };

  // 2. 基础元数据
  const name = path.basename(absPath);
  const owner = inferOwner(absPath, dataDir);
  const type = detectType(name);
  const stat = await fs.stat(absPath);
  const date = stat.mtime.toISOString().slice(0, 10);

  // 3. 文本类读 content（限制 200KB 防止大文件卡住）
  let content = '';
  if (type === 'note') {
    try {
      const buf = await fs.readFile(absPath);
      if (buf.length <= 200 * 1024) content = buf.toString('utf-8');
    } catch {}
  } else {
    content = path.basename(name, path.extname(name));
  }

  // 4. 入 db + FTS
  db.exec(
    'INSERT INTO files (name, path, from_user, date, type, content, size) VALUES (?,?,?,?,?,?,?)',
    [name, absPath, owner, date, type, content, stat.size]
  );
  const row = db.get('SELECT last_insert_rowid() as id')?.id;
  if (row) db.indexItem('files', row, name, content, owner, 'family');

  return { action: 'insert', id: row, type, owner };
}

/** BFS 遍历目录，返回所有文件绝对路径（不递归 yield*，避免 async generator bug） */
export async function walk(rootDir) {
  const results = [];
  const queue = [rootDir];
  while (queue.length) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      continue; // 目录不存在或读不到，静默跳过
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue; // 跳过 .xxx 隐藏目录
        queue.push(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  return results;
}

export default {
  name: 'scan_directory',
  label: '扫描目录',
  description: '把指定目录下的所有文件建索引到 db（已有 path 跳过）。owner 从路径推断。可选递归。',
  parameters: Type.Object({
    directory: Type.String({ description: '要扫描的目录绝对路径' }),
    recursive: Type.Optional(Type.Boolean({ description: '是否递归子目录，默认 true' })),
  }),

  async execute(toolCallId, params) {
    const targetDir = params.directory;
    const recursive = params.recursive !== false;

    let total = 0, inserted = 0, skipped = 0;
    const errors = [];

    let filePaths;
    if (recursive) {
      filePaths = await walk(targetDir);
    } else {
      try {
        const entries = await fs.readdir(targetDir, { withFileTypes: true });
        filePaths = entries.filter((e) => e.isFile()).map((e) => path.join(targetDir, e.name));
      } catch (e) {
        return { content: [{ type: 'text', text: `无法读取目录：${e.message}` }], details: null };
      }
    }

    for (const filePath of filePaths) {
      total++;
      try {
        const r = await indexFile(filePath, this.paths.dataDir, this.db);
        if (r.action === 'insert') inserted++;
        else skipped++;
      } catch (e) {
        errors.push(`${filePath}: ${e.message}`);
      }
    }

    const lines = [
      `📂 扫描完成：${targetDir}`,
      `  总文件 ${total}，新增 ${inserted}，跳过（已索引）${skipped}`,
    ];
    if (errors.length) {
      lines.push(`  ❌ 错误 ${errors.length}：${errors.slice(0, 3).join('；')}${errors.length > 3 ? '…' : ''}`);
    }
    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      details: { directory: targetDir, total, inserted, skipped, errors: errors.length },
    };
  },
};

/**
 * 清理孤儿记录：db 里有但磁盘上不存在的文件
 * 不清理 link 类型（虚拟路径）和 dataDir 内的文件（由 Agent 自己管理）
 */
export async function cleanupOrphans(db, dataDir) {
  const fsSync = await import('node:fs');
  const rows = db.all("SELECT id, name, path, type FROM files WHERE path IS NOT NULL AND path != '(virtual)'");
  let removed = 0;
  for (const row of rows) {
    // 跳过 dataDir 内的文件（Agent 自己管理的，不归扫描管）
    if (dataDir && row.path.startsWith(dataDir)) continue;
    if (!fsSync.existsSync(row.path)) {
      db.exec('DELETE FROM files WHERE id = ?', [row.id]);
      db.removeIndex('files', row.id);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`🧹 清理孤儿：${removed} 条记录（磁盘上已不存在）`);
  }
  return removed;
}

/**
 * 启动时自动跑：把 paths.scanPaths 下的文件全部入 db
 * 在 initAgent() 完成后调用一次
 */
export async function runStartupScan(db, paths) {
  if (!paths.scanPaths || paths.scanPaths.length === 0) {
    console.log('📂 启动扫描：SCAN_PATHS 为空，跳过');
    return;
  }
  console.log(`📂 启动扫描：${paths.scanPaths.length} 个目录`);
  for (const dir of paths.scanPaths) {
    let total = 0, inserted = 0, skipped = 0;
    const files = await walk(dir);
    for (const filePath of files) {
      total++;
      try {
        const r = await indexFile(filePath, paths.dataDir, db);
        if (r.action === 'insert') inserted++;
        else skipped++;
      } catch (e) {
        // 静默忽略单个文件错误
      }
    }
    console.log(`   ${dir}: 总 ${total}，新增 ${inserted}，跳过 ${skipped}`);
  }

  // 扫描完后清理孤儿
  await cleanupOrphans(db, paths.dataDir);

  console.log('📂 启动扫描完成');
}
