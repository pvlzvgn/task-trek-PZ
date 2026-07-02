import { google } from 'googleapis';
import { getSetting, setSetting } from '../db.js';

// Google Calendar: чтение событий + запись hard-deadline задач в календарь «Tracker».
// Токены храним в settings (ключ gcal_tokens). Двустороннего синка нет намеренно.

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TRACKER_CALENDAR_NAME = 'Tracker';

export function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isConnected() {
  return isConfigured() && !!getSetting('gcal_tokens');
}

function oauthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/gcal/callback'
  );
  const stored = getSetting('gcal_tokens');
  if (stored) client.setCredentials(JSON.parse(stored));
  // refresh-токены Google обновляет молча — сохраняем каждое обновление
  client.on('tokens', (tokens) => {
    const prev = getSetting('gcal_tokens');
    const merged = { ...(prev ? JSON.parse(prev) : {}), ...tokens };
    setSetting('gcal_tokens', JSON.stringify(merged));
  });
  return client;
}

export function getAuthUrl() {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function handleCallback(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  setSetting('gcal_tokens', JSON.stringify(tokens));
}

export function disconnect() {
  setSetting('gcal_tokens', null);
  setSetting('gcal_tracker_calendar_id', null);
}

function calendarApi() {
  return google.calendar({ version: 'v3', auth: oauthClient() });
}

// ---- Чтение событий ----

// События с dateFrom по dateTo включительно (основной календарь),
// нормализованные до { id, title, start, end, all_day }
export async function listEvents(dateFrom, dateTo) {
  const cal = calendarApi();
  const trackerId = getSetting('gcal_tracker_calendar_id');
  const res = await cal.events.list({
    calendarId: 'primary',
    timeMin: new Date(`${dateFrom}T00:00:00`).toISOString(),
    timeMax: new Date(`${dateTo}T23:59:59`).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });
  return (res.data.items || [])
    .filter((ev) => ev.status !== 'cancelled')
    .map((ev) => ({
      id: ev.id,
      title: ev.summary || '(без названия)',
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      all_day: !ev.start?.dateTime,
      calendar: trackerId && ev.organizer?.email === trackerId ? 'tracker' : 'primary',
    }));
}

// Не роняем сборку плана, если календарь недоступен
export async function listEventsSafe(dateFrom, dateTo) {
  if (!isConnected()) return [];
  try {
    return await listEvents(dateFrom, dateTo);
  } catch (err) {
    console.error('[gcal] не удалось получить события:', err.message);
    return [];
  }
}

// ---- Запись hard-deadline задач ----

async function ensureTrackerCalendar() {
  let id = getSetting('gcal_tracker_calendar_id');
  if (id) return id;
  const cal = calendarApi();
  // ищем существующий календарь Tracker, иначе создаём
  const list = await cal.calendarList.list();
  const existing = (list.data.items || []).find((c) => c.summary === TRACKER_CALENDAR_NAME);
  if (existing) {
    id = existing.id;
  } else {
    const created = await cal.calendars.insert({
      requestBody: { summary: TRACKER_CALENDAR_NAME, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
    id = created.data.id;
  }
  setSetting('gcal_tracker_calendar_id', id);
  return id;
}

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Синхронизировать одну задачу: hard_deadline + не выполнена → событие на весь день;
// иначе — удалить событие, если было. Возвращает новый gcal_event_id (или null).
export async function syncTaskEvent(task) {
  if (!isConnected()) return task.gcal_event_id ?? null;
  const cal = calendarApi();
  const needsEvent = task.hard_deadline && task.deadline && task.status !== 'done';

  if (!needsEvent) {
    if (task.gcal_event_id) {
      const calendarId = await ensureTrackerCalendar();
      try {
        await cal.events.delete({ calendarId, eventId: task.gcal_event_id });
      } catch (err) {
        if (err.code !== 404 && err.code !== 410) throw err;
      }
    }
    return null;
  }

  const calendarId = await ensureTrackerCalendar();
  const requestBody = {
    summary: `⏰ ${task.title}`,
    description: 'Task Trek: жёсткий дедлайн',
    start: { date: task.deadline },
    end: { date: nextDay(task.deadline) },
  };

  if (task.gcal_event_id) {
    try {
      await cal.events.update({ calendarId, eventId: task.gcal_event_id, requestBody });
      return task.gcal_event_id;
    } catch (err) {
      if (err.code !== 404 && err.code !== 410) throw err;
      // событие удалили руками — создадим заново
    }
  }
  const created = await cal.events.insert({ calendarId, requestBody });
  return created.data.id;
}
