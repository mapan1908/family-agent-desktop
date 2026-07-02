-- 家庭 Agent 数据库
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS members (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  wxid  TEXT UNIQUE,
  name  TEXT NOT NULL,
  role  TEXT DEFAULT 'member'  -- parent / member / guest
);

CREATE TABLE IF NOT EXISTS files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT,
  path       TEXT,
  from_user  TEXT,
  date       TEXT,
  type       TEXT,             -- note / image / video / file / link
  tags       TEXT,
  summary    TEXT,
  content    TEXT,
  visibility TEXT DEFAULT 'family',  -- family / private
  url        TEXT,             -- link 类型特有
  link_title TEXT,             -- link 类型特有
  link_source TEXT,            -- link 来源平台（抖好/小红书/...）
  size        INTEGER,         -- 文件大小（字节），link 类型为 NULL
  created    INTEGER DEFAULT (strftime('%s','now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(from_user);

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT,
  remind_at   TEXT,
  repeat_rule TEXT,
  done        INTEGER DEFAULT 0,
  created_by  TEXT,
  assignee    TEXT,                                  -- 提醒对象：NULL=创建者本人，'all'=全家，'名字1,名字2'=指定
  body        TEXT,                                  -- 提醒正文/备注
  remind_before_minutes INTEGER DEFAULT 0,           -- 提前几分钟提醒
  last_pushed_at INTEGER DEFAULT 0,                  -- 上次推送时间戳（防重复推）
  visibility  TEXT DEFAULT 'family',  -- family / private
  created_at  INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wxid       TEXT,
  name       TEXT,
  text       TEXT,
  reply      TEXT,
  type       TEXT DEFAULT 'text',
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_messages_wxid ON messages(wxid);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(created_at);

CREATE TABLE IF NOT EXISTS passwords (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT,
  value      TEXT,
  owner      TEXT,
  visibility TEXT DEFAULT 'family'  -- family / private
);

-- FTS5 全文搜索索引（跨 files + passwords + todos）
CREATE VIRTUAL TABLE IF NOT EXISTS idx_search USING fts5(
  source_table,     -- 'files' | 'passwords' | 'todos'
  source_id,        -- 对应表的 id
  title,            -- 可搜索标题
  body,             -- 可搜索正文
  owner,            -- 谁存的
  visibility,       -- family / private
  tokenize='unicode61'
);
