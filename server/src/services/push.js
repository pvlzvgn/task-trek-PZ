import webpush from 'web-push';
import { db, getSetting, setSetting } from '../db.js';
import { buildPlan } from './today.js';
import { todayStr, addDays } from '../lib/dates.js';
import { sendMorningSummary } from './telegram.js';

// Web Push: VAPID-ключи генерируются один раз и живут в settings — ноль ручной настройки.

let vapidReady = false;

function ensureVapid() {
  let publicKey = getSetting('vapid_public');
  let privateKey = getSetting('vapid_private');
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    setSetting('vapid_public', publicKey);
    setSetting('vapid_private', privateKey);
  }
  if (!vapidReady) {
    webpush.setVapidDetails('mailto:pvlzvgn@gmail.com', publicKey, privateKey);
    vapidReady = true;
  }
  return publicKey;
}

export function getPublicKey() {
  return ensureVapid();
}

export function saveSubscription(subscription) {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, data) VALUES (?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET data = excluded.data`
  ).run(subscription.endpoint, JSON.stringify(subscription));
}

export function removeSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function subscriptionCount() {
  return db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions').get().c;
}

// Разослать всем подписчикам; протухшие подписки (404/410) удаляются сами
export async function sendToAll(payload) {
  ensureVapid();
  const rows = db.prepare('SELECT * FROM push_subscriptions').all();
  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(JSON.parse(row.data), JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        removeSubscription(row.endpoint);
      } else {
        console.error('[push] не удалось отправить:', err.statusCode || err.message);
      }
    }
  }
  return { sent, total: rows.length };
}

// ---- Утренний планировщик ----
// Раз в минуту: если наступило время утреннего пуша и сегодня ещё не слали —
// собрать план (он же закэшируется для приложения) и отправить сводку.

async function morningTick() {
  if (subscriptionCount() === 0) return;
  const pushTime = getSetting('push_morning_time') || '08:00';
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm < pushTime) return;
  const today = todayStr();
  if (getSetting('push_last_morning') === today) return;
  setSetting('push_last_morning', today); // до отправки, чтобы не спамить при ошибке

  const plan = await buildPlan(today);
  const open = plan.tasks.filter((t) => t.status !== 'done').length;
  let body = open
    ? `${plan.day_type.label}: ${open} задач(и) в плане.`
    : `${plan.day_type.label}: план пуст — дыши ровно.`;

  const tomorrow = addDays(today, 1);
  const hard = db
    .prepare(
      `SELECT title FROM tasks WHERE hard_deadline = 1 AND deadline = ? AND status IN ('inbox','active')`
    )
    .all(tomorrow);
  if (hard.length) {
    body += ` ⏰ Завтра дедлайн: ${hard.map((t) => t.title).join('; ')}`;
  }

  const result = await sendToAll({ title: 'План собран ✅', body, url: '/' });
  console.log(`[push] утренняя сводка: ${result.sent}/${result.total}`);
  await sendMorningSummary(body); // дублируем в Telegram, если бот привязан
}

export function startScheduler() {
  setInterval(() => {
    morningTick().catch((err) => console.error('[push] планировщик:', err.message));
  }, 60_000);
}
