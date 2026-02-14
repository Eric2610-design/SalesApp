'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { authedFetch, getAccessToken, resetLocalSession } from '@/lib/authedFetch'

export default function InstallerPage() {
  const supabase = useMemo(() => getSupabaseClient(), [])
  const [status, setStatus] = useState('Lade…')
  const [token, setToken] = useState('—')
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setBusy(true)
      setStatus('Lade…')
      try {
        const t = await getAccessToken(supabase)
        if (!mounted) return
        setToken(t ? 'ok' : '—')
        setSession(Boolean(t))
        if (!t) {
          setStatus('Nicht eingeloggt. Bitte einloggen.')
          return
        }

        // Quick admin check via endpoint
        const res = await authedFetch('/api/auth/me', supabase)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Profil konnte nicht geladen werden')
        if (!json?.isAdmin) {
          setStatus('Nur Admin.')
          return
        }

        setStatus('Bereit. Wähle ein Example oder lade eine Install-Datei hoch.')
      } catch (e) {
        if (!mounted) return
        setStatus(`Fehler: ${e.message}`)
      } finally {
        if (mounted) setBusy(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [supabase])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white/80 border border-black/10 rounded-2xl p-5 shadow-sm">
        <div className="text-2xl font-semibold">Installer</div>
        <div className="text-sm text-black/60 mt-1">{status}</div>
        <div className="text-xs text-black/50 mt-2">Session: {String(session)} · Token: {token}</div>

        <div className="mt-4 flex gap-2 flex-wrap">
          <a
            href="/"
            className="h-10 px-4 rounded-full bg-white border border-black/10 shadow-sm inline-flex items-center"
          >
            Homescreen →
          </a>
          <a
            href="/login"
            className="h-10 px-4 rounded-full bg-white border border-black/10 shadow-sm inline-flex items-center"
          >
            Login →
          </a>
          <button
            disabled={busy}
            onClick={resetLocalSession}
            className="h-10 px-4 rounded-full bg-white border border-black/10 shadow-sm"
            title="Falls Supabase-Session hängt: LocalStorage Session löschen und neu einloggen"
          >
            Session reset
          </button>
        </div>
      </div>
    </div>
  )
}
