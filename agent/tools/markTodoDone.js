/**
 * 标记待办完成
 */

import { Type } from '@earendil-works/pi-ai';

export default {
  name: 'mark_todo_done',
  label: '完成待办',
  description: '把某条待办标记为已完成。需要先 list_todos 拿到 id。',
  parameters: Type.Object({
    id: Type.Number({ description: '待办的 id' }),
  }),

  async execute(toolCallId, params) {
    const row = this.db.get('SELECT * FROM todos WHERE id = ?', [params.id]);
    if (!row) {
      return { content: [{ type: 'text', text: `找不到 id=${params.id} 的待办` }], details: null };
    }
    if (row.done) {
      return { content: [{ type: 'text', text: `这条已经完成了：${row.title}` }], details: row };
    }
    this.db.exec('UPDATE todos SET done = 1 WHERE id = ?', [params.id]);
    return {
      content: [{ type: 'text', text: `✅ 已完成：${row.title}` }],
      details: { id: row.id, title: row.title },
    };
  },
};