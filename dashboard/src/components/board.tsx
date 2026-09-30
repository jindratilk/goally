import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CheckCircle2, FileText, FlaskConical, ImageOff, Lightbulb, Link2, Lock, MessageSquare, OctagonAlert, Search, UserRound, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Agent, Attachment, Mission, Task, TaskNote, TaskStatus } from '@/lib/api'
import { ago, dur, shortPath } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dot, Segmented, TASK_META, TaskBadge } from './shared'

const COLUMNS: { key: string; statuses: TaskStatus[]; label: string }[] = [
  { key: 'todo', statuses: ['todo'], label: 'To-do' },
  { key: 'progress', statuses: ['running', 'blocked', 'failed'], label: 'In progress' },
  { key: 'testing', statuses: ['review'], label: 'Testing' },
  { key: 'launched', statuses: ['done'], label: 'Launched' },
]

export function agentsFor(task: Task, agents: Agent[]) {
  return agents.filter((a) => task.agentIds.includes(a.id) || a.taskId === task.id)
}

function TaskCard({ task, mission, now, onOpen }: { task: Task; mission: Mission; now: number; onOpen: () => void }) {
  const live = agentsFor(task, mission.agents).find((a) => a.status === 'running')
  const waiting = task.depends.filter((d) => mission.tasks.find((t) => t.id === d)?.status !== 'done')
  const flagged = mission.findings.some((f) => f.taskId === task.id && f.status === 'open')
  return (
    <motion.button
      layout
      layoutId={task.id}
      transition={{ type: 'spring', stiffness: 400, damping: 36 }}
      onClick={onOpen}
      className="group flex w-full min-w-0 flex-col gap-2 rounded-lg bg-card p-3 text-left shadow-xs ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
        <span className="font-mono">{task.id}</span>
        {task.lane && <span>· {task.lane}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {flagged && <OctagonAlert className="size-3.5 text-warning" />}
          {waiting.length > 0 && task.status === 'todo' && <Lock className="size-3.5" />}
          {task.status === 'done' && <CheckCircle2 className="size-3.5 text-success" />}
          {live && <Dot tone="active" pulse />}
        </span>
      </div>
      <div className="text-sm leading-snug font-medium [overflow-wrap:anywhere]">{task.title}</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {live ? (
          <span className="truncate">
            {task.owner ? `${task.owner} · ` : ''}
            {dur(now - live.startedAt)} · {live.liveToolCalls} tools
          </span>
        ) : task.status === 'blocked' || task.status === 'failed' ? (
          <span className="truncate text-danger">{task.status === 'failed' ? 'Failed' : 'Blocked'}{blockerText(task) ? ` · ${blockerText(task)}` : ''}</span>
        ) : (task.status === 'running' || task.status === 'review') && task.owner ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <UserRound className="size-3 shrink-0" />
            <span className="truncate">{task.owner}</span>
            {task.lastCheck && <span className={cn('shrink-0', task.lastCheck.ok ? 'text-success' : 'text-danger')}>· check {task.lastCheck.ok ? 'passed' : 'failed'}</span>}
            <span className="ml-auto shrink-0 text-subtle">{ago(task.updatedAt || task.startedAt, now)}</span>
          </span>
        ) : task.status === 'review' && task.proof && !task.proof.ok ? (
          <span className="truncate text-warning">Proof rejected</span>
        ) : task.status === 'todo' && waiting.length ? (
          <span>After {waiting.join(', ')}</span>
        ) : task.status === 'done' ? (
          <span className="truncate font-mono">{task.evidence.findLast((e) => e.kind !== 'screenshot' && e.kind !== 'note')?.ref}</span>
        ) : (
          <span>{ago(task.updatedAt || task.startedAt, now)}</span>
        )}
      </div>
    </motion.button>
  )
}

function blockerText(task: Task) {
  return task.notes.filter((n) => n.text && (!n.kind || n.kind === 'blocker')).at(-1)?.text ?? ''
}

export function Board({ mission, now, onOpenTask }: { mission: Mission; now: number; onOpenTask: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [lane, setLane] = useState('all')
  const [tab, setTab] = useState('progress')
  const lanes = useMemo(() => [...new Set([...(mission.lanes ?? []), ...mission.tasks.map((t) => t.lane)].filter((l) => l && mission.tasks.some((t) => t.lane === l)))], [mission.lanes, mission.tasks])
  const tasks = mission.tasks.filter((t) => (lane === 'all' || t.lane === lane) && (!q || `${t.id} ${t.title} ${t.verify}`.toLowerCase().includes(q.toLowerCase())))
  const byCol = (c: (typeof COLUMNS)[number]) => tasks.filter((t) => c.statuses.includes(t.status))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks" className="h-8 bg-card pl-8" />
        </div>
        {lanes.length > 1 && <Segmented value={lane} onChange={setLane} options={[{ value: 'all', label: 'All lanes' }, ...lanes.map((l) => ({ value: l, label: l }))]} />}
      </div>

      <div className="md:hidden">
        <Segmented value={tab} onChange={setTab} options={COLUMNS.map((c) => ({ value: c.key, label: c.label, count: byCol(c).length }))} />
      </div>

      <div className="-mx-3 overflow-x-auto px-3 sm:-mx-6 sm:px-6 xl:mx-0 xl:overflow-visible xl:px-0">
      <div className="grid gap-3 md:min-w-[720px] md:grid-cols-4 xl:min-w-0">
        {COLUMNS.map((c) => {
          const list = byCol(c)
          return (
            <div key={c.key} className={cn('flex min-w-0 flex-col gap-2 rounded-xl bg-muted/70 p-2', tab !== c.key && 'hidden md:flex')}>
              <div className="flex items-center gap-2 px-1 py-1 text-xs font-medium text-muted-foreground">
                {c.label}
                <span className="tabnum text-subtle">{list.length}</span>
              </div>
              <AnimatePresence mode="popLayout">
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} mission={mission} now={now} onOpen={() => onOpenTask(t.id)} />
                ))}
              </AnimatePresence>
              {list.length === 0 && <div className="rounded-lg border border-dashed py-6 text-center text-xs text-subtle">Empty</div>}
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const UI_FILE = /\.(tsx|jsx|vue|svelte|css|scss|html|swift|xib|storyboard)$/i

function Shot({ missionId, ref_, compact }: { missionId: string; ref_: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const src = /^https?:\/\//.test(ref_) ? ref_ : `/api/missions/${missionId}/shot?ref=${encodeURIComponent(ref_)}`
  if (failed)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <ImageOff className="size-4 shrink-0" />
        <span className="min-w-0 truncate font-mono text-xs">{ref_}</span>
        <span className="ml-auto shrink-0">Can't load this image</span>
      </div>
    )
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('block cursor-zoom-in overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition-shadow hover:shadow-md', compact ? 'w-fit max-w-full' : 'w-full')}>
        <img src={src} alt={ref_} onError={() => setFailed(true)} className={cn('object-contain', compact ? 'max-h-40 w-auto' : 'max-h-[60vh] w-full')} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] w-auto max-w-[94vw] gap-0 overflow-hidden bg-card p-0 shadow-[0_32px_90px_-12px_rgba(0,0,0,0.6),0_8px_24px_rgba(0,0,0,0.25)] sm:max-w-[94vw]">
          <DialogTitle className="sr-only">Screenshot</DialogTitle>
          <img src={src} alt={ref_} className="max-h-[92vh] max-w-[94vw] object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}

const NOTE_META: Record<string, { icon: LucideIcon; label: string }> = {
  claim: { icon: UserRound, label: 'Claimed' },
  progress: { icon: MessageSquare, label: 'Progress' },
  decision: { icon: Lightbulb, label: 'Decision' },
  blocker: { icon: OctagonAlert, label: 'Blocker' },
  result: { icon: CheckCircle2, label: 'Result' },
  check: { icon: FlaskConical, label: 'Check' },
  status: { icon: ArrowRight, label: 'Status' },
}

function AttachmentChip({ a, missionId }: { a: Attachment; missionId: string }) {
  if (a.kind === 'screenshot') return <Shot missionId={missionId} ref_={a.ref} compact />
  const Icon = a.kind === 'url' ? Link2 : FileText
  const body = (
    <>
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{a.label || a.ref}</span>
    </>
  )
  const cls = 'inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground'
  return a.kind === 'url' && /^https?:\/\//.test(a.ref) ? (
    <a href={a.ref} target="_blank" rel="noreferrer" className={cn(cls, 'hover:text-foreground')}>
      {body}
    </a>
  ) : (
    <span className={cls} title={a.ref}>
      {body}
    </span>
  )
}

function History({ notes, missionId, now }: { notes: TaskNote[]; missionId: string; now: number }) {
  return (
    <ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
      {notes.map((n, i) => {
        const kind = n.kind ?? 'progress'
        const meta = NOTE_META[kind] ?? NOTE_META.progress
        const Icon = meta.icon
        const tone = kind === 'blocker' || (kind === 'check' && n.ok === false) ? 'text-danger' : kind === 'result' || (kind === 'check' && n.ok) ? 'text-success' : 'text-muted-foreground'
        return (
          <li key={`${n.t}-${i}`} className="relative flex gap-3">
            <span className={cn('relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-foreground/10', tone)}>
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('font-medium', tone === 'text-muted-foreground' ? 'text-foreground' : tone)}>{kind === 'status' && n.status ? `Status → ${n.status}` : meta.label}</span>
                {n.by && <span>· {n.by}</span>}
                <span className="ml-auto shrink-0 tabnum text-subtle">{ago(n.t, now)}</span>
              </div>
              {n.text && kind !== 'claim' && <p className={cn('text-sm [overflow-wrap:anywhere]', kind === 'check' && 'font-mono text-xs')}>{n.text}</p>}
              {kind === 'check' && n.output && (
                <details className="group/out">
                  <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">Output{n.durationMs ? ` · ${dur(n.durationMs)}` : ''}</summary>
                  <pre className="mt-1.5 max-h-64 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{n.output}</pre>
                </details>
              )}
              {!!n.attachments?.length && (
                <div className="flex flex-col gap-2">
                  {n.attachments.map((a, j) => (
                    <AttachmentChip key={j} a={a} missionId={missionId} />
                  ))}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function TaskSheet({ taskId, mission, now, onClose }: { taskId: string | null; mission: Mission; now: number; onClose: () => void }) {
  const task = mission.tasks.find((t) => t.id === taskId) ?? null
  const agents = task ? agentsFor(task, mission.agents) : []
  const findings = task ? mission.findings.filter((f) => f.taskId === task.id) : []
  const shots = task ? [...new Set([...task.evidence.filter((e) => e.kind === 'screenshot').map((e) => e.ref), ...task.notes.flatMap((n) => (n.attachments ?? []).filter((a) => a.kind === 'screenshot').map((a) => a.ref))])] : []
  const history = task ? [...task.notes].reverse() : []
  const isUi = !!task && (shots.length > 0 || task.lane.toLowerCase() === 'ui' || agents.some((a) => a.modifiedFiles.some((f) => UI_FILE.test(f))))
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-2/3 data-[side=right]:sm:max-w-none">
        {task && (
          <div className="flex h-full flex-col overflow-y-auto">
            <SheetHeader className="gap-2 border-b p-5 pr-12">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
                <TaskBadge status={task.status} />
              </div>
              <SheetTitle className="text-lg">{task.title}</SheetTitle>
              {task.description && <SheetDescription>{task.description}</SheetDescription>}
            </SheetHeader>
            <div className="flex flex-col gap-6 p-5">
              <div className="divide-y">
                <Row label="Acceptance">{task.acceptance || '—'}</Row>
                <Row label="Verify">
                  <code className="font-mono text-xs">{task.verify || '—'}</code>
                </Row>
                <Row label="Owner">{task.owner || <span className="text-muted-foreground">Unclaimed</span>}</Row>
                <Row label="Depends on">{task.depends.length ? task.depends.join(', ') : '—'}</Row>
                <Row label="Proof">
                  {task.proof ? <span className={task.proof.ok ? 'text-success' : 'text-warning'}>{task.proof.reason}</span> : <span className="text-muted-foreground">Not submitted</span>}
                </Row>
                {task.evidence.length > 0 && (
                  <Row label="Evidence">
                    <ul className="space-y-1">
                      {task.evidence.map((e, i) => (
                        <li key={i} className="flex items-center gap-1.5 font-mono text-xs">
                          <Link2 className="size-3 text-muted-foreground" />
                          {e.kind}: {e.ref}
                        </li>
                      ))}
                    </ul>
                  </Row>
                )}
              </div>

              {isUi && (
                <section>
                  <h3 className="mb-2 text-sm font-medium">Screenshot</h3>
                  {shots.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {shots.map((ref) => (
                        <Shot key={ref} missionId={mission.id} ref_={ref} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <ImageOff className="size-4 shrink-0" />
                      No screenshot yet. The agent attaches one as proof for UI work.
                    </div>
                  )}
                </section>
              )}

              <section>
                <h3 className="mb-3 text-sm font-medium">History</h3>
                {history.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet. The agent that claims this task reports here.</p> : <History notes={history} missionId={mission.id} now={now} />}
              </section>

              {agents.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium">Agent runs</h3>
                <div className="flex flex-col gap-2">
                  {agents.map((a) => (
                    <div key={a.id} className="rounded-lg p-3 ring-1 ring-foreground/10">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Dot tone={a.status === 'running' ? 'active' : a.status === 'completed' ? 'success' : 'danger'} pulse={a.status === 'running'} />
                        <span className="capitalize">{a.status}</span>
                        <span>· {a.model || a.type}</span>
                        <span className="ml-auto tabnum">
                          {dur(a.durationMs ?? now - a.startedAt)} · {a.toolCallCount || a.liveToolCalls} tools · {a.messageCount} msgs
                        </span>
                      </div>
                      {a.summary && <p className="mt-2 text-sm">{a.summary}</p>}
                      {a.modifiedFiles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {a.modifiedFiles.slice(0, 6).map((f) => (
                            <span key={f} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                              {shortPath(f, mission.workspace)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              )}

              {findings.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-medium">Director findings</h3>
                  <ul className="space-y-2">
                    {findings.map((f) => (
                      <li key={f.id} className="text-sm">
                        <span className={cn('mr-1.5 font-medium', f.status === 'open' ? (f.severity === 'high' ? 'text-danger' : 'text-warning') : 'text-muted-foreground line-through')}>{f.id}</span>
                        {f.title}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export { TASK_META }
