import React, { useEffect, useState, useCallback } from 'react';
import { api, DOMAIN_LABELS } from '../api.js';
import TaskItem from '../components/TaskItem.jsx';

// Бэклог: всё со статусом someday + фильтры по доменам. Открывается редко — это нормально.
export default function Backlog({ refreshKey, bumpRefresh }) {
  const [tasks, setTasks] = useState([]);
  const [domain, setDomain] = useState('');

  const load = useCallback(async () => {
    setTasks(await api.tasks({ status: 'someday', domain: domain || undefined }));
  }, [domain]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function activate(task) {
    await api.updateTask(task.id, { status: 'active' });
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
  }

  return (
    <div className="screen">
      <h1>Бэклог</h1>
      <p className="muted">Когда-нибудь · {tasks.length}</p>

      <div className="filter-row">
        <button className={`btn small ${domain === '' ? 'active-choice' : ''}`} onClick={() => setDomain('')}>Все</button>
        {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`btn small ${domain === key ? 'active-choice' : ''}`}
            onClick={() => setDomain(domain === key ? '' : key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tasks.length === 0 && (
        <div className="empty-state">
          <div className="big">🗄</div>
          Бэклог пуст{domain ? ' в этом домене' : ''}.
        </div>
      )}

      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onToggle={toggle}>
          <button className="btn small" onClick={() => activate(task)}>→ в работу</button>
          <button className="icon-btn" onClick={() => remove(task)} aria-label="удалить">🗑</button>
        </TaskItem>
      ))}
    </div>
  );
}
