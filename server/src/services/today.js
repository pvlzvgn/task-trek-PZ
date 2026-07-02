import { db } from '../db.js';
import { dayTypeFor } from '../lib/rotation.js';
import { todayStr, isoWeekday } from '../lib/dates.js';
import { rowToTask } from './tasks.js';
import { listEventsSafe, isConnected } from './gcal.js';

// ---- Ёмкость дня с учётом занятости ----

// Сколько часов таймированных событий пересекается с «рабочим окном» дня 08:00–22:00
function busyHours(events, dateStr) {
  const windowStart = new Date(`${dateStr}T08:00:00`);
  const windowEnd = new Date(`${dateStr}T22:00:00`);
  let ms = 0;
  for (const ev of events) {
    if (ev.all_day) continue;
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    const from = s > windowStart ? s : windowStart;
    const to = e < windowEnd ? e : windowEnd;
    if (to > from) ms += to - from;
  }
  return ms / 3600000;
}

// Эффективная ёмкость: базовая минус занятые слоты (клиенты пн/вт) минус события календаря
export function effectiveCapacity(dayType, dateStr, events) {
  let capacity = dayType.daily_capacity;
  const weekday = isoWeekday(dateStr);

  for (const slot of dayType.slots || []) {
    if (Array.isArray(slot.busy_weekdays) && slot.busy_weekdays.includes(weekday)) {
      capacity -= 1; // слот целиком занят (например, вечер с клиентами)
    }
  }

  // каждые ~3 часа встреч съедают одну задачу из плана
  capacity -= Math.floor(busyHours(events, dateStr) / 3);

  return Math.max(1, capacity);
}

// ---- Сборка кандидатов ----

function contextMatches(task, dayTypeName) {
  return !task.day_context || task.day_context === 'any' || task.day_context === dayTypeName;
}

// Кандидаты в порядке убывания важности (см. README §5)
export function collectCandidates(dateStr, dayTypeName) {
  const picked = [];
  const seen = new Set();
  const push = (rows) => {
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        picked.push(rowToTask(row));
      }
    }
  };

  // (а) дедлайн сегодня или просрочен
  push(
    db
      .prepare(
        `SELECT * FROM tasks WHERE status IN ('inbox','active') AND deadline IS NOT NULL AND deadline <= ?
         ORDER BY deadline ASC, hard_deadline DESC, id ASC`
      )
      .all(dateStr)
  );

  // (б) week_flag с подходящим day_context
  push(
    db
      .prepare(
        `SELECT * FROM tasks WHERE status IN ('inbox','active') AND week_flag = 1
         ORDER BY created_at ASC, id ASC`
      )
      .all()
      .filter((t) => contextMatches(t, dayTypeName))
  );

  // (в) явно назначено на сегодня
  push(
    db
      .prepare(
        `SELECT * FROM tasks WHERE status IN ('inbox','active') AND scheduled_date = ? ORDER BY id ASC`
      )
      .all(dateStr)
  );

  return picked;
}

// (г) добивка из inbox — только quick, максимум две
function inboxFillers(dateStr, dayTypeName, excludeIds, limit = 2) {
  return db
    .prepare(
      `SELECT * FROM tasks WHERE status = 'inbox' AND effort = 'quick' ORDER BY created_at ASC, id ASC`
    )
    .all()
    .filter((t) => !excludeIds.has(t.id) && contextMatches(t, dayTypeName))
    .slice(0, limit)
    .map(rowToTask);
}

// ---- План дня ----

function loadPlan(dateStr) {
  const row = db.prepare('SELECT * FROM day_plans WHERE date = ?').get(dateStr);
  return row ? { ...row, task_ids: JSON.parse(row.task_ids) } : null;
}

function savePlan(dateStr, taskIds) {
  db.prepare(
    `INSERT INTO day_plans (date, task_ids, built_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET task_ids = excluded.task_ids, built_at = excluded.built_at`
  ).run(dateStr, JSON.stringify(taskIds));
}

export async function buildPlan(dateStr, { rebuild = false } = {}) {
  const dayType = dayTypeFor(dateStr);
  const events = await listEventsSafe(dateStr, dateStr);
  const capacity = effectiveCapacity(dayType, dateStr, events);

  let plan = loadPlan(dateStr);
  if (!plan || rebuild) {
    // Выполненные сегодня задачи из старого плана не выбрасываем — галочки должны остаться
    const doneKept = (plan?.task_ids || []).filter((id) => {
      const t = db.prepare('SELECT status FROM tasks WHERE id = ?').get(id);
      return t && t.status === 'done';
    });

    const candidates = collectCandidates(dateStr, dayType.name);
    const chosen = candidates.slice(0, capacity);
    if (chosen.length < capacity) {
      const exclude = new Set([...chosen.map((t) => t.id), ...doneKept]);
      chosen.push(...inboxFillers(dateStr, dayType.name, exclude, Math.min(2, capacity - chosen.length)));
    }

    const taskIds = [...doneKept, ...chosen.map((t) => t.id).filter((id) => !doneKept.includes(id))];
    savePlan(dateStr, taskIds);
    plan = loadPlan(dateStr);
  }

  // Задачи плана (удалённые из БД отфильтровываются)
  const tasks = plan.task_ids
    .map((id) => rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)))
    .filter(Boolean);

  return {
    date: dateStr,
    day_type: { name: dayType.name, label: dayType.label, slots: dayType.slots },
    capacity,
    base_capacity: dayType.daily_capacity,
    tasks,
    events,
    gcal_connected: isConnected(),
    built_at: plan.built_at,
  };
}

export function addToPlan(dateStr, taskId) {
  const plan = loadPlan(dateStr) || { task_ids: [] };
  if (!plan.task_ids.includes(taskId)) plan.task_ids.push(taskId);
  savePlan(dateStr, plan.task_ids);
}

export function removeFromPlan(dateStr, taskId) {
  const plan = loadPlan(dateStr);
  if (!plan) return;
  savePlan(dateStr, plan.task_ids.filter((id) => id !== taskId));
}

export { todayStr };
