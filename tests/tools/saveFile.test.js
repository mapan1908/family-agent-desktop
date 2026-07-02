import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestEnv, callTool } from '../helpers.js';
import fs from 'node:fs';
import path from 'node:path';

let env;

beforeAll(async () => {
  env = await createTestEnv();
});

afterAll(() => env.cleanup());

describe('save_file 记录 size', () => {
  it('文本文件入库带 size', async () => {
    const content = '这是一段测试内容，用来验证 size 字段';
    const r = await callTool(env.tools, 'save_file', {
      content,
      fileName: '测试笔记.txt',
    });
    expect(r.content[0].text).toContain('已存');

    // 查数据库验证 size
    const row = env.db.get('SELECT * FROM files ORDER BY id DESC LIMIT 1');
    expect(row.name).toBe('测试笔记.txt');
    expect(row.size).toBeGreaterThan(0);
    expect(row.size).toBe(Buffer.byteLength(content, 'utf-8'));
  });

  it('空内容文件 size 为 0', async () => {
    await callTool(env.tools, 'save_file', {
      content: '',
      fileName: '空文件.txt',
    });
    const row = env.db.get('SELECT * FROM files ORDER BY id DESC LIMIT 1');
    expect(row.size).toBe(0);
  });

  it('中文内容 size 按 UTF-8 字节计算', async () => {
    const content = '你好世界'; // 4 个中文字 = 12 字节
    await callTool(env.tools, 'save_file', {
      content,
      fileName: '中文.txt',
    });
    const row = env.db.get('SELECT * FROM files ORDER BY id DESC LIMIT 1');
    expect(row.size).toBe(12);
  });
});

describe('store_password 不受影响', () => {
  it('密码入库正常', async () => {
    const r = await callTool(env.tools, 'store_password', {
      name: '测试密码',
      value: 'secret123',
    });
    expect(r.content[0].text).toContain('已存密码');
  });
});
