import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import TaskItem from '../components/TaskItem.jsx';
import { maybeNotifyMorning } from '../notifications.js';

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function humanDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function fmtTime(isoDateTime) {
  const d = new Date(isoDateTime);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Today({ refreshKey, bumpRefresh }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [picking, setPicking] = useState(false);
  const [pool, setPool] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await api.today();
      setPlan(data);
      setError(null);
      maybeNotifyMorning(data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function rebuild() {
    try {
      setPlan(await api.rebuildToday());
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggle(task) {
    if (task.status === 'done') await api.reopenTask(task.id);
    else await api.completeTask(task.id);
    load();
    bumpRefresh?.();
  }

  async function remove(task) {
    setPlan(await api.removeFromToday(task.id));
  }

  async function openPicker() {
    const all = await api.tasks({ status: 'inbox,active' });
    const inPlan = new Set((plan?.tasks || []).map((t) => t.id));
    setPool(all.filter((t) => !inPlan.has(t.id)));
    setPicking(true);
  }

  async function addTask(task) {
    setPlan(await api.addToToday(task.id));
    setPicking(false);
  }

  if (error) return <div className="screen"><div className="error-banner">{error}</div></div>;
  if (!plan) return <div className="screen"><p className="muted">Собираю план…</p></div>;

  const doneCount = plan.tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="screen">
      <div className="today-header">
        <div>
          <h1>{humanDate(plan.date)}</h1>
          <div className="progress-hint">
            {plan.tasks.length === 0
              ? 'План пуст'
              : `${doneCount} из ${plan.tasks.length} сделано · ёмкость дня ${plan.capacity}`}
          </div>
        </div>
        <span className="daytype-pill">{plan.day_type.label}</span>
      </div>

      {plan.tasks.length === 0 ? (
        <div className="empty-state">
          <div className="big">🌿</div>
          На сегодня ничего не собралось.<br />Добавь задачу внизу — или отдыхай.
        </div>
      ) : (
        plan.tasks.map((task) => (
          <TaskItem key={task.id} task={task} onToggle={toggle} todayStr={plan.date}>
            {task.status !== 'done' && (
              <button className="icon-btn" onClick={() => remove(task)} aria-label="убрать из плана" title="убрать из плана">
                ✕
              </button>
            )}
          </TaskItem>
        ))
      )}

      <div className="btn-row">
        <button className="btn" onClick={rebuild}>↻ Пересобрать</button>
        <button className="btn" onClick={picking ? () => setPicking(false) : openPicker}>
          {picking ? 'Скрыть' : '+ Добавить в план'}
        </button>
      </div>

      {picking && (
        <>
          <h2>Выбрать задачу</h2>
          {pool.length === 0 && <p className="muted">Нет свободных задач — всё уже в плане.</p>}
          {pool.map((task) => (
            <TaskItem key={task.id} task={task} todayStr={plan.date}>
              <button className="btn small" onClick={() => addTask(task)}>в план</button>
            </TaskItem>
          ))}
        </>
      )}

      <h2>Календарь</h2>
      {!plan.gcal_connected && (
        <p className="muted">Google Calendar не подключён — можно сделать это в «Настройках».</p>
      )}
      {plan.gcal_connected && plan.events.length === 0 && <p className="muted">Сегодня встреч нет.</p>}
      {plan.events.map((ev) => (
        <div key={ev.id} className="event-row">
          <span className="event-time">{ev.all_day ? 'весь день' : `${fmtTime(ev.start)}–${fmtTime(ev.end)}`}</span>
          <span>{ev.title}</span>
        </div>
      ))}
    </div>
  );
}
