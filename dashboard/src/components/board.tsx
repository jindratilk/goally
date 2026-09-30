import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, CircleDashed, FlaskConical, GitCommitHorizontal, Link2, Lock, OctagonAlert, Pause } from 'lucide-react'
import { useState } from 'react'
import type { Agent, Mission, Task, TaskStatus } from '@/lib/api'
import { ago, dur, shortPath } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dot, Empty, Note, Panel, Tag } from './blueprint'

const COLUMNS: { key: string; title: string; statuses: TaskStatus[] }[] = [
  { key: 'todo', title: 'Standby', statuses: ['todo'] },
  { key: 'running', title: 'In flight', statuses: ['running'] },
  { key: 'review', title: 'Proof pending', statuses: ['review'] },
  { key: 'hold', title: 'Hold', statuses: ['blocked', 'failed'] },
  { key: 'done', title: 'Go · proven', statuses: ['done'] },
]

const EVIDENCE_ICON: Record<string, typeof FlaskConical> = { test: FlaskConical, commit: GitCommitHorizontal, url: Link2, deploy: Link2 }

function taskAgents(task: Task, agents: Agent[]) {
  return agents.filter((a) => task.agentIds.includes(a.id) || a.taskId === task.id)
}

function TaskCard({ task, mission, now, onOpen }: { task: Task; mission: Mission; now: number; onOpen: () => void }) {
  const agents = taskAgents(task, mission.agents)
  const live = agents.find((a) => a.status === 'running')
  const blockedBy = task.depends.filter((d) => mission.tasks.find((t) => t.id === d)?.status !== 'done')
  const lastNote = task.notes.at(-1)
  const findings = mission.findings.filter((f) => f.taskId === task.id && f.status === 'open')
  const running = task.status === 'running'
  const hold = task.status === 'blocked' || task.status === 'failed'
  return (
    <motion.button
      layout
      layoutId={task.id}
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      onClick={onOpen}
      className={cn(
        'group relative flex w-full flex-col gap-3 rounded-[4px] border bg-black/70 p-3.5 text-left transition-colors hover:border-ink/60',
        running && 'scan border-ink/40',
        hold && 'hatch-nogo border-nogo/40',
        task.status === 'review' && 'border-warn/40',
        task.status === 'done' && 'border-go/30',
        task.status === 'todo' && 'border-line',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="mono text-[11px] text-ink-2">{task.id}</span>
        {task.lane && <span className="label label-sm text-ink-3">{task.lane}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {findings.length > 0 && <OctagonAlert className="size-3.5 text-warn" />}
          {task.status === 'done' && <CheckCircle2 className="size-3.5 text-go" />}
          {running && <Dot tone="ink" pulse />}
          {task.status === 'todo' && blockedBy.length > 0 && <Lock className="size-3 text-ink-3" />}
          {task.status === 'blocked' && <Pause className="size-3.5 text-nogo" />}
        </span>
      </div>
      <p className="text-[15px] leading-snug font-bold tracking-[0.02em]">{task.title}</p>
      {task.verify && (
        <code className="mono line-clamp-2 block rounded-[3px] border border-line-2 bg-white/[0.02] px-2 py-1.5 text-[11px] text-ink-2">
          <span className="text-bp-ink/80">verify › </span>
          {task.verify}
        </code>
      )}
      {lastNote && task.status !== 'done' && <p className="line-clamp-2 text-[12px] text-ink-3">“{lastNote.text}”</p>}
      {task.status === 'done' && task.proof && (
        <div className="flex items-center gap-2 text-[12px] text-go/90">
          {(() => {
            const ev = task.evidence.at(-1)
            const Icon = (ev && EVIDENCE_ICON[ev.kind]) || CheckCircle2
            return <Icon className="size-3.5 shrink-0" />
          })()}
          <span className="mono truncate text-[11px]">{task.evidence.at(-1)?.ref || task.proof.reason}</span>
        </div>
      )}
      {task.status === 'review' && task.proof && !task.proof.ok && <p className="text-[12px] text-warn">NO-GO · {task.proof.reason}</p>}
      <div className="flex items-center gap-2 text-[11px] text-ink-3">
        {live ? (
          <>
            <span className="mono text-ink-2">{live.model || live.type}</span>
            <span>·</span>
            <span className="tabnum">{dur(now - live.startedAt)}</span>
            <span>·</span>
            <span className="tabnum">{live.liveToolCalls} tools</span>
            {live.lastTool && <span className="truncate">· {live.lastTool}</span>}
          </>
        ) : task.status === 'todo' && blockedBy.length ? (
          <span>waits for {blockedBy.join(', ')}</span>
        ) : agents.length ? (
          <span>
            {agents.length} agent run{agents.length > 1 ? 's' : ''} · {ago(task.updatedAt || task.doneAt || task.startedAt, now)}
          </span>
        ) : (
          <span>{task.status === 'todo' ? 'not launched' : ago(task.updatedAt || task.doneAt || task.startedAt, now)}</span>
        )}
      </div>
    </motion.button>
  )
}

export function Board({ mission, now }: { mission: Mission; now: number }) {
  const [open, setOpen] = useState<string | null>(null)
  const task = mission.tasks.find((t) => t.id === open) ?? null
  return (
    <Panel
      code="02"
      title="Mission board"
      aside={<span className="mono text-[11px] text-ink-3">{mission.tasks.length} cards</span>}
      bodyClassName="px-0 sm:px-0 pb-4"
    >
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:px-5 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {COLUMNS.map((col) => {
          const tasks = mission.tasks.filter((t) => col.statuses.includes(t.status))
          return (
            <div key={col.key} className="flex w-[82vw] max-w-[340px] shrink-0 snap-start flex-col gap-3 sm:w-[300px] xl:w-auto xl:max-w-none">
              <div className="flex items-center gap-2 border-b border-line-2 pb-2">
                <span className="label text-ink">{col.title}</span>
                <span className="mono ml-auto text-[11px] text-ink-3 tabnum">{String(tasks.length).padStart(2, '0')}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                <AnimatePresence mode="popLayout">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} mission={mission} now={now} onOpen={() => setOpen(t.id)} />
                  ))}
                </AnimatePresence>
                {tasks.length === 0 && (
                  <div className="flex h-16 items-center justify-center rounded-[4px] border border-dashed border-line-2">
                    <CircleDashed className="size-4 text-ink-3/60" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <TaskSheet task={task} mission={mission} now={now} onClose={() => setOpen(null)} />
    </Panel>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 border-b border-line-2 py-2.5 text-[13px]">
      <span className="label label-sm pt-0.5">{label}</span>
      <div className="min-w-0 text-ink-2">{children}</div>
    </div>
  )
}

function TaskSheet({ task, mission, now, onClose }: { task: Task | null; mission: Mission; now: number; onClose: () => void }) {
  const agents = task ? taskAgents(task, mission.agents) : []
  const events = task ? mission.timeline.filter((e) => e.taskId === task.id || agents.some((a) => a.id === e.agent)).slice(-14) : []
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full border-line bg-black/95 p-0 sm:max-w-[520px]">
        {task && (
          <div className="thin-scroll flex h-full flex-col overflow-y-auto">
            <SheetHeader className="gap-2 border-b border-line-2 p-5 pr-12">
              <div className="flex items-center gap-2">
                <span className="mono text-[12px] text-ink-2">{task.id}</span>
                <Tag tone={task.status === 'done' ? 'go' : task.status === 'blocked' || task.status === 'failed' ? 'nogo' : task.status === 'review' ? 'warn' : 'ink'}>{task.status}</Tag>
              </div>
              <SheetTitle className="display text-[26px] leading-tight">{task.title}</SheetTitle>
              {task.description && <SheetDescription className="text-[14px] text-ink-2">{task.description}</SheetDescription>}
            </SheetHeader>
            <div className="p-5">
              <Row label="Acceptance">{task.acceptance || '—'}</Row>
              <Row label="Verify">
                <code className="mono text-[12px] text-ink">{task.verify || '—'}</code>
              </Row>
              <Row label="Depends">{task.depends.length ? task.depends.join(', ') : 'none'}</Row>
              <Row label="Proof">
                {task.proof ? (
                  <span className={task.proof.ok ? 'text-go' : 'text-warn'}>
                    {task.proof.ok ? 'GO' : 'NO-GO'} · {task.proof.reason}
                  </span>
                ) : (
                  'not submitted'
                )}
              </Row>
              <Row label="Evidence">
                {task.evidence.length ? (
                  <ul className="space-y-1">
                    {task.evidence.map((e, i) => (
                      <li key={i} className="mono text-[12px]">
                        <span className="text-bp-ink">{e.kind}</span> {e.ref}
                      </li>
                    ))}
                  </ul>
                ) : (
                  'none'
                )}
              </Row>
              <div className="mt-6">
                <span className="label">Agent runs</span>
                <div className="mt-3 flex flex-col gap-2">
                  {agents.length === 0 && <Empty>No subagent launched for this card yet.</Empty>}
                  {agents.map((a) => (
                    <div key={a.id} className="rounded-[4px] border border-line-2 p-3">
                      <div className="flex items-center gap-2 text-[12px]">
                        <Dot tone={a.status === 'running' ? 'ink' : a.status === 'completed' ? 'go' : 'nogo'} pulse={a.status === 'running'} />
                        <span className="mono text-ink-2">{a.id.slice(0, 10)}</span>
                        <span className="text-ink-3">{a.model || a.type}</span>
                        <span className="ml-auto tabnum text-ink-3">{dur(a.durationMs ?? now - a.startedAt)}</span>
                      </div>
                      {a.summary && <p className="mt-2 text-[13px] text-ink-2">{a.summary}</p>}
                      {a.modifiedFiles.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {a.modifiedFiles.slice(0, 6).map((f) => (
                            <li key={f} className="mono truncate text-[11px] text-ink-3">
                              ± {shortPath(f, mission.workspace)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {task.notes.length > 0 && (
                <div className="mt-6">
                  <span className="label">Notes</span>
                  <ul className="mt-3 space-y-2">
                    {task.notes.map((n, i) => (
                      <li key={i} className="border-l border-line pl-3 text-[13px] text-ink-2">
                        {n.text}
                        <span className="ml-2 text-[11px] text-ink-3">{ago(n.t, now)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-6">
                <span className="label">Telemetry</span>
                <ul className="mt-3 space-y-1">
                  {events.map((e) => (
                    <li key={e.seq} className="mono text-[11px] text-ink-3">
                      <span className="text-ink-2">{ago(e.t, now)}</span> · {e.text}
                    </li>
                  ))}
                  {events.length === 0 && <Note>quiet so far</Note>}
                </ul>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
