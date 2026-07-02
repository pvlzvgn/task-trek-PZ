import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import './db.js'; // миграции и сид выполняются при импорте

import tasksRoutes from './routes/tasks.js';
import todayRoutes from './routes/today.js';
import weekRoutes from './routes/week.js';
import configRoutes from './routes/config.js';
import gcalRoutes from './routes/gcal.js';
import pushRoutes from './routes/push.js';
import { startScheduler } from './services/push.js';

const app = Fastify({ logger: { level: 'warn' } });

await app.register(cors, { origin: true });

// Простая авторизация одним токеном из .env (v1, один пользователь).
// Не задан токен — работаем без авторизации (локальный режим).
app.addHook('onRequest', async (req, reply) => {
  const token = process.env.API_TOKEN;
  if (!token) return;
  if (req.url.startsWith('/api/gcal/callback')) return; // редирект от Google приходит без заголовков
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${token}`) {
    return reply.code(401).send({ error: 'нужен заголовок Authorization: Bearer <API_TOKEN>' });
  }
});

app.get('/api/health', async () => ({ ok: true }));

await app.register(tasksRoutes);
await app.register(todayRoutes);
await app.register(weekRoutes);
await app.register(configRoutes);
await app.register(gcalRoutes);
await app.register(pushRoutes);

startScheduler(); // утренний пуш «план собран»

const port = Number(process.env.API_PORT) || 3001;
try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API: http://localhost:${port}/api`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
