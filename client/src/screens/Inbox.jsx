import React, { useEffect, useState, useCallback } from 'react';
import { api, DOMAIN_LABELS, CONTEXT_LABELS, EFFORT_LABELS } from '../api.js';
import TaskItem from '../components/TaskItem.jsx';

// Inbox: разбор одной задачи ≤3 секунды — тап по задаче раскрывает чипы разметки.
export default function Inbox({ refreshKey, bumpRefresh }) {
  const [tasks, setTasks] = useState([]);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setTasks(await api.tasks({ status: 'inbox' }));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function patch(task, fields) {
    await api.updateTask(task.id, fields);
    load();
    bumpRefresh?.();
  }

  async function toggle(task) {
    await api.completeTask(task.id);
    load();
    bumpRefresh?.();
  }

  async function remove(task) {
    if (!confirm(`Удалить «${task.title}»?`)) return;
    await api.deleteTask(task.id);
    load();
    bumpRefresh?.();
  }

  return (
    <div className="screen">
      <h1>Inbox</h1>
      <p className="muted">{tasks.length ? `Неразобрано: ${tasks.length}` : 'Всё разобрано 🎉'}</p>

      {tasks.map((task) => (
        <div key={task.id} onClick={() => setOpenId(openId === task.id ? null : task.id)}>
          <TaskItem task={task} onToggle={toggle}>
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); remove(task); }} aria-label="удалить">🗑</button>
          </TaskItem>
          {openId === task.id && (
            <div className="card" onClick={(e) => e.stopPropagation()} style={{ marginTop: -6 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Домен</div>
              <div className="btn-row" style={{ marginTop: 0 }}>
                {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    className={`btn small ${task.domain === key ? 'active-choice' : ''}`}
                    onClick={() => patch(task, { domain: task.domain === key ? null : key })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>Контекст дня</div>
              <div className="btn-row" style={{ marginTop: 0 }}>
                {Object.entries(CONTEXT_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    className={`btn small ${task.day_context === key ? 'active-choice' : ''}`}
                    onClick={() => patch(task, { day_context: task.day_context === key ? null : key })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>Усилие</div>
              <div className="btn-row" style={{ marginTop: 0 }}>
                {Object.entries(EFFORT_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    className={`btn small ${task.effort === key ? 'active-choice' : ''}`}
                    onClick={() => patch(task, { effort: key })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>Дедлайн</div>
              <div className="btn-row" style={{ marginTop: 0, alignItems: 'center' }}>
                <input
                  type="date"
                  value={task.deadline || ''}
                  onChange={(e) => patch(task, { deadline: e.target.value || null, ...(e.target.value ? {} : { hard_deadline: false }) })}
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '5px 8px', fontSize: 13 }}
                />
                <button
                  className={`btn small ${task.hard_deadline ? 'active-choice' : ''}`}
                  disabled={!task.deadline}
                  onClick={() => patch(task, { hard_deadline: !task.hard_deadline })}
                  title="жёсткий дедлайн попадает в Google Calendar"
                >
                  ⏰ жёсткий
                </button>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button
                  className={`btn small ${task.week_flag ? 'active-choice' : ''}`}
                  onClick={() => patch(task, { week_flag: !task.week_flag })}
                >
                  ! на этой неделе
                </button>
                <button className="btn small" onClick={() => patch(task, { status: 'active' })}>→ в работу</button>
                <button className="btn small" onClick={() => patch(task, { status: 'someday' })}>→ когда-нибудь</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
