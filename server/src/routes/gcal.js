import { isConfigured, isConnected, getAuthUrl, handleCallback, disconnect, syncTaskEvent } from '../services/gcal.js';
import { db } from '../db.js';
import { rowToTask } from '../services/tasks.js';

export default async function gcalRoutes(app) {
  app.get('/api/gcal/status', async () => ({
    configured: isConfigured(),
    connected: isConnected(),
  }));

  app.get('/api/gcal/auth-url', async (req, reply) => {
    if (!isConfigured()) {
      return reply.code(400).send({ error: 'не заданы GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET в .env' });
    }
    return { url: getAuthUrl() };
  });

  // Redirect URI для Google OAuth (браузер попадает сюда после согласия)
  app.get('/api/gcal/callback', async (req, reply) => {
    const { code, error } = req.query;
    if (error || !code) {
      return reply.type('text/html; charset=utf-8').send('<h3>Авторизация отменена. Можно закрыть вкладку.</h3>');
    }
    try {
      await handleCallback(code);
      // после подключения — досинхронизировать существующие hard-deadline задачи
      const pending = db
        .prepare(`SELECT * FROM tasks WHERE hard_deadline = 1 AND deadline IS NOT NULL AND status != 'done'`)
        .all()
        .map(rowToTask);
      for (const task of pending) {
        try {
          const eventId = await syncTaskEvent(task);
          if (eventId !== task.gcal_event_id) {
            db.prepare('UPDATE tasks SET gcal_event_id = ? WHERE id = ?').run(eventId, task.id);
          }
        } catch (err) {
          console.error('[gcal] синк задачи при подключении:', err.message);
        }
      }
      return reply
        .type('text/html; charset=utf-8')
        .send('<h3>Google Calendar подключён ✅</h3><p>Вернитесь в приложение — вкладку можно закрыть.</p>');
    } catch (err) {
      console.error('[gcal] callback:', err.message);
      return reply.code(500).type('text/html; charset=utf-8').send('<h3>Не удалось подключить календарь.</h3>');
    }
  });

  app.post('/api/gcal/disconnect', async () => {
    disconnect();
    return { connected: false };
  });
}
