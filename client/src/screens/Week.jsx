import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function fmt(iso) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function weekdayName(iso) {
  return WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()];
}

export default function Week({ refreshKey }) {
  const [week, setWeek] = useState(null);
  const [error, setError] = useState(null);
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD локально

  const load = useCallback(async () => {
    try {
      setWeek(await api.week());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (error) return <div className="screen"><div className="error-banner">{error}</div></div>;
  if (!week) return <div className="screen"><p className="muted">Загрузка…</p></div>;

  return (
    <div className="screen">
      <h1>Неделя</h1>
      <p className="muted">{fmt(week.monday)} — {fmt(week.sunday)}</p>

      <div className="fitness-banner">
        <span>🏋️ Тренировки на неделе</span>
        <span>
          <b>{week.fitness.done}</b> сделано · {week.fitness.planned} в плане · цель {week.fitness.goal}
        </span>
      </div>

      {week.days.map((day) => (
        <div key={day.date} className="week-day">
          <div className={`week-day-head ${day.date === today ? 'today' : ''}`}>
            <span className="date">{weekdayName(day.date)} {fmt(day.date)}</span>
            <span className="chip accent">{day.day_type.label}</span>
            {day.date === today && <span className="chip green">сегодня</span>}
          </div>
          {day.deadlines.length === 0 && day.scheduled.length === 0 && day.events.length === 0 && (
            <div className="muted" style={{ fontSize: 13, paddingLeft: 2 }}>—</div>
          )}
          {day.deadlines.map((t) => (
            <div key={`d${t.id}`} className="event-row" style={{ borderLeftColor: t.hard_deadline ? 'var(--red)' : 'var(--amber)' }}>
              <span>{t.hard_deadline ? '⏰' : '📅'}</span>
              <span>{t.title}</span>
            </div>
          ))}
          {day.scheduled.map((t) => (
            <div key={`s${t.id}`} className="event-row" style={{ borderLeftColor: 'var(--green)' }}>
              <span>📌</span>
              <span>{t.title}</span>
            </div>
          ))}
          {day.events.map((ev) => (
            <div key={ev.id} className="event-row">
              <span className="event-time">
                {ev.all_day ? 'весь день' : new Date(ev.start).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span>{ev.title}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
