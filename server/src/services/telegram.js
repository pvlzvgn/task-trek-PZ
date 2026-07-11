import { getSetting, setSetting } from '../db.js';
import { buildPlan } from './today.js';
import { todayStr } from '../lib/dates.js';
import { parseQuickInput } from '../lib/quickparse.js';
import { createTask, completeTask, getTask, listTasks } from './tasks.js';
import { parseTaskText, isConfigured as deepseekConfigured } from './deepseek.js';

// Telegram-бот: тонкий вход в трекер. Long polling — не нужен вебхук и публичный URL.
// Привязка: бот отвечает только одному чату; привязывается отправкой API_TOKEN.

const DOMAIN_LABELS = {
  pa_practice: 'ПА-практика', fitness: 'Зал', piano: 'Пианино',
  finance: 'Финансы', health: 'Здоровье', life: 'Быт',
};

const CONTEXT_LABELS_TG = { office: 'офисное', remote: 'на удалёнке', weekend: 'на выходных' };

function token() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

// Сеть до Telegram с этого хостинга эпизодически моргает (~4% запросов) —
// все вызовы с ретраями, кроме длинного getUpdates (его перезапустит цикл поллинга).
async function fetchRetry(url, options = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function tg(method, payload) {
  const attempts = method === 'getUpdates' ? 1 : 3;
  const res = await fetchRetry(
    `https://api.telegram.org/bot${token()}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    attempts
  );
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

function boundChatId() {
  return getSetting('telegram_chat_id');
}

async function send(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

// Утренняя сводка — вызывается планировщиком пушей
export async function sendMorningSummary(text) {
  if (!token() || !boundChatId()) return;
  try {
    await send(boundChatId(), `☀️ <b>План собран</b>\n${text}`);
  } catch (err) {
    console.error('[tg] утренняя сводка:', err.message);
  }
}

// ---- Форматирование ----

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function taskLine(t) {
  const bits = [];
  if (t.deadline) bits.push(`${t.hard_deadline ? '⏰' : '📅'} ${t.deadline.slice(8, 10)}.${t.deadline.slice(5, 7)}`);
  if (t.week_flag) bits.push('❗️неделя');
  if (t.domain) bits.push(DOMAIN_LABELS[t.domain]);
  if (t.effort === 'quick') bits.push('⚡');
  const meta = bits.length ? `  <i>${bits.join(' · ')}</i>` : '';
  return `${t.status === 'done' ? '✅' : '▫️'} ${esc(t.title)}${meta}`;
}

function doneButtons(tasks) {
  const rows = tasks
    .filter((t) => t.status !== 'done')
    .slice(0, 8)
    .map((t) => [{ text: `✓ ${t.title.slice(0, 28)}`, callback_data: `done:${t.id}` }]);
  return rows.length ? { reply_markup: { inline_keyboard: rows } } : {};
}

// ---- Обработчики ----

async function cmdToday(chatId) {
  const plan = await buildPlan(todayStr());
  const open = plan.tasks.filter((t) => t.status !== 'done').length;
  const lines = plan.tasks.map(taskLine).join('\n') || '<i>план пуст — дыши ровно</i>';
  const events = plan.events
    .map((e) => `🗓 ${e.all_day ? 'весь день' : e.start.slice(11, 16)} ${esc(e.title)}`)
    .join('\n');
  const text = `<b>${plan.date} · ${plan.day_type.label}</b> · ёмкость ${plan.capacity}\n\n${lines}${events ? `\n\n${events}` : ''}`;
  await send(chatId, text, doneButtons(plan.tasks));
}

async function cmdInbox(chatId) {
  const tasks = listTasks({ status: 'inbox' });
  const text = tasks.length
    ? `<b>Inbox · ${tasks.length}</b>\n\n${tasks.map(taskLine).join('\n')}\n\n<i>разметка — в приложении или через Claude</i>`
    : 'Inbox пуст 🎉';
  await send(chatId, text, doneButtons(tasks));
}

async function cmdWeek(chatId) {
  // неделя строится тем же кодом, что и API — без дублирования тащим через fetch к себе нельзя (токен), поэтому мини-версия:
  const plan = await buildPlan(todayStr());
  const week = listTasks({ status: 'inbox,active' }).filter((t) => t.week_flag || t.deadline || t.scheduled_date);
  const text = `<b>Хвосты недели</b>\n\n${week.map(taskLine).join('\n') || '<i>всё чисто</i>'}\n\nСегодня: ${plan.day_type.label}, в плане ${plan.tasks.length}`;
  await send(chatId, text);
}

async function handleQuickAdd(chatId, text) {
  const parsed = parseQuickInput(text);
  if (!parsed.title) {
    await send(chatId, 'Не понял. Просто напиши задачу, например: <i>оплатить кредит @10.07 !</i>');
    return;
  }
  const task = createTask({ title: parsed.title, week_flag: parsed.week_flag, deadline: parsed.deadline });
  const bits = ['📥 в inbox'];
  if (task.deadline) bits.push(`дедлайн ${task.deadline}`);
  if (task.week_flag) bits.push('на этой неделе');
  await send(chatId, `Записал: <b>${esc(task.title)}</b>\n<i>${bits.join(' · ')}</i>`);
}

// Голосовое сообщение → Whisper на VPS → задача в inbox
async function handleVoice(chatId, voice) {
  const sttUrl = process.env.STT_URL || 'http://127.0.0.1:8081';
  if (voice.duration > 60) {
    await send(chatId, 'Слишком длинное голосовое для задачи (>60 сек) — надиктуй короче.');
    return;
  }
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' });
  try {
    const file = await tg('getFile', { file_id: voice.file_id });
    const audioRes = await fetchRetry(`https://api.telegram.org/file/bot${token()}/${file.file_path}`);
    if (!audioRes.ok) throw new Error(`скачивание файла: HTTP ${audioRes.status}`);
    const audio = Buffer.from(await audioRes.arrayBuffer());

    const sttRes = await fetch(`${sttUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: audio,
      signal: AbortSignal.timeout(90_000),
    });
    if (!sttRes.ok) throw new Error(`расшифровка: HTTP ${sttRes.status}`);
    const { text } = await sttRes.json();

    if (!text) {
      await send(chatId, 'Не расслышал 🎙 Попробуй ещё раз или напиши текстом.');
      return;
    }

    // Живую речь превращаем в структуру через DeepSeek; без ключа/при ошибке — как есть
    if (deepseekConfigured()) {
      const parsed = await parseTaskText(text);
      if (parsed) {
        const task = createTask(parsed);
        const bits = ['📥 в inbox'];
        if (task.deadline) bits.push(`дедлайн ${task.deadline}`);
        if (task.week_flag) bits.push('на этой неделе');
        if (task.domain) bits.push(DOMAIN_LABELS[task.domain] || task.domain);
        if (task.day_context) bits.push(CONTEXT_LABELS_TG[task.day_context] || task.day_context);
        if (task.effort !== 'normal') bits.push(task.effort === 'quick' ? '⚡ быстрая' : '🧠 фокус');
        await send(chatId, `🎙 «${esc(text)}»\n\nЗаписал: <b>${esc(task.title)}</b>\n<i>${bits.join(' · ')}</i>`);
        return;
      }
    }
    await handleQuickAdd(chatId, text);
  } catch (err) {
    console.error('[tg] голосовое:', err.message);
    await send(chatId, 'Не смог расшифровать голосовое — напиши текстом.');
  }
}

async function handleMessage(msg) {
  const chatId = String(msg.chat.id);

  if (msg.voice && chatId === boundChatId()) {
    await handleVoice(chatId, msg.voice);
    return;
  }

  const text = (msg.text || '').trim();
  if (!text) return;

  const bound = boundChatId();

  // Привязка: первый чат, приславший API_TOKEN, становится хозяином
  if (!bound) {
    if (process.env.API_TOKEN && text === process.env.API_TOKEN) {
      setSetting('telegram_chat_id', chatId);
      await send(chatId, 'Привязано ✅ Это теперь твой личный вход в Task Trek.\n\nПросто пиши задачи текстом (<i>! — на неделе, @15.07 — дедлайн</i>).\nКоманды: /today /inbox /week\n\nСообщение с токеном можно удалить.');
    } else {
      await send(chatId, 'Это личный бот Task Trek. Пришли токен доступа (API_TOKEN), чтобы привязать чат.');
    }
    return;
  }

  if (chatId !== bound) return; // чужие чаты молча игнорируем

  if (text === '/start' || text === '/help') {
    await send(chatId, 'Пиши задачи текстом — попадут в inbox.\nСинтаксис: <i>! — на неделе, @15.07 — дедлайн</i>\n\n/today — план на сегодня\n/inbox — неразобранное\n/week — хвосты недели');
  } else if (text === '/today') {
    await cmdToday(chatId);
  } else if (text === '/inbox') {
    await cmdInbox(chatId);
  } else if (text === '/week') {
    await cmdWeek(chatId);
  } else if (text.startsWith('/')) {
    await send(chatId, 'Не знаю такую команду. /today /inbox /week — или просто текст задачи.');
  } else {
    await handleQuickAdd(chatId, text);
  }
}

async function handleCallback(query) {
  const chatId = String(query.message?.chat?.id || '');
  if (chatId !== boundChatId()) return;
  const [action, idStr] = (query.data || '').split(':');
  if (action === 'done') {
    const task = getTask(Number(idStr));
    if (task && task.status !== 'done') {
      completeTask(task.id);
      await tg('answerCallbackQuery', { callback_query_id: query.id, text: `✅ ${task.title.slice(0, 40)}` });
      await send(chatId, `✅ <s>${esc(task.title)}</s>`);
      return;
    }
  }
  await tg('answerCallbackQuery', { callback_query_id: query.id });
}

// ---- Long polling ----

let running = false;

export function startTelegramBot() {
  if (!token()) return; // бот не настроен — тихо пропускаем
  if (running) return;
  running = true;

  (async () => {
    let offset = 0;
    console.log('[tg] бот запущен (long polling)');
    while (running) {
      try {
        const updates = await tg('getUpdates', { timeout: 50, offset, allowed_updates: ['message', 'callback_query'] });
        for (const upd of updates) {
          offset = upd.update_id + 1;
          try {
            if (upd.message) await handleMessage(upd.message);
            else if (upd.callback_query) await handleCallback(upd.callback_query);
          } catch (err) {
            console.error('[tg] обработка апдейта:', err.message);
          }
        }
      } catch (err) {
        console.error('[tg] polling:', err.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
