/**
 * 数据库自动迁移
 *
 * 检测 schema 差异，自动执行 ALTER TABLE。
 * 每次启动时运行，幂等（已存在的列不会重复加）。
 */

import fs from 'node:fs';

// 所有表的期望列定义
// 格式：{ table: { column: 'TYPE DEFAULT ...' } }
const EXPECTED_COLUMNS = {
  files: {
    content: 'TEXT',
    "visibility": "TEXT DEFAULT 'family'",
    url: 'TEXT',
    link_title: 'TEXT',
    link_source: 'TEXT',
    size: 'INTEGER',
  },
  passwords: {
    "visibility": "TEXT DEFAULT 'family'",
  },
  todos: {
    "visibility": "TEXT DEFAULT 'family'",
    assignee: 'TEXT',
    body: 'TEXT',
    remind_before_minutes: 'INTEGER DEFAULT 0',
    last_pushed_at: 'INTEGER DEFAULT 0',
  },
};

// 需要创建的表（如果不存在）
const EXPECTED_TABLES = {
  sessions: `CREATE TABLE IF NOT EXISTS sessions (
    wxid TEXT PRIMARY KEY,
    messages TEXT,
    updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  )`,
};

/**
 * 运行迁移
 * @param {import('better-sqlite3').Database} db
 */
export function runMigrations(db) {
  let migrated = 0;

  // 1. 创建缺失的表
  for (const [table, sql] of Object.entries(EXPECTED_TABLES)) {
    const exists = db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [table]
    );
    if (!exists) {
      db.exec(sql);
      console.log(`📦 迁移：创建表 ${table}`);
      migrated++;
    }
  }

  // 2. 添加缺失的列
  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    const tableExists = db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [table]
    );
    if (!tableExists) continue;

    const existingCols = new Set(
      db.all(`PRAGMA table_info(${table})`).map((r) => r.name)
    );

    for (const [col, typeDef] of Object.entries(columns)) {
      if (!existingCols.has(col)) {
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef}`);
          console.log(`📦 迁移：${table}.${col} (${typeDef})`);
          migrated++;
        } catch (e) {
          console.warn(`⚠️ 迁移跳过 ${table}.${col}: ${e.message}`);
        }
      }
    }
  }

  // 3. 回填 files.size（已有记录的文件大小）
  const nullSizeCount = db.get("SELECT count(*) as cnt FROM files WHERE size IS NULL");
  if (nullSizeCount?.cnt > 0) {
    const rows = db.all("SELECT id, path, type FROM files WHERE size IS NULL AND type != 'link'");
    let filled = 0;
    for (const row of rows) {
      try {
        const stat = fs.statSync(row.path);
        db.exec("UPDATE files SET size = ? WHERE id = ?", [stat.size, row.id]);
        filled++;
      } catch {
        // 文件不存在于磁盘，设为 0
        db.exec("UPDATE files SET size = 0 WHERE id = ?", [row.id]);
        filled++;
      }
    }
    if (filled > 0) {
      console.log(`📦 回填：${filled} 条文件记录的 size`);
      migrated++;
    }
  }

  if (migrated > 0) {
    console.log(`📦 迁移完成：${migrated} 项变更`);
  }

  return migrated;
}
