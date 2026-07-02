/**
 * 只读数据库查询
 *
 * 只允许 SELECT，自动拦截写操作。
 * LLM 配合 system prompt 里的表结构说明，自行组合查询。
 */

import { Type } from '@earendil-works/pi-ai';

// 允许的 SQL 前缀（只读）
const ALLOWED = /^\s*(SELECT|PRAGMA\s+table_info|PRAGMA\s+index_list)/i;

// 拦截的关键词
const BLOCKED = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|EXEC|ATTACH)\b/i;

export default {
  name: 'query_db',
  description: `对数据库执行只读 SQL 查询。只能 SELECT，不能修改数据。

表结构：
- files: id, name, path, from_user(谁存的), date(YYYY-MM-DD), type(note/image/video/file/link), tags, summary, content, url, link_title, link_source, size(字节), visibility, created(毫秒时间戳)
- todos: id, title, remind_at(ISO时间), repeat_rule(daily/weekly/workdays/monthly), done(0/1), created_by, assignee, body, remind_before_minutes, visibility, created_at(毫秒时间戳)
- members: id, wxid, name, role(parent/member/guest)
- passwords: id, name, value, owner, visibility
- messages: id, wxid, name, text, reply, type, created_at(毫秒时间戳)`,
  parameters: Type.Object({
    sql: Type.String({ description: 'SELECT 查询语句' }),
  }),

  async execute(toolCallId, params) {
    const sql = params.sql?.trim();
    if (!sql) {
      return { content: [{ type: 'text', text: 'SQL 不能为空' }], details: null };
    }

    // 安全校验
    if (!ALLOWED.test(sql)) {
      return { content: [{ type: 'text', text: '只允许 SELECT 查询' }], details: null };
    }
    if (BLOCKED.test(sql)) {
      return { content: [{ type: 'text', text: '不允许修改数据的操作' }], details: null };
    }

    try {
      const rows = this.db.all(sql);
      if (rows.length === 0) {
        return { content: [{ type: 'text', text: '查询结果为空' }], details: [] };
      }
      // 格式化输出
      const preview = rows.slice(0, 20);
      const text = preview.map((r, i) => `${i + 1}. ${JSON.stringify(r)}`).join('\n');
      const extra = rows.length > 20 ? `\n...共 ${rows.length} 条，显示前 20 条` : '';
      return {
        content: [{ type: 'text', text: text + extra }],
        details: { rows: preview, total: rows.length },
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `查询失败：${e.message}` }], details: null };
    }
  },
};
