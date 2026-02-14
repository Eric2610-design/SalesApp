// Small fetch wrapper that aborts requests after a timeout.
// Helps avoid UI "freezes" when the network or CORS blocks a request.

export function fetchWithTimeout(input, init = {}, timeoutMs = 15000) {
  // If a signal is already provided, we can't reliably merge signals.
  // In that case, just use the provided signal.
  if (init?.signal) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(id);
  });
}
