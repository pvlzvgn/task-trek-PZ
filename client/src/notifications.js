import { api } from './api.js';

// Браузерные уведомления v1 (Notification API, только при открытом приложении):
//  1) утреннее «план собран» — раз в день при первой загрузке плана;
//  2) напоминание за день до жёсткого дедлайна — раз в день.
// Маркеры «уже показывали» — в localStorage (это UI-состояние, не данные).

function todayLocal() {
  return new Date().toLocaleDateString('sv-SE');
}

function canNotify() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

async function inQuietHours() {
  try {
    const s = await api.settings();
    const from = s.quiet_hours_from;
    const to = s.quiet_hours_to;
    if (!from || !to) return false;
    const now = new Date().toTimeString().slice(0, 5);
    // диапазон может пересекать полночь (например, 22:00–08:00)
    return from <= to ? now >= from && now < to : now >= from || now < to;
  } catch {
    return false;
  }
}

export async function requestNotifyPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

export async function maybeNotifyMorning(plan) {
  if (!canNotify()) return;
  const key = 'notified_morning';
  if (localStorage.getItem(key) === todayLocal()) return;
  if (await inQuietHours()) return;
  localStorage.setItem(key, todayLocal());
  const n = plan.tasks.filter((t) => t.status !== 'done').length;
  new Notification('План собран ✅', {
    body: n ? `Сегодня ${plan.day_type.label.toLowerCase()}: ${n} задач(и).` : 'Сегодня план пуст — можно выдохнуть.',
  });
  checkDeadlines();
}

async function checkDeadlines() {
  if (!canNotify()) return;
  const key = 'notified_deadlines';
  if (localStorage.getItem(key) === todayLocal()) return;
  localStorage.setItem(key, todayLocal());
  try {
    const tasks = await api.tasks({ status: 'inbox,active' });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('sv-SE');
    const urgent = tasks.filter((t) => t.hard_deadline && t.deadline === tomorrowStr);
    for (const t of urgent) {
      new Notification('⏰ Завтра жёсткий дедлайн', { body: t.title });
    }
  } catch {
    /* календарь Google продублирует — не страшно */
  }
}
