import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestEnv, callTool, findTool } from '../helpers.js';

let env;

beforeAll(async () => {
  env = await createTestEnv();
  const { db } = env;

  // 插入测试数据
  db.exec("INSERT INTO members (wxid, name, role) VALUES (?, ?, ?)", ['wx1', '妈妈', 'parent']);
  db.exec("INSERT INTO files (name, path, from_user, date, type, content, size) VALUES (?,?,?,?,?,?,?)",
    ['test.txt', '/tmp/test.txt', '妈妈', '2026-07-01', 'note', 'hello', 100]);
});

afterAll(() => env.cleanup());

describe('query_db', () => {
  it('SELECT 查询正常', async () => {
    const r = await callTool(env.tools, 'query_db', { sql: 'SELECT count(*) as cnt FROM members' });
    expect(r.content[0].text).toContain('cnt');
    expect(r.content[0].text).toContain('1');
  });

  it('description 包含完整 schema', () => {
    const qd = findTool(env.tools, 'query_db');
    expect(qd.description).toContain('files:');
    expect(qd.description).toContain('todos:');
    expect(qd.description).toContain('members:');
    expect(qd.description).toContain('passwords:');
    expect(qd.description).toContain('messages:');
    expect(qd.description).toContain('size(字节)');
  });

  it('INSERT 被拦截', async () => {
    const r = await callTool(env.tools, 'query_db', { sql: 'INSERT INTO members (name) VALUES ("hack")' });
    expect(r.content[0].text).toContain('只允许');
  });

  it('DELETE 被拦截', async () => {
    const r = await callTool(env.tools, 'query_db', { sql: 'DELETE FROM members WHERE 1=1' });
    expect(r.content[0].text).toContain('只允许 SELECT');
  });

  it('DROP 被拦截', async () => {
    const r = await callTool(env.tools, 'query_db', { sql: 'DROP TABLE members' });
    expect(r.content[0].text).toContain('只允许');
  });

  it('PRAGMA table_info 允许', async () => {
    const r = await callTool(env.tools, 'query_db', { sql: 'PRAGMA table_info(files)' });
    expect(r.content[0].text).toContain('name');
    expect(r.content[0].text).toContain('size');
  });

  it('空 SQL 返回提示', async () => {
    const r = await callTool(env.tools, 'query_db', { sql: '' });
    expect(r.content[0].text).toContain('不能为空');
  });

  it('查询结果为空返回提示', async () => {
    const r = await callTool(env.tools, 'query_db', { sql: "SELECT * FROM members WHERE name = '不存在'" });
    expect(r.content[0].text).toContain('为空');
  });

  it('size 字段可查', async () => {
    const r = await callTool(env.tools, 'query_db', { sql: 'SELECT size FROM files LIMIT 1' });
    expect(r.content[0].text).toContain('100');
  });
});
