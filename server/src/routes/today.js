import { buildPlan, addToPlan, removeFromPlan } from '../services/today.js';
import { todayStr, isValidDateStr } from '../lib/dates.js';
import { getTask } from '../services/tasks.js';

export default async function todayRoutes(app) {
  // План «Сегодня»: собирается при первом обращении за день, дальше отдаётся сохранённый
  app.get('/api/today', async (req, reply) => {
    const date = req.query.date || todayStr();
    if (!isValidDateStr(date)) return reply.code(400).send({ error: 'date: формат YYYY-MM-DD' });
    return buildPlan(date);
  });

  app.post('/api/today/rebuild', async (req, reply) => {
    const date = req.body?.date || todayStr();
    if (!isValidDateStr(date)) return reply.code(400).send({ error: 'date: формат YYYY-MM-DD' });
    return buildPlan(date, { rebuild: true });
  });

  // Ручное добавление/удаление — исключение, а не норма
  app.post('/api/today/tasks', async (req, reply) => {
    const date = req.body?.date || todayStr();
    const taskId = Number(req.body?.task_id);
    if (!taskId || !getTask(taskId)) return reply.code(400).send({ error: 'task_id: задача не найдена' });
    addToPlan(date, taskId);
    return buildPlan(date);
  });

  app.delete('/api/today/tasks/:taskId', async (req, reply) => {
    const date = req.query.date || todayStr();
    removeFromPlan(date, Number(req.params.taskId));
    return buildPlan(date);
  });
}
