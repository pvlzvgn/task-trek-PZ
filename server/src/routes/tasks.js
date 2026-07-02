import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  reopenTask,
  validateTaskFields,
} from '../services/tasks.js';
import { parseQuickInput } from '../lib/quickparse.js';
import { syncTaskEvent, isConnected } from '../services/gcal.js';
import { db } from '../db.js';

// Синк в GCal в фоне: не блокируем ответ API и не роняем запрос при сбое календаря
function syncInBackground(task) {
  if (!isConnected() || !task) return;
  syncTaskEvent(task)
    .then((eventId) => {
      if ((eventId ?? null) !== (task.gcal_event_id ?? null)) {
        db.prepare('UPDATE tasks SET gcal_event_id = ? WHERE id = ?').run(eventId, task.id);
      }
    })
    .catch((err) => console.error('[gcal] синк задачи не удался:', err.message));
}

export default async function tasksRoutes(app) {
  app.get('/api/tasks', async (req) => {
    const { status, domain, day_context, week_flag } = req.query;
    return listTasks({
      status,
      domain,
      day_context,
      week_flag: week_flag === undefined ? undefined : week_flag === '1' || week_flag === 'true',
    });
  });

  app.post('/api/tasks', async (req, reply) => {
    const { errors, fields } = validateTaskFields(req.body || {});
    if (errors.length) return reply.code(400).send({ errors });
    const task = createTask(fields);
    syncInBackground(task);
    return reply.code(201).send(task);
  });

  // Быстрый ввод: одно текстовое поле, синтаксис «! @дата»
  app.post('/api/tasks/quick', async (req, reply) => {
    const text = (req.body?.text || '').trim();
    if (!text) return reply.code(400).send({ errors: ['text обязателен'] });
    const parsed = parseQuickInput(text);
    if (!parsed.title) return reply.code(400).send({ errors: ['после разбора синтаксиса не осталось названия'] });
    const task = createTask({
      title: parsed.title,
      week_flag: parsed.week_flag,
      deadline: parsed.deadline,
    });
    return reply.code(201).send(task);
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: 'задача не найдена' });
    return task;
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    if (!getTask(req.params.id)) return reply.code(404).send({ error: 'задача не найдена' });
    const { errors, fields } = validateTaskFields(req.body || {}, { partial: true });
    if (errors.length) return reply.code(400).send({ errors });
    const task = updateTask(req.params.id, fields);
    syncInBackground(task);
    return task;
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: 'задача не найдена' });
    // событие в календаре убираем до удаления записи
    syncInBackground({ ...task, status: 'done', hard_deadline: false });
    deleteTask(req.params.id);
    return reply.code(204).send();
  });

  app.post('/api/tasks/:id/complete', async (req, reply) => {
    if (!getTask(req.params.id)) return reply.code(404).send({ error: 'задача не найдена' });
    const task = completeTask(req.params.id);
    syncInBackground(task);
    return task;
  });

  app.post('/api/tasks/:id/reopen', async (req, reply) => {
    if (!getTask(req.params.id)) return reply.code(404).send({ error: 'задача не найдена' });
    const task = reopenTask(req.params.id);
    syncInBackground(task);
    return task;
  });
}
