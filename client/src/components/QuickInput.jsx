import React, { useState } from 'react';
import { api } from '../api.js';

// Мгновенный ввод: доступен с любого экрана, задача в системе за ≤5 секунд.
// Синтаксис: «!» = на этой неделе, «@15.07» = дедлайн.
export default function QuickInput({ onAdded }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await api.quickAdd(value);
      setText('');
      onAdded?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="quick-input" onSubmit={submit}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Новая задача…  (! — на неделе, @15.07 — дедлайн)"
        enterKeyHint="done"
      />
      <button type="submit" disabled={busy} aria-label="добавить">+</button>
    </form>
  );
}
