import {
  getPublicKey,
  saveSubscription,
  removeSubscription,
  subscriptionCount,
  sendToAll,
} from '../services/push.js';

export default async function pushRoutes(app) {
  app.get('/api/push/public-key', async () => ({ key: getPublicKey() }));

  app.get('/api/push/status', async () => ({ subscriptions: subscriptionCount() }));

  app.post('/api/push/subscribe', async (req, reply) => {
    const sub = req.body;
    if (!sub?.endpoint || !sub?.keys) return reply.code(400).send({ error: 'ожидается PushSubscription JSON' });
    saveSubscription(sub);
    return { ok: true, subscriptions: subscriptionCount() };
  });

  app.post('/api/push/unsubscribe', async (req, reply) => {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return reply.code(400).send({ error: 'endpoint обязателен' });
    removeSubscription(endpoint);
    return { ok: true, subscriptions: subscriptionCount() };
  });

  // Проверочный пуш — присылается сразу всем подпискам
  app.post('/api/push/test', async () => {
    return sendToAll({ title: 'Task Trek 🔔', body: 'Пуши работают. Утренний план будет приходить сюда.', url: '/' });
  });
}
