/**
 * 删除文件（笔记 / 图片 / 其它）
 *
 * 由 beforeToolCall 钩子拦截：必须先在最近对话里出现"确认删除"才能执行。
 */

import fs from 'node:fs/promises';
import { Type } from '@earendil-works/pi-ai';

export default {
  name: 'delete_file',
  label: '删除文件',
  description: '删除一个文件/笔记。会同时从 FTS 索引移除。需要先 search_file 拿到 id。',
  parameters: Type.Object({
    id: Type.Number({ description: '文件的 id' }),
  }),

  async execute(toolCallId, params) {
    const row = this.db.get('SELECT * FROM files WHERE id = ?', [params.id]);
    if (!row) {
      return { content: [{ type: 'text', text: `找不到 id=${params.id} 的文件` }], details: null };
    }
    try {
      await fs.unlink(row.path);
    } catch (e) {
      // 文件可能不存在，继续删索引
    }
    this.db.exec('DELETE FROM files WHERE id = ?', [row.id]);
    this.db.removeIndex('files', row.id);
    return {
      content: [{ type: 'text', text: `🗑️ 已删除：${row.name}` }],
      details: { id: row.id, name: row.name },
    };
  },
};