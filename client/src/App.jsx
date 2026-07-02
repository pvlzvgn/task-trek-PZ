import React, { useState, useEffect, useCallback } from 'react';
import Today from './screens/Today.jsx';
import Inbox from './screens/Inbox.jsx';
import Week from './screens/Week.jsx';
import Backlog from './screens/Backlog.jsx';
import Settings from './screens/Settings.jsx';
import QuickInput from './components/QuickInput.jsx';
import { api } from './api.js';

const TABS = [
  { id: 'today', label: 'Сегодня', icon: '☀️', component: Today },
  { id: 'inbox', label: 'Inbox', icon: '📥', component: Inbox },
  { id: 'week', label: 'Неделя', icon: '🗓', component: Week },
  { id: 'backlog', label: 'Бэклог', icon: '🗄', component: Backlog },
  { id: 'settings', label: 'Ещё', icon: '⚙️', component: Settings },
];

export default function App() {
  const [tab, setTab] = useState('today');
  const [refreshKey, setRefreshKey] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    api.tasks({ status: 'inbox' }).then((t) => setInboxCount(t.length)).catch(() => {});
  }, [refreshKey, tab]);

  const Active = TABS.find((t) => t.id === tab).component;

  return (
    <div className="app">
      <Active refreshKey={refreshKey} bumpRefresh={bumpRefresh} />

      <div className="bottom-dock">
        <div className="bottom-dock-inner">
          <QuickInput onAdded={bumpRefresh} />
          <nav className="tabbar">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                {t.id === 'inbox' && inboxCount > 0 && <span className="badge">{inboxCount}</span>}
                <span className="tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
