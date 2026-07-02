#!/usr/bin/env node
// MCP-сервер Task Trek: тонкий слой над REST API трекера.
// Запускается локально (stdio), ходит в продакшен-API с Bearer-токеном.
// Конфиг: mcp/.env → TASKTREK_API_URL, TASKTREK_API_TOKEN.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const API_URL = (process.env.TASKTREK_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const API_TOKEN = process.env.TASKTREK_API_TOKEN || '';

async function call(method, apiPath, body) {
  const headers = {};
  if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${apiPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return { ok: true };
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || data?.errors?.join('; ') || `HTTP ${res.status}`);
  }
  return data;
}

// Единый формат ответа инструмента
function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(err) {
  return { content: [{ type: 'text', text: `Ошибка: ${err.message}` }], isError: true };
}

const server = new McpServer({ name: 'tasktrek', version: '1.0.0' });

// Справочные значения полей — чтобы агент размечал задачи правильно
const DOMAIN = z.enum(['pa_practice', 'fitness', 'piano', 'finance', 'health', 'life']);
const CONTEXT = z.enum(['office', 'remote', 'weekend', 'any']);
const EFFORT = z.enum(['quick', 'normal', 'deep']);
const STATUS = z.enum(['inbox', 'active', 'done', 'someday']);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

server.tool(
  'today_plan',
  'План «Сегодня»: тип дня, ёмкость, задачи плана, события Google Calendar. Собирается автоматически при первом вызове за день.',
  { date: DATE.optional().describe('Дата (YYYY-MM-DD), по умолчанию сегодня') },
  async ({ date }) => {
    try {
      return ok(await call('GET', `/api/today${date ? `?date=${date}` : ''}`));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'rebuild_today',
  'Пересобрать план «Сегодня» заново по алгоритму (дедлайны → week_flag → назначенные → quick из inbox). Выполненные задачи сохраняются.',
  {},
  async () => {
    try {
      return ok(await call('POST', '/api/today/rebuild', {}));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'week_overview',
  'Обзор недели: 7 дней с типами (офис/удалёнка/выходной), дедлайны, назначенные задачи, события календаря, счётчик тренировок.',
  { start: DATE.optional().describe('Любая дата внутри нужной недели, по умолчанию текущая') },
  async ({ start }) => {
    try {
      return ok(await call('GET', `/api/week${start ? `?start=${start}` : ''}`));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'list_tasks',
  'Список задач с фильтрами. status: inbox (неразобранные) | active | done | someday (бэклог). Можно несколько через запятую.',
  {
    status: z.string().optional().describe('Фильтр по статусу, например "inbox" или "inbox,active"'),
    domain: DOMAIN.optional().describe('Фильтр по домену'),
    week_flag: z.boolean().optional().describe('Только задачи «на этой неделе»'),
  },
  async ({ status, domain, week_flag }) => {
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (domain) qs.set('domain', domain);
      if (week_flag !== undefined) qs.set('week_flag', week_flag ? '1' : '0');
      return ok(await call('GET', `/api/tasks${qs.toString() ? `?${qs}` : ''}`));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'quick_add',
  'Быстрый ввод задачи одной строкой. Синтаксис: «!» = на этой неделе, «@15.07» = дедлайн. Пример: «записаться к дантисту @15.07 !». Задача попадает в inbox.',
  { text: z.string().min(1).describe('Текст задачи с опциональным синтаксисом') },
  async ({ text }) => {
    try {
      return ok(await call('POST', '/api/tasks/quick', { text }));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'create_task',
  'Создать задачу со структурными полями. week_flag — ЕДИНСТВЕННЫЙ приоритет в системе (других шкал нет). hard_deadline=true попадает событием в Google Calendar.',
  {
    title: z.string().min(1).describe('Название задачи'),
    status: STATUS.optional().describe('По умолчанию inbox'),
    domain: DOMAIN.optional().describe('pa_practice=частная практика, fitness=зал, piano, finance, health, life=быт'),
    day_context: CONTEXT.optional().describe('В какой тип дня уместно делать'),
    effort: EFFORT.optional().describe('quick=<15 мин, normal, deep=требует фокуса'),
    deadline: DATE.optional(),
    hard_deadline: z.boolean().optional().describe('Жёсткий дедлайн — синк в календарь'),
    week_flag: z.boolean().optional().describe('Надо на этой неделе'),
    scheduled_date: DATE.optional().describe('Явно назначить на дату'),
  },
  async (fields) => {
    try {
      return ok(await call('POST', '/api/tasks', fields));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'update_task',
  'Изменить поля задачи (разметка inbox, перенос дедлайна, смена статуса и т.п.). Передавай только изменяемые поля. domain/day_context/deadline можно сбросить, передав null.',
  {
    id: z.number().int().describe('ID задачи'),
    title: z.string().optional(),
    status: STATUS.optional(),
    domain: DOMAIN.nullable().optional(),
    day_context: CONTEXT.nullable().optional(),
    effort: EFFORT.optional(),
    deadline: DATE.nullable().optional(),
    hard_deadline: z.boolean().optional(),
    week_flag: z.boolean().optional(),
    scheduled_date: DATE.nullable().optional(),
  },
  async ({ id, ...fields }) => {
    try {
      return ok(await call('PATCH', `/api/tasks/${id}`, fields));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'complete_task',
  'Отметить задачу выполненной (событие в календаре удалится само).',
  { id: z.number().int().describe('ID задачи') },
  async ({ id }) => {
    try {
      return ok(await call('POST', `/api/tasks/${id}/complete`));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'delete_task',
  'Удалить задачу безвозвратно. Для «отложить надолго» лучше update_task со status=someday.',
  { id: z.number().int().describe('ID задачи') },
  async ({ id }) => {
    try {
      return ok(await call('DELETE', `/api/tasks/${id}`));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'add_to_today',
  'Вручную добавить задачу в план «Сегодня» (это исключение — обычно план собирается сам).',
  { task_id: z.number().int() },
  async ({ task_id }) => {
    try {
      return ok(await call('POST', '/api/today/tasks', { task_id }));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'remove_from_today',
  'Убрать задачу из плана «Сегодня» (задача не удаляется, просто уходит из плана).',
  { task_id: z.number().int() },
  async ({ task_id }) => {
    try {
      return ok(await call('DELETE', `/api/today/tasks/${task_id}`));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'day_types',
  'Типы дней с ёмкостью (сколько задач максимум в плане) и слотами. Полезно перед разметкой day_context.',
  {},
  async () => {
    try {
      return ok(await call('GET', '/api/day-types'));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  'set_rotation',
  'Сменить ротацию офис/удалёнка с даты. rules: {"1": "office", …, "7": "weekend"} (1=пн … 7=вс). Старые планы не пересобираются.',
  {
    starts_on: DATE.describe('С какой даты действует'),
    rules: z.record(z.string().regex(/^[1-7]$/), z.string()).describe('Маппинг день недели → имя типа дня'),
  },
  async ({ starts_on, rules }) => {
    try {
      return ok(await call('POST', '/api/rotations', { starts_on, rules }));
    } catch (err) {
      return fail(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[tasktrek-mcp] запущен, API: ${API_URL}`);
