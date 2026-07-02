import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'tracker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- Миграции (простая версионная схема) ----
const MIGRATIONS = [
  // v1: базовая схема
  `
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox','active','done','someday')),
    domain TEXT CHECK (domain IN ('pa_practice','fitness','piano','finance','health','life')),
    day_context TEXT CHECK (day_context IN ('office','remote','weekend','any')),
    deadline TEXT,
    hard_deadline INTEGER NOT NULL DEFAULT 0,
    effort TEXT NOT NULL DEFAULT 'normal' CHECK (effort IN ('quick','normal','deep')),
    week_flag INTEGER NOT NULL DEFAULT 0,
    scheduled_date TEXT,
    gcal_event_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE day_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    slots TEXT NOT NULL DEFAULT '[]',
    daily_capacity INTEGER NOT NULL DEFAULT 3
  );

  CREATE TABLE rotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    starts_on TEXT NOT NULL,
    rules TEXT NOT NULL, -- JSON: { "1": "office", ... } (1=пн … 7=вс)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Сохранённый план «Сегодня» на дату: ручные правки живут до пересборки
  CREATE TABLE day_plans (
    date TEXT PRIMARY KEY,
    task_ids TEXT NOT NULL DEFAULT '[]',
    built_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

function migrate() {
  const version = db.pragma('user_version', { simple: true });
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function seed() {
  const hasDayTypes = db.prepare('SELECT COUNT(*) AS c FROM day_types').get().c > 0;
  if (!hasDayTypes) {
    const insert = db.prepare(
      'INSERT INTO day_types (name, label, slots, daily_capacity) VALUES (?, ?, ?, ?)'
    );
    insert.run(
      'office',
      'Офис',
      JSON.stringify([
        { name: 'дорога', capacity: 'reading' },
        // пн/вт вечер занят клиентами частной практики
        { name: 'вечер', capacity: 'short', busy_weekdays: [1, 2] },
      ]),
      3
    );
    insert.run(
      'remote',
      'Удалёнка',
      JSON.stringify([
        { name: 'день', capacity: 'normal' },
        { name: 'вечер', capacity: 'gym' },
      ]),
      4
    );
    insert.run(
      'weekend',
      'Выходной',
      JSON.stringify([{ name: 'день', capacity: 'free' }]),
      5
    );
  }

  const hasRotation = db.prepare('SELECT COUNT(*) AS c FROM rotations').get().c > 0;
  if (!hasRotation) {
    // Текущая ротация: пн–ср офис, чт–пт удалёнка, сб–вс выходные
    db.prepare('INSERT INTO rotations (starts_on, rules) VALUES (?, ?)').run(
      '2026-06-01',
      JSON.stringify({ 1: 'office', 2: 'office', 3: 'office', 4: 'remote', 5: 'remote', 6: 'weekend', 7: 'weekend' })
    );
  }
}

migrate();
seed();

// ---- Настройки (ключ-значение) ----
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  if (value === null || value === undefined) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } else {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
  }
}
