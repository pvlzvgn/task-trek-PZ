import React from 'react';
import { DOMAIN_LABELS, CONTEXT_LABELS } from '../api.js';

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}`;
}

// Строка задачи: чекбокс + название + чипы. Действия справа передаются через children.
export default function TaskItem({ task, onToggle, children, todayStr }) {
  const done = task.status === 'done';
  const overdue = !done && task.deadline && todayStr && task.deadline < todayStr;
  return (
    <div className={`card ${done ? 'fade-done' : ''}`}>
      <div className="task-row">
        {onToggle && (
          <button
            className={`task-check ${done ? 'done' : ''}`}
            onClick={() => onToggle(task)}
            aria-label={done ? 'вернуть в работу' : 'выполнено'}
          >
            ✓
          </button>
        )}
        <div className="task-body">
          <div className={`task-title ${done ? 'done' : ''}`}>{task.title}</div>
          <div className="task-meta">
            {task.deadline && (
              <span className={`chip ${task.hard_deadline ? 'red' : overdue ? 'amber' : ''}`}>
                {task.hard_deadline ? '⏰ ' : '📅 '}
                {fmtDate(task.deadline)}
              </span>
            )}
            {task.week_flag && <span className="chip accent">на этой неделе</span>}
            {task.domain && <span className="chip">{DOMAIN_LABELS[task.domain]}</span>}
            {task.day_context && task.day_context !== 'any' && (
              <span className="chip">{CONTEXT_LABELS[task.day_context]}</span>
            )}
            {task.effort === 'quick' && <span className="chip green">⚡ быстро</span>}
            {task.effort === 'deep' && <span className="chip amber">🧠 фокус</span>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
