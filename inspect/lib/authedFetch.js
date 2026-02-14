import { getCachedAccessToken, clearCachedSession } from './sessionCache'

function timeout(ms, msg = 'Timeout') {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
}

/**
 * Returns an access token.
 * Strategy:
 * 1) Fast path: read from localStorage (works even if supabase.auth.getSession hangs)
 * 2) Fallback: supabase.auth.getSession() with timeout
 */
export async function getAccessToken(supabase) {
  // 1) localStorage fast path
  const cached = getCachedAccessToken()
  if (cached) return cached

  if (!supabase?.auth?.getSession) return null

  try {
    const { data } = await Promise.race([
      supabase.auth.getSession(),
      timeout(6000, 'Timeout: Supabase auth/getSession hängt (Storage/Session evtl. kaputt).'),
    ])
    return data?.session?.access_token || null
  } catch (e) {
    // If getSession hangs repeatedly, cached session might be corrupted.
    // We do NOT auto-clear here to avoid accidental logouts; user can press "Reset".
    throw e
  }
}

export async function authedFetch(url, supabase, options = {}) {
  const token = await getAccessToken(supabase)
  if (!token) throw new Error('Nicht eingeloggt (kein Access Token).')

  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${token}`)

  return fetch(url, {
    ...options,
    headers,
  })
}

export function resetLocalSession() {
  clearCachedSession()
  if (typeof window !== 'undefined') window.location.href = '/login'
}
