/**
 * API: 聊天记录
 */
import { Router } from 'express';

export function router(db) {
  const r = Router();

  // 获取消息列表（支持分页和成员筛选）
  r.get('/', (req, res) => {
    const { wxid, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM messages';
    const params = [];

    if (wxid) {
      sql += ' WHERE wxid = ?';
      params.push(wxid);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    res.json(db.all(sql, params));
  });

  return r;
}
