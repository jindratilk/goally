import { useMemo, useState } from 'react'
import type { Mission } from '@/lib/api'
import { shortPath, tplus } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Empty, Panel } from './blueprint'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'proof', label: 'Proof' },
  { key: 'agents', label: 'Agents' },
] as const

export function Telemetry({ mission }: { mission: Mission }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const items = useMemo(() => {
    const all = [...mission.timeline].reverse()
    if (filter === 'alerts') return all.filter((e) => e.level === 'warn' || e.level === 'error')
    if (filter === 'proof') return all.filter((e) => e.kind === 'proof' || e.kind === 'test')
    if (filter === 'agents') return all.filter((e) => e.kind === 'agent')
    return all
  }, [mission.timeline, filter])
  return (
    <Panel
      code="06"
      title="Telemetry"
      aside={
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn('rounded-[3px] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]', filter === f.key ? 'bg-ink text-black' : 'text-ink-3 hover:text-ink')}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <ol className="thin-scroll max-h-[420px] overflow-y-auto px-4 py-3 sm:px-5">
        {items.length === 0 && <Empty>No events.</Empty>}
        {items.map((e) => (
          <li key={e.seq} className="grid grid-cols-[76px_1fr] gap-3 border-b border-line-2 py-1.5 last:border-0">
            <span className="mono text-[11px] text-ink-3 tabnum">{tplus(e.t, mission.startedAt)}</span>
            <span
              className={cn(
                'mono min-w-0 text-[12px] break-words',
                e.level === 'warn' && 'text-warn',
                e.level === 'error' && 'text-nogo',
                e.level === 'ok' && 'text-go',
                (!e.level || e.level === 'info') && 'text-ink-2',
              )}
            >
              {e.text}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

export function Files({ mission }: { mission: Mission }) {
  const collided = new Set(mission.collisions.map((c) => c.path))
  const files = [...mission.files].sort((a, b) => Number(collided.has(b.path)) - Number(collided.has(a.path)) || b.count - a.count).slice(0, 12)
  const label = (id: string) => (/^CT-\d+$/.test(id) ? id : mission.agents.find((a) => a.id === id)?.taskId ?? (id === 'main' ? 'MAIN' : id.slice(0, 6)))
  return (
    <Panel code="07" title="Files touched" aside={<span className="mono text-[11px] text-ink-3">{mission.files.length}</span>}>
      {files.length === 0 && <Empty>No edits yet.</Empty>}
      <ul className="flex flex-col">
        {files.map((f) => (
          <li key={f.path} className={cn('flex items-center gap-3 border-b border-line-2 py-2 last:border-0', collided.has(f.path) && 'text-nogo')}>
            <span className="mono min-w-0 flex-1 truncate text-[12px]" title={f.path}>
              {shortPath(f.path, mission.workspace)}
            </span>
            <span className="flex shrink-0 gap-1">
              {f.agents.map((a) => (
                <span key={a} className={cn('mono rounded-[2px] border px-1 text-[10px]', collided.has(f.path) ? 'border-nogo/50' : 'border-line text-ink-3')}>
                  {label(a)}
                </span>
              ))}
            </span>
            <span className="mono w-6 shrink-0 text-right text-[11px] text-ink-3 tabnum">×{f.count}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
