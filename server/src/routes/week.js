import { db } from '../db.js';
import { todayStr, addDays, mondayOf, isValidDateStr } from '../lib/dates.js';
import { dayTypeFor } from '../lib/rotation.js';
import { rowToTask } from '../services/tasks.js';
import { listEventsSafe } from '../services/gcal.js';

export default async function weekRoutes(app) {
  // Обзор недели по типам дней: дедлайны, назначенные задачи, события, счётчик тренировок
  app.get('/api/week', async (req, reply) => {
    const anchor = req.query.start || todayStr();
    if (!isValidDateStr(anchor)) return reply.code(400).send({ error: 'start: формат YYYY-MM-DD' });
    const monday = mondayOf(anchor);
    const sunday = addDays(monday, 6);

    const events = await listEventsSafe(monday, sunday);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const dayType = dayTypeFor(date);
      const deadlines = db
        .prepare(`SELECT * FROM tasks WHERE deadline = ? AND status != 'done' ORDER BY hard_deadline DESC, id ASC`)
        .all(date)
        .map(rowToTask);
      const scheduled = db
        .prepare(`SELECT * FROM tasks WHERE scheduled_date = ? AND status != 'done' ORDER BY id ASC`)
        .all(date)
        .map(rowToTask);
      days.push({
        date,
        day_type: { name: dayType.name, label: dayType.label },
        deadlines,
        scheduled,
        events: events.filter((ev) => String(ev.start).slice(0, 10) === date),
      });
    }

    // Тренировки на этой неделе: fitness-задачи — сделанные и запланированные
    const fitnessDone = db
      .prepare(
        `SELECT COUNT(*) AS c FROM tasks WHERE domain = 'fitness' AND status = 'done'
         AND date(completed_at) BETWEEN ? AND ?`
      )
      .get(monday, sunday).c;
    const fitnessPlanned = db
      .prepare(
        `SELECT COUNT(*) AS c FROM tasks WHERE domain = 'fitness' AND status != 'done'
         AND ((scheduled_date BETWEEN ? AND ?) OR (deadline BETWEEN ? AND ?) OR week_flag = 1)`
      )
      .get(monday, sunday, monday, sunday).c;

    return {
      monday,
      sunday,
      days,
      fitness: { done: fitnessDone, planned: fitnessPlanned, goal: 4 },
    };
  });
}
