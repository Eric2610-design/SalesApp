'use client';

import { useEffect, useRef, useState } from 'react';

function toMessage(err) {
  if (!err) return 'Unbekannter Fehler';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'object') {
    const msg = err.message || err.error_description || err.error || '';
    if (msg) return msg;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

function clip(str, max = 220) {
  const s = (str || '').toString();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export default function GlobalErrors() {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  function push(kind, message, details) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const entry = {
      id,
      kind,
      message: clip(message || 'Fehler'),
      details: details ? clip(details, 600) : '',
      ts: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    setItems((prev) => [entry, ...prev].slice(0, 5));
    const t = setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, 9000);
    timers.current.set(id, t);
  }

  function remove(id) {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  async function copy(entry) {
    const text = `[${entry.ts}] ${entry.kind}: ${entry.message}${entry.details ? `\n${entry.details}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      push('Info', 'In Zwischenablage kopiert', '');
    } catch {}
  }

  useEffect(() => {
    function onError(event) {
      const msg = toMessage(event?.error) || event?.message || 'Fehler';
      push('Error', msg, event?.filename ? `${event.filename}:${event.lineno || ''}` : '');
    }
    function onRejection(event) {
      const msg = toMessage(event?.reason);
      push('Unhandled', msg, '');
    }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  if (!items.length) return null;

  return (
    <div style={{
      position:'fixed', top:16, left:'50%', transform:'translateX(-50%)',
      width:'min(560px, calc(100vw - 24px))', zIndex:9999, pointerEvents:'none'
    }}>
      {items.map((it) => (
        <div key={it.id} style={{
          pointerEvents:'auto', marginBottom:10, padding:'10px 12px', borderRadius:14,
          background: it.kind === 'Info' ? 'rgba(59,130,246,.12)' : it.kind === 'Unhandled' ? 'rgba(245,158,11,.14)' : 'rgba(239,68,68,.12)',
          border: it.kind === 'Info' ? '1px solid rgba(59,130,246,.25)' : it.kind === 'Unhandled' ? '1px solid rgba(245,158,11,.28)' : '1px solid rgba(239,68,68,.25)',
          boxShadow:'0 8px 30px rgba(0,0,0,.08)', backdropFilter:'blur(10px)'
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'flex-start' }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:13 }}>
                {it.kind} <span style={{ fontWeight:500, opacity:.7 }}>· {it.ts}</span>
              </div>
              <div style={{ marginTop:4, fontSize:13, lineHeight:1.35, wordBreak:'break-word' }}>{it.message}</div>
              {it.details ? <div style={{ marginTop:6, fontSize:12, opacity:.75, wordBreak:'break-word' }}>{it.details}</div> : null}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => copy(it)} className="secondary" style={{ padding:'6px 8px', borderRadius:10 }}>⧉</button>
              <button type="button" onClick={() => remove(it.id)} className="secondary" style={{ padding:'6px 8px', borderRadius:10 }}>✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
