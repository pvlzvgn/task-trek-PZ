// Работа с локальными датами в формате YYYY-MM-DD (без UTC-сдвигов)

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return todayStr(dt);
}

// ISO-номер дня недели: 1 = пн … 7 = вс
export function isoWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay(); // 0 = вс
  return wd === 0 ? 7 : wd;
}

// Понедельник недели, в которую входит дата
export function mondayOf(dateStr) {
  return addDays(dateStr, 1 - isoWeekday(dateStr));
}

export function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
