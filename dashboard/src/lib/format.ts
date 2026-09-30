const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')

export function clock(ms: number) {
  const s = Math.max(0, ms) / 1000
  const h = s / 3600
  return h >= 1 ? `${pad(h)}:${pad((s % 3600) / 60)}:${pad(s % 60)}` : `${pad(s / 60)}:${pad(s % 60)}`
}

export function tplus(t: number, start: number) {
  return `T+${clock(t - start)}`
}

export function dur(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${pad(s % 60)}s`
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`
}

export function ago(t: number | null | undefined, now = Date.now()) {
  if (!t) return 'never'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 5) return 'now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function shortPath(p: string, workspace?: string) {
  let s = p
  if (workspace && s.startsWith(workspace)) s = s.slice(workspace.length).replace(/^\//, '')
  const parts = s.split('/')
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : s
}

export function pct(n: number | null | undefined) {
  return n == null ? '—' : `${Math.round(n * 100)}%`
}

export const KIND_LABEL: Record<string, string> = {
  overengineering: 'Over-engineering',
  stuck: 'Stuck / looping',
  'full-build': 'Full build',
  'off-scope': 'Off scope',
  'no-proof': 'Missing proof',
  integration: 'Not integrated',

  other: 'Other',
}
