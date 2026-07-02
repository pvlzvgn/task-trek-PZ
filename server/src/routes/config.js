import { db, getSetting, setSetting } from '../db.js';
import { isValidDateStr } from '../lib/dates.js';

export default async function configRoutes(app) {
  // ---- Типы дней ----
  app.get('/api/day-types', async () => {
    return db
      .prepare('SELECT * FROM day_types ORDER BY id')
      .all()
      .map((dt) => ({ ...dt, slots: JSON.parse(dt.slots) }));
  });

  app.post('/api/day-types', async (req, reply) => {
    const { name, label, slots, daily_capacity } = req.body || {};
    if (!name || !/^[a-z_][a-z0-9_]*$/.test(name)) return reply.code(400).send({ error: 'name: латиница/подчёркивания' });
    try {
      const info = db
        .prepare('INSERT INTO day_types (name, label, slots, daily_capacity) VALUES (?, ?, ?, ?)')
        .run(name, label || name, JSON.stringify(slots || []), daily_capacity ?? 3);
      const dt = db.prepare('SELECT * FROM day_types WHERE id = ?').get(info.lastInsertRowid);
      return reply.code(201).send({ ...dt, slots: JSON.parse(dt.slots) });
    } catch (err) {
      return reply.code(409).send({ error: 'тип дня с таким именем уже есть' });
    }
  });

  app.patch('/api/day-types/:id', async (req, reply) => {
    const dt = db.prepare('SELECT * FROM day_types WHERE id = ?').get(req.params.id);
    if (!dt) return reply.code(404).send({ error: 'тип дня не найден' });
    const { label, slots, daily_capacity } = req.body || {};
    db.prepare(
      'UPDATE day_types SET label = COALESCE(?, label), slots = COALESCE(?, slots), daily_capacity = COALESCE(?, daily_capacity) WHERE id = ?'
    ).run(
      label ?? null,
      slots !== undefined ? JSON.stringify(slots) : null,
      daily_capacity ?? null,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM day_types WHERE id = ?').get(req.params.id);
    return { ...updated, slots: JSON.parse(updated.slots) };
  });

  // ---- Ротация ----
  app.get('/api/rotations', async () => {
    return db
      .prepare('SELECT * FROM rotations ORDER BY starts_on DESC, id DESC')
      .all()
      .map((r) => ({ ...r, rules: JSON.parse(r.rules) }));
  });

  // Смена ротации = новая запись с датой начала; старые планы не трогаем
  app.post('/api/rotations', async (req, reply) => {
    const { starts_on, rules } = req.body || {};
    if (!isValidDateStr(starts_on)) return reply.code(400).send({ error: 'starts_on: формат YYYY-MM-DD' });
    if (!rules || typeof rules !== 'object') return reply.code(400).send({ error: 'rules: объект {"1": "office", …}' });
    const names = new Set(db.prepare('SELECT name FROM day_types').all().map((r) => r.name));
    for (const [wd, name] of Object.entries(rules)) {
      if (!/^[1-7]$/.test(wd)) return reply.code(400).send({ error: `rules: день недели 1–7, получено «${wd}»` });
      if (!names.has(name)) return reply.code(400).send({ error: `rules: неизвестный тип дня «${name}»` });
    }
    const info = db.prepare('INSERT INTO rotations (starts_on, rules) VALUES (?, ?)').run(starts_on, JSON.stringify(rules));
    const row = db.prepare('SELECT * FROM rotations WHERE id = ?').get(info.lastInsertRowid);
    return reply.code(201).send({ ...row, rules: JSON.parse(row.rules) });
  });

  app.delete('/api/rotations/:id', async (req, reply) => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM rotations').get().c;
    if (count <= 1) return reply.code(400).send({ error: 'нельзя удалить последнюю ротацию' });
    db.prepare('DELETE FROM rotations WHERE id = ?').run(req.params.id);
    return reply.code(204).send();
  });

  // ---- Настройки ----
  const PUBLIC_SETTINGS = ['quiet_hours_from', 'quiet_hours_to', 'notify_morning', 'notify_deadline', 'push_morning_time'];

  app.get('/api/settings', async () => {
    const out = {};
    for (const key of PUBLIC_SETTINGS) out[key] = getSetting(key);
    return out;
  });

  app.patch('/api/settings', async (req, reply) => {
    for (const [key, value] of Object.entries(req.body || {})) {
      if (!PUBLIC_SETTINGS.includes(key)) return reply.code(400).send({ error: `неизвестная настройка «${key}»` });
      setSetting(key, value);
    }
    const out = {};
    for (const key of PUBLIC_SETTINGS) out[key] = getSetting(key);
    return out;
  });
}
