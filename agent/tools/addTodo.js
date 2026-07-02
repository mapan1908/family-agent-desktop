/**
 * 添加待办
 *
 * 支持：
 *   - assignee: 提醒对象（NULL=自己，'all'=全家，'名字'=指定，多个用逗号）
 *   - body: 提醒正文/备注
 *   - remindBeforeMinutes: 提前几分钟提醒
 *   - repeatRule: 周期性（'daily' / 'weekly' / 'workdays' / 'monthly' / 自定义 cron）
 */

import { Type } from '@earendil-works/pi-ai';

export default {
  name: 'add_todo',
  label: '添加待办',
  description: '添加一条待办提醒。可以指定提醒时间、提醒对象、提醒正文、提前提醒。',
  parameters: Type.Object({
    title: Type.String({ description: '待办内容' }),
    remindAt: Type.Optional(Type.String({ description: '提醒时间（ISO 字符串）' })),
    assignee: Type.Optional(Type.String({ description: '提醒对象：留空=自己，"all"=全家，名字="妈妈"，多个用逗号' })),
    body: Type.Optional(Type.String({ description: '提醒正文/备注' })),
    remindBeforeMinutes: Type.Optional(Type.Number({ description: '提前几分钟提醒，默认 0' })),
    repeatRule: Type.Optional(Type.String({ description: '周期性：daily / weekly / workdays / monthly' })),
  }),

  async execute(toolCallId, params) {
    const title = params.title?.trim();
    if (!title) {
      return { content: [{ type: 'text', text: '待办内容不能为空' }], details: { ok: false } };
    }

    // 解析 assignee
    let assignee = null;
    if (params.assignee?.trim()) {
      const a = params.assignee.trim();
      assignee = a === 'all' ? 'all' : a;
    }

    // 验证 assignee 是否是已注册的家庭成员
    if (assignee && assignee !== 'all') {
      const names = assignee.split(',').map(s => s.trim());
      const invalid = [];
      for (const name of names) {
        const m = this.db.get('SELECT id FROM members WHERE name = ?', [name]);
        if (!m) invalid.push(name);
      }
      if (invalid.length > 0) {
        return {
          content: [{ type: 'text', text: `不认识这些家庭成员："${invalid.join('、')}"。先加为成员再提醒。` }],
          details: { ok: false, invalid },
        };
      }
    }

    const created = Date.now();
    this.db.exec(
      'INSERT INTO todos (title, remind_at, created_by, assignee, body, remind_before_minutes, repeat_rule, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [
        title,
        params.remindAt || null,
        this.memberName || 'unknown',  // 由 agent beforeToolCall 注入
        assignee,
        params.body || null,
        params.remindBeforeMinutes || 0,
        params.repeatRule || null,
        created,
      ]
    );
    const id = this.db.get('SELECT last_insert_rowid() as id')?.id;

    // 描述给用户
    const parts = ['✅ 已添加待办'];
    parts.push(title);
    if (params.remindAt) parts.push(`（${params.remindAt} 提醒）`);
    if (assignee === 'all') parts.push('（推给全家）');
    else if (assignee) parts.push(`（推给 ${assignee}）`);
    if (params.body) parts.push(`\n备注：${params.body}`);

    return {
      content: [{ type: 'text', text: parts.join(' ') }],
      details: { ok: true, id, title, assignee, remindAt: params.remindAt },
    };
  },
};