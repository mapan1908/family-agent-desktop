/**
 * 数据库 — better-sqlite3（支持 FTS5）
 */
import Database from 'better-sqlite3';
import jiebaMod from '@node-rs/jieba';
import fs from 'node:fs';
import path from 'node:path';

const jieba = new jiebaMod.Jieba();
const tokenize = (s) => {
  const text = s || '';
  const words = jieba.cut(text, true);
  // 单字
  const chars = text.match(/[\u4e00-\u9fa5]/g) || [];
  // 双字组合（提升相邻字面词召回率，例如“事项”中的“记”）
  const bigrams = [];
  const cnOnly = text.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const seg of cnOnly) {
    for (let i = 0; i < seg.length - 1; i++) {
      bigrams.push(seg.slice(i, i + 2));
    }
  }
  return [...new Set([...words, ...chars, ...bigrams])].join(' ');
};

let db = null;

export async function initDB(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 建表
  const schema = fs.readFileSync(
    path.join(import.meta.dirname, 'schema.sql'), 'utf-8'
  );
  db.exec(schema);

  // 补索引：path 字段去重查询用
  db.exec('CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)');
  // partial UNIQUE：实体文件入库去重，link 虚拟路径允许重复
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path_unique ON files(path) WHERE path != '(virtual)'");


  // 统一 API 包装
  db.all = (sql, params = []) => db.prepare(sql).all(...params);
  db.get = (sql, params = []) => db.prepare(sql).get(...params);
  db.exec = (sql, params = []) => db.prepare(sql).run(...params);

  // FTS5 全文索引（jieba 分词 + 单字兜底）

  db.indexItem = (sourceTable, sourceId, title, body, owner, visibility) => {
    db.prepare(
      'INSERT OR REPLACE INTO idx_search(source_table, source_id, title, body, owner, visibility) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sourceTable, sourceId, tokenize(title), tokenize(body), owner || '', visibility || 'family');
  };

  db.removeIndex = (sourceTable, sourceId) => {
    db.prepare('DELETE FROM idx_search WHERE source_table = ? AND source_id = ?')
      .run(sourceTable, sourceId);
  };

  db.ftsSearch = (query, limit = 20) => {
    const terms = tokenize(query).split(/\s+/).filter(Boolean).map(t => `"${t}"*`);
    const safeQuery = [...new Set(terms)].join(' OR ');
    return db.prepare(
      `SELECT source_table, source_id, title, body, owner, visibility, rank
       FROM idx_search WHERE idx_search MATCH ? AND rank <= -3.0 ORDER BY rank LIMIT ?`
    ).all(safeQuery, limit);
  };

  // 重建全量索引
  db.rebuildFTS = () => {
    db.exec('DELETE FROM idx_search');
    const files = db.prepare(`SELECT id, name, COALESCE(tags,'')||' '||COALESCE(content,'') as body, from_user, COALESCE(visibility,'family') as visibility FROM files`).all();
    for (const f of files) db.indexItem('files', f.id, f.name, f.body, f.from_user, f.visibility);
    const pwds = db.prepare(`SELECT id, name, value, owner, COALESCE(visibility,'family') as visibility FROM passwords`).all();
    for (const p of pwds) db.indexItem('passwords', p.id, p.name, p.value, p.owner, p.visibility);
    const todos = db.prepare(`SELECT id, title, created_by, COALESCE(visibility,'family') as visibility FROM todos`).all();
    for (const t of todos) db.indexItem('todos', t.id, t.title, '', t.created_by, t.visibility);
    console.log('🔍 FTS 索引重建完成');
  };

  // 首次重建索引
  db.rebuildFTS();

  console.log('📦 数据库已加载');
  return db;
}

export function getDB() {
  if (!db) throw new Error('数据库未初始化');
  return db;
}
