const KEY = 'salesapp.widgets.v1';

export function loadWidgets() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWidgets(widgets) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(widgets || []));
}
