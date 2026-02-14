'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { authedFetch, resetLocalSession } from '@/lib/authedFetch'

export default function ProfilePage() {
  const supabase = useMemo(() => getSupabaseClient(), [])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [me, setMe] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const res = await authedFetch('/api/auth/me', supabase)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Fehler beim Laden')
        if (!mounted) return
        setMe(json)
      } catch (e) {
        if (!mounted) return
        setErr(e.message)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [supabase])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/80 border border-black/10 rounded-2xl p-5 shadow-sm text-black/60">
          Lade Profil…
        </div>
      </div>
    )
  }

  if (err) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/80 border border-black/10 rounded-2xl p-5 shadow-sm">
          <div className="text-lg font-semibold">Profil</div>
          <div className="mt-2 text-sm text-red-700">{err}</div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <a
              href="/login"
              className="h-10 px-4 rounded-full bg-white border border-black/10 shadow-sm inline-flex items-center"
            >
              Zum Login
            </a>
            <button
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

  const profile = me?.profile
  const group = me?.group

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white/80 border border-black/10 rounded-2xl p-6 shadow-sm">
        <div className="text-2xl font-semibold">Profil</div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-black/10">
            <div className="text-xs text-black/50">E-Mail</div>
            <div className="font-medium">{profile?.email || me?.user?.email || '—'}</div>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-black/10">
            <div className="text-xs text-black/50">Name</div>
            <div className="font-medium">{profile?.name || me?.user?.user_metadata?.full_name || '—'}</div>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-black/10">
            <div className="text-xs text-black/50">Gruppe</div>
            <div className="font-medium">{group?.name || '—'}</div>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-black/10">
            <div className="text-xs text-black/50">Admin</div>
            <div className="font-medium">{me?.isAdmin ? 'Ja' : 'Nein'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
