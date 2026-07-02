/**
 * 存储密码/Token/密钥
 *
 * 由 beforeToolCall 钩子或 Agent 调用。存到 passwords 表 + 写入 FTS 索引。
 */

import { Type } from '@earendil-works/pi-ai';

export default {
  name: 'store_password',
  label: '存储密码',
  description: '把一段密码/Token/密钥存起来。需要提供名字（如"路由器后台"）和值。',
  parameters: Type.Object({
    name: Type.String({ description: '这条密码的名字，如"路由器后台"、"微信小程序 key"' }),
    value: Type.String({ description: '密码/Token 的值' }),
    owner: Type.Optional(Type.String({ description: '谁的，缺省从上下文取' })),
  }),

  async execute(toolCallId, params) {
    if (!params.name?.trim() || !params.value?.trim()) {
      return { content: [{ type: 'text', text: '名字和值都不能为空' }], details: null };
    }
    const owner = params.owner || '家庭';
    this.db.exec(
      'INSERT INTO passwords (name, value, owner, visibility) VALUES (?,?,?,?)',
      [params.name.trim(), params.value.trim(), owner, 'family']
    );
    const id = this.db.get('SELECT last_insert_rowid() as id')?.id;
    if (id) this.db.indexItem('passwords', id, params.name, params.value, owner, 'family');
    return {
      content: [{ type: 'text', text: `🔐 已存密码：${params.name}（${owner}）` }],
      details: { id, name: params.name },
    };
  },
};