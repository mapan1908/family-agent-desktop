import { Type } from '@earendil-works/pi-ai';

export default {
  name: 'get_members',
  label: '查家庭成员',
  description: '列出家庭成员。可按名字模糊查找或按 wxid 精确查找。',
  parameters: Type.Object({
    name: Type.Optional(Type.String({ description: '按名字查找（模糊匹配）' })),
    wxid: Type.Optional(Type.String({ description: '按 wxid 精确查找' })),
  }),

  async execute(toolCallId, params) {
    let sql = 'SELECT id, wxid, name, role FROM members WHERE 1=1';
    const binds = [];

    if (params.name) {
      sql += ' AND name LIKE ?';
      binds.push(`%${params.name}%`);
    }
    if (params.wxid) {
      sql += ' AND wxid = ?';
      binds.push(params.wxid);
    }

    const rows = this.db.all(sql, binds);

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: '没有找到成员' }], details: [] };
    }

    const list = rows.map((r, i) =>
      `${i + 1}. ${r.name}（${r.role}）wxid=${r.wxid}`
    ).join('\n');

    return {
      content: [{ type: 'text', text: `家庭成员：\n${list}` }],
      details: rows,
    };
  },
};
