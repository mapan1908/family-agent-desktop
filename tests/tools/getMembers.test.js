import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestEnv, callTool } from '../helpers.js';

let env;

beforeAll(async () => {
  env = await createTestEnv();
  // 插入测试成员
  env.db.exec("INSERT INTO members (wxid, name, role) VALUES (?, ?, ?)", ['wxid_mom', '妈妈', 'parent']);
  env.db.exec("INSERT INTO members (wxid, name, role) VALUES (?, ?, ?)", ['wxid_dad', '爸爸', 'parent']);
  env.db.exec("INSERT INTO members (wxid, name, role) VALUES (?, ?, ?)", ['wxid_kid', '小明', 'member']);
});

afterAll(() => env.cleanup());

describe('get_members', () => {
  it('列出全部成员', async () => {
    const r = await callTool(env.tools, 'get_members', {});
    expect(r.content[0].text).toContain('妈妈');
    expect(r.content[0].text).toContain('爸爸');
    expect(r.content[0].text).toContain('小明');
    expect(r.details).toHaveLength(3);
  });

  it('按名字模糊查找', async () => {
    const r = await callTool(env.tools, 'get_members', { name: '妈' });
    expect(r.details).toHaveLength(1);
    expect(r.details[0].name).toBe('妈妈');
  });

  it('按 wxid 精确查找', async () => {
    const r = await callTool(env.tools, 'get_members', { wxid: 'wxid_dad' });
    expect(r.details).toHaveLength(1);
    expect(r.details[0].name).toBe('爸爸');
  });

  it('查不到返回提示', async () => {
    const r = await callTool(env.tools, 'get_members', { name: '不存在' });
    expect(r.content[0].text).toContain('没有找到');
    expect(r.details).toHaveLength(0);
  });
});
