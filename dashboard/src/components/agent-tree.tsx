import { Bot, Check, ChevronDown, Circle, GitBranch, Globe, Loader2, Pause, Search, Sparkles, Square, Terminal, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Agent, Mission } from '@/lib/api'
import { dur, stripTag } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Pill, type Tone } from './shared'

interface Node {
  agent: Agent
  children: Node[]
}

const LINE = 'bg-foreground/20'
const CARD_W = 'w-64'
const HALF_CARD = 128

type CardStatus = Agent['status'] | 'idle' | 'paused'

const STATUS: Record<CardStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  running: { label: 'Running', tone: 'active', icon: Loader2 },
  completed: { label: 'Done', tone: 'success', icon: Check },
  error: { label: 'Failed', tone: 'danger', icon: TriangleAlert },
  aborted: { label: 'Stopped', tone: 'neutral', icon: Square },
  idle: { label: 'Idle', tone: 'neutral', icon: Circle },
  paused: { label: 'Paused', tone: 'warning', icon: Pause },
}

const TYPE_ICON: Record<string, LucideIcon> = { explore: Search, shell: Terminal, 'browser-use': Globe, 'best-of-n-runner': GitBranch }
const HARNESS: Record<string, string> = { cursor: 'Cursor', claude: 'Claude Code', codex: 'Codex' }

function buildTree(agents: Agent[]) {
  const nodes = new Map<string, Node>()
  for (const a of [...agents].sort((x, y) => x.startedAt - y.startedAt)) nodes.set(a.id, { agent: a, children: [] })
  const roots: Node[] = []
  for (const n of nodes.values()) {
    const parent = n.agent.parentId ? nodes.get(n.agent.parentId) : undefined
    if (parent && parent !== n) parent.children.push(n)
    else roots.push(n)
  }
  return roots
}

export function AgentTree({ mission, now, onOpenTask }: { mission: Mission; now: number; onOpenTask: (id: string) => void }) {
  const roots = useMemo(() => buildTree(mission.agents), [mission.agents])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const retried = useMemo(() => {
    const ids = new Set<string>()
    for (const a of mission.agents) {
      if (a.status === 'running' || a.status === 'completed' || !a.taskId) continue
      if (mission.agents.some((b) => b.taskId === a.taskId && b.startedAt > a.startedAt)) ids.add(a.id)
    }
    return ids
  }, [mission.agents])

  const taskTitle = (id: string | null) => (id ? mission.tasks.find((t) => t.id === id)?.title : undefined)
  const anyRunning = mission.agents.some((a) => a.status === 'running')
  const mainStatus: CardStatus =
    mission.status === 'complete'
      ? 'completed'
      : mission.status === 'aborted'
        ? 'aborted'
        : mission.status === 'paused'
          ? 'paused'
          : anyRunning || mission.main.status === 'working'
            ? 'running'
            : 'idle'
  const mainOpen = !collapsed.has('main')

  const branch = (node: Node): ReactNode => {
    const a = node.agent
    const open = !collapsed.has(a.id)
    const quiet = a.status === 'running' && now - a.lastActivityAt > 120000
    return (
      <div className="flex flex-col items-start">
        <AgentCard
          icon={TYPE_ICON[a.type] ?? Bot}
          name={taskTitle(a.taskId) || stripTag(a.task).split(/[.:\n]/)[0] || a.type}
          sub={[a.taskId, a.model || a.type].filter(Boolean).join(' · ')}
          status={a.status}
          text={stripTag(a.task)}
          meta={[`${a.toolCallCount || a.liveToolCalls} tools`, a.modifiedFiles.length ? `${a.modifiedFiles.length} ${a.modifiedFiles.length === 1 ? 'file' : 'files'}` : null, dur(a.durationMs ?? now - a.startedAt)]}
          warn={quiet ? `Quiet for ${dur(now - a.lastActivityAt)}` : retried.has(a.id) ? 'Retried by a later agent' : undefined}
          dim={retried.has(a.id)}
          childCount={node.children.length}
          open={open}
          onToggle={() => toggle(a.id)}
          onOpen={a.taskId ? () => onOpenTask(a.taskId!) : undefined}
        />
        {open && node.children.length > 0 && (
          <div className="relative ml-6 flex flex-col gap-3 pt-3">
            <span className={cn('absolute top-0 -left-[3.5px] z-10 size-2 rounded-full bg-card ring-1 ring-foreground/30')} />
            {node.children.map((c, i) => (
              <div key={c.agent.id} className="relative pl-6">
                <span className={cn('absolute -top-3 left-0 w-px', LINE, i === node.children.length - 1 ? 'h-10' : 'h-[calc(100%+12px)]')} />
                <span className={cn('absolute top-7 left-0 h-px w-6', LINE)} />
                {branch(c)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="mx-auto flex w-max flex-col items-center px-1 pt-1">
        <div className="relative">
          <AgentCard
            icon={Sparkles}
            name="Main"
            sub={HARNESS[mission.harness ?? ''] ?? 'Orchestrator'}
            status={mainStatus}
            text={mission.title}
            meta={[`${mission.main.toolCalls} tools`, dur((mission.endedAt ?? now) - mission.startedAt)]}
            childCount={roots.length}
            open={mainOpen}
            onToggle={() => toggle('main')}
          />
          {mainOpen && roots.length > 0 && <span className="absolute -bottom-[3.5px] left-1/2 z-10 size-2 -translate-x-1/2 rounded-full bg-card ring-1 ring-foreground/30" />}
        </div>
        {mainOpen && roots.length > 0 && (
          <>
            <span className={cn('h-6 w-px', LINE)} />
            <div className="flex items-start gap-6">
              {roots.map((n, i) => {
                const first = i === 0
                const last = i === roots.length - 1
                return (
                  <div key={n.agent.id} className="relative pt-6">
                    {roots.length > 1 && (
                      <span
                        className={cn('absolute top-0 h-px', LINE)}
                        style={first ? { left: HALF_CARD, right: -12 } : last ? { left: -12, width: HALF_CARD + 12 } : { left: -12, right: -12 }}
                      />
                    )}
                    <span className={cn('absolute top-0 h-6 w-px', LINE)} style={{ left: HALF_CARD }} />
                    {branch(n)}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AgentCard({
  icon: Icon,
  name,
  sub,
  status,
  text,
  meta,
  warn,
  dim,
  childCount,
  open,
  onToggle,
  onOpen,
}: {
  icon: LucideIcon
  name: string
  sub: string
  status: CardStatus
  text: string
  meta: (string | null)[]
  warn?: string
  dim?: boolean
  childCount: number
  open: boolean
  onToggle: () => void
  onOpen?: () => void
}) {
  const s = STATUS[status]
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => onOpen && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className={cn(
        CARD_W,
        'flex shrink-0 flex-col gap-2.5 rounded-lg bg-card p-3 text-left shadow-xs ring-1 ring-foreground/10 transition-[box-shadow,opacity]',
        onOpen && 'cursor-pointer hover:shadow-md',
        dim && 'opacity-55 hover:opacity-100',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md ring-1 ring-foreground/10">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm leading-tight font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{sub}</div>
        </div>
        <Pill tone={s.tone}>
          <s.icon className={cn('size-3', status === 'running' && 'animate-spin')} />
          {s.label}
        </Pill>
      </div>
      <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{text}</p>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground tabnum">{meta.filter(Boolean).join(' · ')}</span>
        {childCount > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-muted-foreground tabnum hover:bg-muted hover:text-foreground"
          >
            {childCount}
            <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
          </button>
        )}
      </div>
      {warn && <div className="-mt-1 text-xs text-warning">{warn}</div>}
    </div>
  )
}
