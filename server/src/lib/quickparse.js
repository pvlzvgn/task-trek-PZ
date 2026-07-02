import { todayStr } from './dates.js';

// Минимальный синтаксис быстрого ввода (без NLP):
//   !            → week_flag
//   @15.07       → deadline 15 июля (ближайший будущий год, если месяц уже прошёл)
//   @15.07.2026  → deadline с явным годом
//   @2026-07-15  → ISO-дата
// Пример: «записаться к дантисту @15.07 !»
export function parseQuickInput(text, now = new Date()) {
  let title = text.trim();
  const result = { week_flag: 0, deadline: null };

  // @дата
  const dateMatch = title.match(/@(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}(?:\.\d{4})?)/);
  if (dateMatch) {
    const raw = dateMatch[1];
    let iso = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      iso = raw;
    } else {
      const parts = raw.split('.').map(Number);
      const [dd, mm] = parts;
      let year = parts[2];
      if (!year) {
        year = now.getFullYear();
        const candidate = new Date(year, mm - 1, dd);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (candidate < today) year += 1; // дата уже прошла — значит следующий год
      }
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        iso = todayStr(new Date(year, mm - 1, dd));
      }
    }
    if (iso) {
      result.deadline = iso;
      title = title.replace(dateMatch[0], '').trim();
    }
  }

  // ! в любом месте строки (отдельным токеном или на конце слова)
  if (/(^|\s)!(\s|$)/.test(title) || /!$/.test(title.trim())) {
    result.week_flag = 1;
    title = title.replace(/(^|\s)!(\s|$)/g, ' ').replace(/!+$/, '').trim();
  }

  result.title = title.replace(/\s{2,}/g, ' ').trim();
  return result;
}
