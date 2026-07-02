/**
 * 列出待办
 *
 * 支持：
 *   - onlyOpen: 只看未完成
 *   - forMember: 看指定成员的
 *   - sinceDate / untilDate: 按提醒时间筛选
 */

import { Type } from '@earendil-works/pi-ai';

export default {
  name: 'list_todos',
  label: '查看待办',
  description: '列出待办。支持按成员、时间范围筛选。',
  parameters: Type.Object({
    onlyOpen: Type.Optional(Type.Boolean({ description: '只看未完成，默认 true' })),
    forMember: Type.Optional(Type.String({ description: '只看某成员的（创建者=自己 / assignee=我 / assignee=全家）' })),
    sinceDate: Type.Optional(Type.String({ description: '提醒时间起始，YYYY-MM-DD（如"今天"传今天日期）' })),
    untilDate: Type.Optional(Type.String({ description: '提醒时间截止，YYYY-MM-DD' })),
  }),

  async execute(toolCallId, params) {
    const onlyOpen = params.onlyOpen !== false;
    let sql = 'SELECT * FROM todos WHERE 1=1';
    const binds = [];

    if (onlyOpen) sql += ' AND done = 0';

    if (params.forMember) {
      const m = params.forMember.trim();
      sql += ' AND (created_by = ? OR assignee = ? OR assignee = ?)';
      binds.push(m, m, 'all');
    }

    if (params.sinceDate) {
      sql += ' AND remind_at >= ?';
      binds.push(params.sinceDate);
    }
    if (params.untilDate) {
      // untilDate 当天 23:59:59
      sql += ' AND remind_at < ?';
      binds.push(params.untilDate + 'T23:59:59+08:00');
    }

    sql += ' ORDER BY remind_at ASC NULLS LAST, created_at DESC LIMIT 50';

    try {
      const rows = this.db.all(sql, binds);
      if (rows.length === 0) {
        return {
          content: [{ type: 'text', text: onlyOpen ? '没有未完成的待办～' : '还没有任何待办' }],
          details: [],
        };
      }
      const list = rows.map((r, i) => {
        const status = r.done ? '✅' : '📋';
        const remind = r.remind_at ? `⏰ ${r.remind_at}` : '';
        const to = r.assignee ? `→ ${r.assignee === 'all' ? '全家' : r.assignee}` : '';
        const body = r.body ? `\n   ${r.body}` : '';
        return `${i + 1}. ${status} ${r.title}${remind ? ' ' + remind : ''}${to ? ' ' + to : ''}${body}`;
      }).join('\n');
      return {
        content: [{ type: 'text', text: `共 ${rows.length} 条待办：\n${list}` }],
        details: rows,
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `查询失败：${e.message}` }], details: [] };
    }
  },
};