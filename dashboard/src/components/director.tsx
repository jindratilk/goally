import { AnimatePresence, motion } from 'motion/react'
import { Check, CheckCheck, Clock, Loader2, Radar, Send, X } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { post, type Mission, type Overview } from '@/lib/api'
import { ago, KIND_LABEL } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dot, EmptyState, Pill, Segmented, type Tone } from './shared'

const SEV: Record<string, Tone> = { high: 'danger', medium: 'warning', low: 'neutral' }
const kindConfig = { n: { label: 'Findings', color: 'var(--chart-1)' } } satisfies ChartConfig

const STEPS = ['queued', 'delivered', 'accepted'] as const
function Pipeline({ status }: { status: string }) {
  const rejected = status === 'rejected'
  const idx = status === 'resolved' ? 2 : STEPS.indexOf(status as (typeof STEPS)[number])
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
      {STEPS.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          {i > 0 && <span className={`h-px w-3 ${i <= idx ? 'bg-foreground' : 'bg-border'}`} />}
          <span className={i <= idx ? (rejected && i === 2 ? 'text-danger' : 'text-foreground') : ''}>{rejected && i === 2 ? 'rejected' : s === 'accepted' ? 'ack' : s}</span>
        </span>
      ))}
    </div>
  )
}

export function Director({ mission, overview, now, readOnly, refresh }: { mission: Mission; overview: Overview; now: number; readOnly: boolean; refresh: () => void }) {
  const [show, setShow] = useState<'open' | 'closed'>('open')
  const [text, setText] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [sending, setSending] = useState(false)
  const cfg = overview.config
  const sup = mission.supervisor
  const open = mission.findings.filter((f) => f.status === 'open')
  const closed = mission.findings.filter((f) => f.status !== 'open')
  const list = [...(show === 'open' ? open : closed)].reverse()
  const kinds = Object.entries(mission.stats.findingsByKind).map(([k, n]) => ({ kind: KIND_LABEL[k] ?? k, n }))
  const next = cfg.supervisor.enabled && sup.lastRunAt ? sup.lastRunAt + cfg.supervisor.intervalMin * 60000 : null
  const base = `/api/missions/${mission.id}`

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
      refresh()
    } catch (e) {
      toast.error(String((e as Error).message))
    }
  }

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    await act(() => post(`${base}/message`, { text, urgent }), 'Queued for the main chat')
    setText('')
    setUrgent(false)
    setSending(false)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <div className="flex flex-col gap-4 xl:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>Findings</CardTitle>
            <CardDescription>What the Goal Director flagged and what it asked the manager to do.</CardDescription>
            <CardAction>
              <Segmented
                value={show}
                onChange={setShow}
                options={[
                  { value: 'open', label: 'Open', count: open.length },
                  { value: 'closed', label: 'Closed', count: closed.length },
                ]}
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            {list.length === 0 ? (
              <EmptyState icon={CheckCheck} title={show === 'open' ? 'Nothing flagged' : 'No closed findings'} />
            ) : (
              <ul className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {list.map((f) => (
                    <motion.li key={f.id} layout exit={{ height: 0, marginTop: 0 }} className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
                      <div className="flex flex-col gap-2 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Pill tone={f.status === 'open' ? SEV[f.severity] : 'neutral'}>{f.severity}</Pill>
                          <span>{KIND_LABEL[f.kind] ?? f.kind}</span>
                          {f.taskId && <span className="font-mono">· {f.taskId}</span>}
                          <span className="ml-auto">{f.status === 'open' ? ago(f.t, now) : f.status}</span>
                        </div>
                        <div className="text-sm font-medium">{f.title}</div>
                        {f.detail && <p className="text-sm text-muted-foreground">{f.detail}</p>}
                        {f.action && <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm">{f.action}</p>}
                        {!readOnly && (
                          <div className="flex gap-2">
                            {f.status === 'open' ? (
                              <>
                                <Button size="sm" variant="outline" onClick={() => act(() => post(`${base}/finding/${f.id}`, { status: 'resolved' }), `${f.id} resolved`)}>
                                  <Check /> Resolved
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => act(() => post(`${base}/finding/${f.id}`, { status: 'dismissed' }), `${f.id} dismissed`)}>
                                  <X /> Dismiss
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => act(() => post(`${base}/finding/${f.id}`, { status: 'open' }), `${f.id} reopened`)}>
                                Reopen
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </CardContent>
        </Card>

        {kinds.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>By kind</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={kindConfig} className="aspect-auto w-full" style={{ height: 28 + kinds.length * 30 }}>
                <BarChart data={kinds} layout="vertical" margin={{ left: 0, right: 24 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="kind" width={120} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="n" fill="var(--color-n)" radius={4} barSize={14} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Grok Build</CardTitle>
            <CardDescription>{cfg.supervisor.enabled ? `Checks every ${cfg.supervisor.intervalMin} min${cfg.supervisor.triggerOnAgentStop ? ' and after each agent' : ''}` : 'Paused in settings'}</CardDescription>
            <CardAction>
              {!readOnly && (
                <Button size="sm" disabled={sup.running || !overview.supervisor.available} onClick={() => act(() => post(`${base}/supervise`), 'Goal Director check started')}>
                  {sup.running ? <Loader2 className="animate-spin" /> : <Radar />}
                  Check now
                </Button>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Last check</div>
                <div className="flex items-center gap-1.5">
                  {sup.lastRunAt && <Dot tone={sup.lastOk ? 'success' : 'danger'} />}
                  {sup.running ? 'Running…' : ago(sup.lastRunAt, now)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Next check</div>
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted-foreground" />
                  {next ? (next > now ? `in ${Math.ceil((next - now) / 60000)} min` : 'due') : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Runs</div>
                <div className="tabnum">{sup.runs}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cost</div>
                <div className="tabnum">${sup.costUsd.toFixed(3)}</div>
              </div>
            </div>
            {!overview.supervisor.available && <p className="text-xs text-danger">Grok CLI not found. Install it and run grok login.</p>}
            {sup.lastError && <p className="text-xs text-danger">{sup.lastError}</p>}
            {sup.lastSummary && <p className="rounded-md bg-muted px-2.5 py-2 text-muted-foreground">{sup.lastSummary}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages to main chat</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <Dot tone={overview.bridge.available ? 'success' : 'warning'} />
              {overview.bridge.available ? 'Desktop Bridge' : 'Cursor hooks + MCP'}
            </CardDescription>
            <CardAction>
              {!readOnly && (
                <Button size="sm" variant="ghost" onClick={() => act(() => post(`${base}/deliver`), 'Delivery retried')}>
                  Retry
                </Button>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!readOnly && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted p-2">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()} placeholder="Tell the manager something…" className="min-h-16 resize-none border-0 bg-card shadow-none" />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch size="sm" checked={urgent} onCheckedChange={setUrgent} />
                    Urgent
                  </label>
                  <Button size="sm" disabled={!text.trim() || sending} onClick={send}>
                    <Send /> Send
                  </Button>
                </div>
              </div>
            )}
            <ul className="flex flex-col divide-y">
              {[...mission.messages].reverse().map((m) => (
                <li key={m.id} className="flex flex-col gap-1.5 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{m.from === 'user' ? 'You' : 'Goal Director'}</span>
                    {m.severity === 'high' && <Pill tone="danger">urgent</Pill>}
                    <span className="ml-auto">{ago(m.t, now)}</span>
                  </div>
                  <p className="line-clamp-3 text-sm">{m.text}</p>
                  <div className="flex items-center justify-between gap-2">
                    <Pipeline status={m.status} />
                    {m.via && <span className="text-[11px] text-subtle">via {m.via}</span>}
                  </div>
                  {m.ackNote && <p className="text-xs text-muted-foreground">“{m.ackNote}”</p>}
                </li>
              ))}
              {mission.messages.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">No messages yet</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
