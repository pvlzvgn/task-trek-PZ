// Тонкий клиент REST API. Токен (если задан на сервере) кладётся в localStorage.api_token — это UI-настройка.
async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem('api_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error || data?.errors?.join('; ') || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  today: (date) => request(`/api/today${date ? `?date=${date}` : ''}`),
  rebuildToday: () => request('/api/today/rebuild', { method: 'POST', body: '{}' }),
  addToToday: (taskId) => request('/api/today/tasks', { method: 'POST', body: JSON.stringify({ task_id: taskId }) }),
  removeFromToday: (taskId) => request(`/api/today/tasks/${taskId}`, { method: 'DELETE' }),

  tasks: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return request(`/api/tasks${qs.toString() ? `?${qs}` : ''}`);
  },
  quickAdd: (text) => request('/api/tasks/quick', { method: 'POST', body: JSON.stringify({ text }) }),
  createTask: (fields) => request('/api/tasks', { method: 'POST', body: JSON.stringify(fields) }),
  updateTask: (id, fields) => request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  completeTask: (id) => request(`/api/tasks/${id}/complete`, { method: 'POST' }),
  reopenTask: (id) => request(`/api/tasks/${id}/reopen`, { method: 'POST' }),

  week: (start) => request(`/api/week${start ? `?start=${start}` : ''}`),

  dayTypes: () => request('/api/day-types'),
  updateDayType: (id, fields) => request(`/api/day-types/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  rotations: () => request('/api/rotations'),
  addRotation: (starts_on, rules) => request('/api/rotations', { method: 'POST', body: JSON.stringify({ starts_on, rules }) }),

  settings: () => request('/api/settings'),
  updateSettings: (fields) => request('/api/settings', { method: 'PATCH', body: JSON.stringify(fields) }),

  gcalStatus: () => request('/api/gcal/status'),
  gcalAuthUrl: () => request('/api/gcal/auth-url'),
  gcalDisconnect: () => request('/api/gcal/disconnect', { method: 'POST' }),
};

export const DOMAIN_LABELS = {
  pa_practice: 'ПА-практика',
  fitness: 'Зал',
  piano: 'Пианино',
  finance: 'Финансы',
  health: 'Здоровье',
  life: 'Быт',
};

export const CONTEXT_LABELS = {
  office: 'Офис',
  remote: 'Удалёнка',
  weekend: 'Выходной',
  any: 'Любой',
};

export const EFFORT_LABELS = {
  quick: '⚡ <15 мин',
  normal: 'Обычная',
  deep: '🧠 Фокус',
};
