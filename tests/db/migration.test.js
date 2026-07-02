import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestEnv } from '../helpers.js';
import { runMigrations } from '../../db/migrate.js';

let env;

beforeAll(async () => {
  env = await createTestEnv();
});

afterAll(() => env.cleanup());

describe('数据库迁移', () => {
  it('files 表包含 size 列', () => {
    const cols = env.db.all('PRAGMA table_info(files)').map(c => c.name);
    expect(cols).toContain('size');
  });

  it('files 表包含所有预期列', () => {
    const cols = env.db.all('PRAGMA table_info(files)').map(c => c.name);
    const expected = ['id', 'name', 'path', 'from_user', 'date', 'type', 'tags',
      'summary', 'content', 'visibility', 'url', 'link_title', 'link_source', 'size', 'created'];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
  });

  it('todos 表包含所有预期列', () => {
    const cols = env.db.all('PRAGMA table_info(todos)').map(c => c.name);
    expect(cols).toContain('assignee');
    expect(cols).toContain('body');
    expect(cols).toContain('remind_before_minutes');
    expect(cols).toContain('visibility');
    expect(cols).toContain('last_pushed_at');
  });

  it('passwords 表包含 visibility 列', () => {
    const cols = env.db.all('PRAGMA table_info(passwords)').map(c => c.name);
    expect(cols).toContain('visibility');
  });

  it('sessions 表由 migrate.js 创建', () => {
    const tables = env.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'");
    expect(tables).toHaveLength(1);
    const cols = env.db.all('PRAGMA table_info(sessions)').map(c => c.name);
    expect(cols).toContain('wxid');
    expect(cols).toContain('messages');
    expect(cols).toContain('updated_at');
  });

  it('FTS5 虚拟表 idx_search 存在', () => {
    const tables = env.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='idx_search'");
    expect(tables).toHaveLength(1);
  });

  it('runMigrations 幂等：重复运行不报错', () => {
    const count1 = runMigrations(env.db);
    const count2 = runMigrations(env.db);
    expect(count1).toBe(0); // 已经迁移过了
    expect(count2).toBe(0);
  });
});
