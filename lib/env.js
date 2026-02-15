export function getEnv(name, fallback = undefined) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') return fallback;
  return v;
}

export function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function parseCsvList(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
