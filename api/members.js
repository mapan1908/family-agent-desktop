import { Router } from 'express';

export function router(db) {
  const r = Router();

  r.get('/', (_req, res) => {
    // 不返回 wxid（隐私）
    const rows = db.all('SELECT id, name, role FROM members ORDER BY role, name');
    res.json(rows);
  });

  r.post('/', (req, res) => {
    const { name, role, id } = req.body;

    if (id) {
      db.exec('UPDATE members SET role = ? WHERE id = ?', [role, id]);
    } else if (name) {
      db.exec('INSERT INTO members (name, role) VALUES (?, ?)', [name, role]);
    } else {
      return res.status(400).json({ error: 'missing name or id' });
    }
    res.json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing id' });
    const row = db.get('SELECT id, name FROM members WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'member not found' });
    db.exec('DELETE FROM members WHERE id = ?', [id]);
    res.json({ ok: true, deleted: row.name });
  });

  return r;
}
