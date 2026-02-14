'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabaseClient'
import Dock from './Dock'
import { readCachedSession, clearCachedSession, cacheSession } from '@/lib/sessionCache'

function fmtDateTime(d) {
  const w = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${w[d.getDay()]}, ${dd}.${mm}. · ${hh}:${mi}`
}

function ShellInner({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const q = searchParams.get('q') || ''

  const supabase = useMemo(() => getSupabaseClient(), [])
  const [now, setNow] = useState(() => new Date())
  const [session, setSession] = useState(null)

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  // auth state (with localStorage fast path)
  useEffect(() => {
    // Fast path: cached session (avoids getSession hang)
    const cached = readCachedSession()
    if (cached) setSession(cached)

    // Live updates
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (s) cacheSession(s)
      else clearCachedSession()
      setSession(s)
    })

    return () => sub?.subscription?.unsubscribe?.()
  }, [supabase])

  const isLoggedIn = !!session

  async function doLogout() {
    // Don't let logout hang forever.
    let t
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error('Logout Timeout')), 12_000)
    })

    try {
      await Promise.race([supabase.auth.signOut(), timeout])
    } catch {
      // If signOut hangs/fails, clear local session as fallback
      clearCachedSession()
    } finally {
      clearTimeout(t)
      clearCachedSession()
      setSession(null)
      // Hard navigation to guarantee a clean state
      window.location.assign('/login')
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#f2f3f7] text-[#111] flex items-center justify-center p-4">
      <div className="w-full max-w-[1200px] bg-white/60 backdrop-blur rounded-[28px] shadow-xl border border-black/5 overflow-hidden flex flex-col">
        {/* Statusbar */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3">
          <div className="h-7 w-24 rounded-full bg-black/10" />
          <div className="text-sm text-black/60 whitespace-nowrap">{fmtDateTime(now)}</div>
          <div className="flex-1" />
          <div className="max-w-[520px] w-full">
            <input
              value={q}
              onChange={(e) => {
                const v = e.target.value
                const params = new URLSearchParams(searchParams.toString())
                if (v) params.set('q', v)
                else params.delete('q')
                router.push(`${pathname}?${params.toString()}`)
              }}
              placeholder="Suche Apps…"
              className="w-full h-10 rounded-full px-4 bg-white border border-black/10 shadow-sm outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <button
                  onClick={() => router.push('/settings')}
                  className="h-10 w-10 rounded-full bg-white border border-black/10 shadow-sm flex items-center justify-center"
                  title="Einstellungen"
                >
                  ⚙️
                </button>
                <button
                  onClick={doLogout}
                  className="h-10 px-3 rounded-full bg-white border border-black/10 shadow-sm text-sm"
                  title="Logout"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="h-10 px-3 rounded-full bg-white border border-black/10 shadow-sm text-sm"
                title="Login"
              >
                Login
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-5">{children}</div>

        {/* Dock */}
        <Dock />
      </div>
    </div>
  )
}

export default function Shell({ children }) {
  // Shell uses useSearchParams -> needs Suspense boundary
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-[#f2f3f7]" />}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  )
}
