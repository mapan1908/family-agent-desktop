import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestEnv, callTool } from '../helpers.js';

let env;

beforeAll(async () => {
  env = await createTestEnv();
});

afterAll(() => env.cleanup());

describe('get_current_date', () => {
  it('返回北京时间', async () => {
    const r = await callTool(env.tools, 'get_current_date', {});
    expect(r.content[0].text).toContain('北京时间');
    expect(r.content[0].text).toMatch(/\d{4}-\d{2}-\d{2}/); // YYYY-MM-DD
  });

  it('details 包含结构化数据', async () => {
    const r = await callTool(env.tools, 'get_current_date', {});
    expect(r.details.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.details.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(r.details.weekday).toMatch(/^[一二三四五六日]$/);
  });

  it('日期是合理的（2024-2030）', async () => {
    const r = await callTool(env.tools, 'get_current_date', {});
    const year = parseInt(r.details.date.slice(0, 4));
    expect(year).toBeGreaterThanOrEqual(2024);
    expect(year).toBeLessThanOrEqual(2030);
  });
});
