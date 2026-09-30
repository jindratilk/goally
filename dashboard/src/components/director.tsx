import { AnimatePresence, motion } from 'motion/react'
import { Check, Radar, Send, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Config, Mission, Overview } from '@/lib/api'
import { post } from '@/lib/api'
import { KIND_LABEL, ago, dur } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dot, Empty, Note, Panel, Tag } from './blueprint'

const STEPS = ['queued', 'delivered', 'ack'] as const

function stepIndex(status: string) {
  if (status === 'queued') return 0
  if (status === 'delivered') return 1
  return 2
}

export function FlightDirector({ mission, overview, config, now, readOnly }: { mission: Mission; overview: Overview; config: Config; now: number; readOnly: boolean }) {
  const [text, setText] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [busy, setBusy] = useState(false)
  const sup = mission.supervisor
  const interval = config.supervisor.intervalMin * 60000
  const nextAt = sup.lastRunAt ? sup.lastRunAt + interval : mission.startedAt + interval
  const live = mission.status === 'active'
  const open = mission.findings.filter((f) => f.status === 'open')
  const closed = mission.findings.filter((f) => f.status !== 'open').slice(-3).reverse()
  const messages = [...mission.messages].reverse().slice(0, 8)

  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await post(`/api/missions/${mission.id}/message`, { text, urgent })
      setText('')
      toast.success('Message queued for MAIN', { description: overview.bridge.available ? 'Delivering through Desktop Bridge' : 'Delivered on the next manager tool call or stop' })
    } catch (e) {
      toast.error(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }
  const supervise = async () => {
    try {
      await post(`/api/missions/${mission.id}/supervise`)
      toast('Flight Director check started', { description: 'Grok Build is reviewing the mission read-only' })
    } catch (e) {
      toast.error(String((e as Error).message))
    }
  }
  const setFinding = async (id: string, status: 'resolved' | 'dismissed') => {
    try {
      await post(`/api/missions/${mission.id}/finding/${id}`, { status })
    } catch (e) {
      toast.error(String((e as Error).message))
    }
  }

  return (
    <Panel
      code="05"
      title="Flight Director"
      aside={
        !readOnly && (
          <button className="btn-x sm" onClick={supervise} disabled={sup.running || !overview.supervisor.available}>
            <Radar className="size-3.5" />
            {sup.running ? 'Checking…' : 'Check now'}
          </button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3 rounded-[4px] border border-line-2 p-3">
          <div>
            <span className="label label-sm">Engine</span>
            <div className="mt-1 flex items-center gap-2 text-[13px]">
              <Dot tone={overview.supervisor.available ? (sup.lastOk === false ? 'warn' : 'go') : 'nogo'} pulse={sup.running} />
              Grok Build
            </div>
          </div>
          <div>
            <span className="label label-sm">Last check</span>
            <div className="mono mt-1 text-[13px] tabnum">{ago(sup.lastRunAt, now)}</div>
          </div>
          <div>
            <span className="label label-sm">Next</span>
            <div className="mono mt-1 text-[13px] tabnum">{!config.supervisor.enabled ? 'off' : !live ? '—' : sup.running ? 'running' : nextAt <= now ? 'due' : `in ${dur(nextAt - now)}`}</div>
          </div>
          {(sup.lastSummary || sup.lastError) && (
            <p className={cn('col-span-3 border-t border-line-2 pt-2 text-[12px]', sup.lastOk === false ? 'text-warn' : 'text-ink-2')}>
              {sup.lastOk === false ? `Last run failed: ${sup.lastError}` : sup.lastSummary}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="label">Open findings</span>
            <span className="mono ml-auto text-[11px] text-ink-3">{open.length}</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {open.map((f) => (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn('rounded-[4px] border p-3', f.severity === 'high' ? 'hatch-nogo border-nogo/40' : 'hatch-warn border-warn/40')}
                >
                  <div className="flex items-center gap-2">
                    <Tag tone={f.severity === 'high' ? 'nogo' : 'warn'}>{f.severity}</Tag>
                    <span className="label label-sm">{KIND_LABEL[f.kind] ?? f.kind}</span>
                    {f.taskId && <span className="mono text-[11px] text-ink-2">{f.taskId}</span>}
                    <span className="mono ml-auto text-[10px] text-ink-3">{f.id}</span>
                  </div>
                  <p className="mt-2 text-[14px] leading-snug">{f.title}</p>
                  {f.detail && <p className="mt-1 text-[12px] text-ink-2">{f.detail}</p>}
                  {f.action && (
                    <p className="mt-2 text-[12px]">
                      <span className="label label-sm mr-1 text-ink">Action</span>
                      <span className="text-ink-2">{f.action}</span>
                    </p>
                  )}
                  {!readOnly && (
                    <div className="mt-3 flex gap-2">
                      <button className="btn-x sm" onClick={() => setFinding(f.id, 'resolved')}>
                        <Check className="size-3" /> Resolved
                      </button>
                      <button className="btn-x sm" onClick={() => setFinding(f.id, 'dismissed')}>
                        <X className="size-3" /> Dismiss
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {open.length === 0 && <Empty>No open findings. The director is watching.</Empty>}
            {closed.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-[12px] text-ink-3">
                <Dot tone={f.status === 'resolved' ? 'go' : 'mute'} />
                <span className="mono text-[11px]">{f.id}</span>
                <span className="truncate line-through decoration-ink-3/50">{f.title}</span>
                <span className="ml-auto shrink-0 uppercase tracking-[0.12em]">{f.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="label">Messages to MAIN</span>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-3">
              <Dot tone={overview.bridge.available ? 'go' : 'warn'} />
              {overview.bridge.available ? 'Desktop Bridge' : 'Hook delivery'}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {messages.length === 0 && <Empty>Nothing sent yet.</Empty>}
            {messages.map((m) => {
              const idx = stepIndex(m.status)
              const bad = m.status === 'rejected'
              return (
                <div key={m.id} className="rounded-[4px] border border-line-2 p-3">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="mono text-ink-2">{m.id}</span>
                    <span className="label label-sm">{m.from === 'user' ? 'You' : 'Director'}</span>
                    {m.severity === 'high' && <Tag tone="nogo">urgent</Tag>}
                    <span className="ml-auto text-ink-3">{ago(m.t, now)}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[13px] text-ink-2">{m.text}</p>
                  <div className="mt-3 flex items-center gap-1.5">
                    {STEPS.map((s, i) => (
                      <div key={s} className="flex flex-1 items-center gap-1.5">
                        <span className={cn('h-[2px] flex-1', i <= idx ? (bad && i === 2 ? 'bg-nogo' : 'bg-ink') : 'bg-line')} />
                        <span className={cn('label label-sm', i <= idx ? 'text-ink' : 'text-ink-3', bad && i === 2 && 'text-nogo')}>
                          {i === 2 && idx === 2 ? m.status : i === 1 && m.via ? `${s} · ${m.via}` : s}
                        </span>
                      </div>
                    ))}
                  </div>
                  {m.ackNote && <p className="mt-2 text-[12px] text-ink-3">↳ {m.ackNote}</p>}
                </div>
              )
            })}
          </div>
          {!readOnly && mission.status !== 'complete' && (
            <div className="mt-3 rounded-[4px] border border-line p-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
                }}
                placeholder="Tell the manager what to change…"
                className="min-h-16 resize-none border-0 bg-transparent px-2 text-[14px] shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center gap-3 px-2 pb-1">
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-2">
                  <Switch checked={urgent} onCheckedChange={setUrgent} size="sm" />
                  Urgent · interrupt
                </label>
                <button className="btn-x sm solid ml-auto" disabled={busy || !text.trim()} onClick={send}>
                  <Send className="size-3" /> Send
                </button>
              </div>
            </div>
          )}
          {readOnly && <Note className="mt-3 block text-[13px]">read-only on remote · send from your Mac</Note>}
        </div>
      </div>
    </Panel>
  )
}
