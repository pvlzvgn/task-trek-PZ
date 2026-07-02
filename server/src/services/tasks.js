import { db } from '../db.js';

const DOMAINS = ['pa_practice', 'fitness', 'piano', 'finance', 'health', 'life'];
const CONTEXTS = ['office', 'remote', 'weekend', 'any'];
const EFFORTS = ['quick', 'normal', 'deep'];
const STATUSES = ['inbox', 'active', 'done', 'someday'];

export function rowToTask(row) {
  if (!row) return null;
  return {
    ...row,
    hard_deadline: !!row.hard_deadline,
    week_flag: !!row.week_flag,
  };
}

export function getTask(id) {
  return rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
}

export function listTasks({ status, domain, day_context, week_flag } = {}) {
  const where = [];
  const params = [];
  if (status) {
    const statuses = String(status).split(',');
    where.push(`status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (domain) {
    where.push('domain = ?');
    params.push(domain);
  }
  if (day_context) {
    where.push('day_context = ?');
    params.push(day_context);
  }
  if (week_flag !== undefined) {
    where.push('week_flag = ?');
    params.push(week_flag ? 1 : 0);
  }
  const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`;
  return db.prepare(sql).all(...params).map(rowToTask);
}

// Валидирует и нормализует поля задачи; возвращает { errors, fields }
export function validateTaskFields(body, { partial = false } = {}) {
  const errors = [];
  const fields = {};

  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) errors.push('title обязателен');
    else fields.title = title;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push(`status: один из ${STATUSES.join('|')}`);
    else fields.status = body.status;
  }
  if (body.domain !== undefined) {
    if (body.domain !== null && !DOMAINS.includes(body.domain)) errors.push(`domain: один из ${DOMAINS.join('|')}`);
    else fields.domain = body.domain;
  }
  if (body.day_context !== undefined) {
    if (body.day_context !== null && !CONTEXTS.includes(body.day_context)) errors.push(`day_context: один из ${CONTEXTS.join('|')}`);
    else fields.day_context = body.day_context;
  }
  if (body.effort !== undefined) {
    if (!EFFORTS.includes(body.effort)) errors.push(`effort: один из ${EFFORTS.join('|')}`);
    else fields.effort = body.effort;
  }
  if (body.deadline !== undefined) {
    if (body.deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) errors.push('deadline: формат YYYY-MM-DD');
    else fields.deadline = body.deadline;
  }
  if (body.scheduled_date !== undefined) {
    if (body.scheduled_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_date)) errors.push('scheduled_date: формат YYYY-MM-DD');
    else fields.scheduled_date = body.scheduled_date;
  }
  if (body.hard_deadline !== undefined) fields.hard_deadline = body.hard_deadline ? 1 : 0;
  if (body.week_flag !== undefined) fields.week_flag = body.week_flag ? 1 : 0;

  return { errors, fields };
}

export function createTask(fields) {
  const info = db
    .prepare(
      `INSERT INTO tasks (title, status, domain, day_context, deadline, hard_deadline, effort, week_flag, scheduled_date)
       VALUES (@title, @status, @domain, @day_context, @deadline, @hard_deadline, @effort, @week_flag, @scheduled_date)`
    )
    .run({
      status: 'inbox',
      domain: null,
      day_context: null,
      deadline: null,
      hard_deadline: 0,
      effort: 'normal',
      week_flag: 0,
      scheduled_date: null,
      ...fields,
    });
  return getTask(info.lastInsertRowid);
}

export function updateTask(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return getTask(id);
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE tasks SET ${sets} WHERE id = @id`).run({ ...fields, id });
  return getTask(id);
}

export function deleteTask(id) {
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
}

export function completeTask(id) {
  db.prepare(
    "UPDATE tasks SET status = 'done', completed_at = datetime('now') WHERE id = ?"
  ).run(id);
  return getTask(id);
}

export function reopenTask(id) {
  db.prepare("UPDATE tasks SET status = 'active', completed_at = NULL WHERE id = ?").run(id);
  return getTask(id);
}
