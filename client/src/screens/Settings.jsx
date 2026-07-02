import React, { useEffect, useState, useCallback } from 'react';
import { api, CONTEXT_LABELS } from '../api.js';
import { requestNotifyPermission } from '../notifications.js';

const WEEKDAY_LABELS = { 1: 'пн', 2: 'вт', 3: 'ср', 4: 'чт', 5: 'пт', 6: 'сб', 7: 'вс' };

export default function Settings({ refreshKey, bumpRefresh }) {
  const [dayTypes, setDayTypes] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [gcal, setGcal] = useState({ configured: false, connected: false });
  const [notifyState, setNotifyState] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  // Форма новой ротации
  const [showRotationForm, setShowRotationForm] = useState(false);
  const [newStart, setNewStart] = useState('');
  const [newRules, setNewRules] = useState({ 1: 'office', 2: 'office', 3: 'office', 4: 'remote', 5: 'remote', 6: 'weekend', 7: 'weekend' });

  const load = useCallback(async () => {
    const [dts, rots, status] = await Promise.all([api.dayTypes(), api.rotations(), api.gcalStatus()]);
    setDayTypes(dts);
    setRotations(rots);
    setGcal(status);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function setCapacity(dt, value) {
    const capacity = Math.max(1, Math.min(10, Number(value) || 1));
    await api.updateDayType(dt.id, { daily_capacity: capacity });
    load();
    bumpRefresh?.();
  }

  async function saveRotation() {
    if (!newStart) return alert('Укажи дату начала действия ротации');
    await api.addRotation(newStart, newRules);
    setShowRotationForm(false);
    load();
    bumpRefresh?.();
  }

  async function connectGcal() {
    try {
      const { url } = await api.gcalAuthUrl();
      window.open(url, '_blank');
    } catch (err) {
      alert(err.message);
    }
  }

  async function disconnectGcal() {
    if (!confirm('Отключить Google Calendar?')) return;
    await api.gcalDisconnect();
    load();
    bumpRefresh?.();
  }

  async function enableNotifications() {
    setNotifyState(await requestNotifyPermission());
  }

  const currentRotation = rotations[0];

  return (
    <div className="screen">
      <h1>Настройки</h1>

      <h2>Ёмкость дней</h2>
      <div className="card">
        {dayTypes.map((dt) => (
          <div key={dt.id} className="settings-row">
            <span>{dt.label} <span className="muted">({dt.name})</span></span>
            <input
              type="number"
              min="1"
              max="10"
              defaultValue={dt.daily_capacity}
              onBlur={(e) => Number(e.target.value) !== dt.daily_capacity && setCapacity(dt, e.target.value)}
            />
          </div>
        ))}
      </div>
      <p className="muted">Сколько задач максимум попадает в «Сегодня». Лучше 3 сделанные, чем 8 висящих.</p>

      <h2>Ротация</h2>
      <div className="card">
        {currentRotation && (
          <>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              Действует с {currentRotation.starts_on}
            </div>
            <div className="rotation-grid">
              {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
                <div key={wd} style={{ textAlign: 'center' }}>
                  <label>{WEEKDAY_LABELS[wd]}</label>
                  <span className="chip accent" style={{ display: 'inline-block' }}>
                    {dayTypes.find((dt) => dt.name === currentRotation.rules[wd])?.label?.slice(0, 4) || '—'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {!showRotationForm ? (
          <button className="btn" onClick={() => setShowRotationForm(true)}>Сменить ротацию</button>
        ) : (
          <>
            <div className="settings-row">
              <span>Действует с</span>
              <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
            </div>
            <div className="rotation-grid">
              {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
                <div key={wd}>
                  <label>{WEEKDAY_LABELS[wd]}</label>
                  <select value={newRules[wd]} onChange={(e) => setNewRules({ ...newRules, [wd]: e.target.value })}>
                    {dayTypes.map((dt) => (
                      <option key={dt.name} value={dt.name}>{dt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="btn-row">
              <button className="btn primary" onClick={saveRotation}>Сохранить</button>
              <button className="btn" onClick={() => setShowRotationForm(false)}>Отмена</button>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Старые планы не пересобираются задним числом — меняется только будущее.
            </p>
          </>
        )}
      </div>

      <h2>Google Calendar</h2>
      <div className="card">
        {!gcal.configured && (
          <p className="muted">
            Не настроено: заполни GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в файле <code>.env</code> сервера
            (см. .env.example) и перезапусти сервер.
          </p>
        )}
        {gcal.configured && !gcal.connected && (
          <button className="btn primary" onClick={connectGcal}>Подключить Google Calendar</button>
        )}
        {gcal.connected && (
          <div className="settings-row">
            <span>Подключён ✅</span>
            <button className="btn small" onClick={disconnectGcal}>Отключить</button>
          </div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>
          Чтение встреч для расчёта ёмкости дня; жёсткие дедлайны попадают в календарь «Tracker».
        </p>
      </div>

      <h2>Уведомления</h2>
      <div className="card">
        {notifyState === 'unsupported' && <p className="muted">Браузер не поддерживает уведомления.</p>}
        {notifyState === 'granted' && <p className="muted">Включены: утреннее «план собран» и напоминание за день до жёсткого дедлайна.</p>}
        {notifyState === 'denied' && <p className="muted">Запрещены в браузере — разреши в настройках сайта.</p>}
        {notifyState === 'default' && (
          <button className="btn" onClick={enableNotifications}>Включить уведомления</button>
        )}
      </div>

      <h2>Контексты дня</h2>
      <p className="muted">
        {Object.entries(CONTEXT_LABELS).map(([k, v]) => `${v} (${k})`).join(' · ')}
      </p>
    </div>
  );
}
