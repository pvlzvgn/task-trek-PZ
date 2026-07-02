import { db } from '../db.js';
import { isoWeekday } from './dates.js';

// Тип дня для даты: берём последнюю ротацию с starts_on <= date.
// scheduled-исключение: если в day_plans ничего нет, тип определяется только правилами.
export function dayTypeNameFor(dateStr) {
  const rotation = db
    .prepare('SELECT rules FROM rotations WHERE starts_on <= ? ORDER BY starts_on DESC, id DESC LIMIT 1')
    .get(dateStr);
  if (!rotation) return 'weekend';
  const rules = JSON.parse(rotation.rules);
  return rules[String(isoWeekday(dateStr))] || 'weekend';
}

export function dayTypeFor(dateStr) {
  const name = dayTypeNameFor(dateStr);
  const dt = db.prepare('SELECT * FROM day_types WHERE name = ?').get(name);
  if (!dt) {
    return { id: null, name, label: name, slots: [], daily_capacity: 3 };
  }
  return { ...dt, slots: JSON.parse(dt.slots) };
}
