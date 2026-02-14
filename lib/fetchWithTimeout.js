export async function fetchWithTimeout(input, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();

  // If caller provides a signal, mirror it
  if (init.signal) {
    try {
      if (init.signal.aborted) controller.abort();
      else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    } catch {
      // ignore
    }
  }

  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
