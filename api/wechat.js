/**
 * API: 微信绑定
 */
import { Router } from 'express';

export function router(pool) {
  const r = Router();

  // 为指定成员生成绑定二维码
  r.post('/bind', (req, res) => {
    const { memberId, memberName } = req.body;
    if (!memberId || !memberName) return res.status(400).json({ error: '缺少 memberId/memberName' });
    pool.startBindFor(memberId, memberName);
    res.json({ ok: true });
  });

  // 轮询状态
  r.get('/status', (_req, res) => {
    res.json(pool.getBindState());
  });

  // 解绑成员
  r.post('/unbind', async (req, res) => {
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ error: '缺少 memberId' });
    try {
      await pool.unbind(memberId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 所有 Bot 状态（调试用）
  r.get('/bots', (_req, res) => {
    res.json(pool.getAllStates());
  });

  return r;
}
