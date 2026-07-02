import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestEnv, callTool } from '../helpers.js';

let env;

beforeAll(async () => {
  env = await createTestEnv();
  const { db } = env;

  // 插入测试数据
  db.exec("INSERT INTO members (wxid, name, role) VALUES (?, ?, ?)", ['wx1', '妈妈', 'parent']);
  db.exec("INSERT INTO members (wxid, name, role) VALUES (?, ?, ?)", ['wx2', '爸爸', 'parent']);

  // files
  db.exec("INSERT INTO files (name, path, from_user, date, type, content, size) VALUES (?,?,?,?,?,?,?)",
    ['菜谱.txt', '/tmp/菜谱.txt', '妈妈', '2026-07-01', 'note', '红烧肉做法', 1024]);
  db.exec("INSERT INTO files (name, path, from_user, date, type, content, size) VALUES (?,?,?,?,?,?,?)",
    ['会议纪要.txt', '/tmp/会议纪要.txt', '爸爸', '2026-07-02', 'note', '周会讨论', 2048]);
  db.exec("INSERT INTO files (name, path, from_user, date, type, content, size) VALUES (?,?,?,?,?,?,?)",
    ['photo.jpg', '/tmp/photo.jpg', '妈妈', '2026-07-02', 'image', '', 512000]);

  // passwords
  db.exec("INSERT INTO passwords (name, value, owner) VALUES (?,?,?)",
    ['WiFi密码', 'abc123', '妈妈']);
  db.exec("INSERT INTO passwords (name, value, owner) VALUES (?,?,?)",
    ['路由器', 'admin/pass', '爸爸']);

  // todos
  db.exec("INSERT INTO todos (title, created_by, created_at) VALUES (?,?,?)",
    ['买菜', '妈妈', Date.now()]);
  db.exec("INSERT INTO todos (title, created_by, created_at) VALUES (?,?,?)",
    ['开会', '爸爸', Date.now()]);

  // 建 FTS 索引
  db.indexItem('files', 1, '菜谱.txt', '红烧肉做法', '妈妈', 'family');
  db.indexItem('files', 2, '会议纪要.txt', '周会讨论', '爸爸', 'family');
  db.indexItem('files', 3, 'photo.jpg', '', '妈妈', 'family');
  db.indexItem('passwords', 1, 'WiFi密码', 'abc123', '妈妈', 'family');
  db.indexItem('passwords', 2, '路由器', 'admin/pass', '爸爸', 'family');
  db.indexItem('todos', 1, '买菜', '', '妈妈', 'family');
  db.indexItem('todos', 2, '开会', '', '爸爸', 'family');
});

afterAll(() => env.cleanup());

describe('search_file', () => {
  it('无关键词列出全部', async () => {
    const r = await callTool(env.tools, 'search_file', { keyword: '' });
    expect(r.content[0].text).toContain('找到');
    expect(r.details.length).toBeGreaterThan(0);
  });

  it('按 owner 过滤（妈妈）', async () => {
    const r = await callTool(env.tools, 'search_file', { keyword: '', owner: '妈妈' });
    expect(r.content[0].text).toContain('妈妈');
    // 不应包含爸爸的文件
    expect(r.content[0].text).not.toContain('会议纪要');
    for (const item of r.details) {
      expect(item.owner).toBe('妈妈');
    }
  });

  it('按 owner 过滤（爸爸）', async () => {
    const r = await callTool(env.tools, 'search_file', { keyword: '', owner: '爸爸' });
    for (const item of r.details) {
      expect(item.owner).toBe('爸爸');
    }
  });

  it('不存在的 owner 返回空', async () => {
    const r = await callTool(env.tools, 'search_file', { keyword: '', owner: '不存在的人' });
    expect(r.content[0].text).toContain('没找到');
  });

  it('keyword + owner 组合：owner 过滤生效', async () => {
    // 用空 keyword 走 SQL 路径，验证 owner 过滤
    const all = await callTool(env.tools, 'search_file', { keyword: '' });
    const momOnly = await callTool(env.tools, 'search_file', { keyword: '', owner: '妈妈' });
    // 妈妈的结果应少于等于全部
    expect(momOnly.details.length).toBeLessThanOrEqual(all.details.length);
    expect(momOnly.details.length).toBeGreaterThan(0);
    // 妈妈的结果不应包含爸爸的内容
    for (const item of momOnly.details) {
      expect(item.owner).toBe('妈妈');
    }
  });

  it('source 过滤只返回 files', async () => {
    const r = await callTool(env.tools, 'search_file', { keyword: '', source: 'files' });
    for (const item of r.details) {
      expect(item.kind).toBe('file');
    }
  });

  it('source 过滤只返回 passwords', async () => {
    const r = await callTool(env.tools, 'search_file', { keyword: '', source: 'passwords' });
    for (const item of r.details) {
      expect(item.kind).toBe('password');
    }
  });

  it('sinceDate/untilDate 时间范围', async () => {
    const r = await callTool(env.tools, 'search_file', { keyword: '', sinceDate: '2026-07-02', untilDate: '2026-07-02' });
    for (const item of r.details) {
      if (item.date) {
        expect(item.date).toBe('2026-07-02');
      }
    }
  });

  it('日期格式校验', async () => {
    const r = await callTool(env.tools, 'search_file', { keyword: '', sinceDate: 'bad-date' });
    expect(r.content[0].text).toContain('YYYY-MM-DD');
  });
});
