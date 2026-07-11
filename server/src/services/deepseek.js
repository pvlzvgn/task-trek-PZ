// DeepSeek: превращает живую речь в структурную задачу.
// «записаться на техосмотр на следующей неделе» → { title, deadline, week_flag, … }
// Не настроен ключ или ошибка — возвращаем null, вызывающий код падает обратно на простой парсер.

import { todayStr } from '../lib/dates.js';

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function isConfigured() {
  return !!process.env.DEEPSEEK_API_KEY;
}

export async function parseTaskText(text) {
  if (!isConfigured()) return null;
  const today = todayStr();
  const weekday = WEEKDAYS[new Date().getDay()];

  const system = `Ты — парсер задач трекера. Сегодня ${today}, ${weekday}.
Преврати фразу пользователя в JSON задачи:
{
  "title": "суть задачи, коротко, без дат и служебных слов, с маленькой буквы",
  "deadline": "YYYY-MM-DD или null (только если в фразе есть срок; «на следующей неделе» = пятница следующей недели)",
  "week_flag": true если надо на этой неделе или срочно, иначе false,
  "day_context": "office|remote|weekend|null — только если явно привязано к работе в офисе/дому/выходным",
  "effort": "quick если явно мелочь на пару минут, deep если явно требует сосредоточения, иначе normal",
  "domain": "сфера жизни или null, если не очевидно: fitness (зал, тренировки, спорт), health (врачи, анализы, лекарства), finance (платежи, кредиты, налоги), piano (пианино, музыка), pa_practice (клиенты, консультации частной практики), life (быт, покупки, дом)"
}
Отвечай ТОЛЬКО валидным JSON без пояснений.`;

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    if (!parsed.title || typeof parsed.title !== 'string') return null;

    return {
      title: parsed.title.trim(),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline || '') ? parsed.deadline : null,
      week_flag: parsed.week_flag ? 1 : 0, // SQLite не принимает булевы
      day_context: ['office', 'remote', 'weekend'].includes(parsed.day_context) ? parsed.day_context : null,
      effort: ['quick', 'normal', 'deep'].includes(parsed.effort) ? parsed.effort : 'normal',
      domain: ['pa_practice', 'fitness', 'piano', 'finance', 'health', 'life'].includes(parsed.domain) ? parsed.domain : null,
    };
  } catch (err) {
    console.error('[deepseek] разбор не удался:', err.message);
    return null;
  }
}
