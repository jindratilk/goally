import { Bot, CircleCheck, CircleDashed, CircleX, History, ChartColumn, Loader2, Menu, Pause, Pencil, Play, Radar, ScrollText, Settings, SquareKanban, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { post, useHashRoute, useNow, usePoll, type Mission, type MissionSummary, type Overview } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { ActivityView } from '@/components/activity'
import { Agents } from '@/components/agents'
import { Board, TaskSheet } from '@/components/board'
import { Director } from '@/components/director'
import { HistoryView } from '@/components/history'
import { Overview as OverviewView } from '@/components/overview'
import { SettingsView } from '@/components/settings'
import { GoalProgress } from '@/components/goal-progress'
import { InlineEdit } from '@/components/inline-edit'
import { Dot, PageHeader, Pill } from '@/components/shared'

const MISSION_VIEWS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'board', label: 'Board', icon: SquareKanban },
  { id: 'overview', label: 'Stats', icon: ChartColumn },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'director', label: 'Goal Director', icon: Radar },
  { id: 'activity', label: 'Activity', icon: ScrollText },
]
const GLOBAL_VIEWS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" strokeOpacity=".3" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 12l6-6" strokeLinecap="round" />
      </svg>
      <span className="text-sm font-semibold tracking-tight">Goally</span>
    </div>
  )
}

function MissionIcon({ m }: { m: MissionSummary }) {
  if (m.go) return <CircleCheck className="size-4 text-success" />
  if (m.status === 'aborted') return <CircleX className="size-4 text-danger" />
  if (m.status === 'active') return <Loader2 className="size-4 animate-spin text-foreground [animation-duration:2.5s]" />
  if (m.status === 'paused') return <Pause className="size-4 text-warning" />
  return <CircleDashed className="size-4 text-subtle" />
}

function NavItem({ active, icon: Icon, label, badge, badgeTone, onClick }: { active: boolean; icon: LucideIcon; label: string; badge?: number; badgeTone?: 'danger'; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('relative flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm transition-colors', active ? 'text-foreground' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground')}>
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-md bg-card shadow-xs ring-1 ring-foreground/10" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
      <Icon className="relative size-4" />
      <span className="relative flex-1 text-left">{label}</span>
      {!!badge && <span className={cn('relative rounded-full px-1.5 text-[11px] font-medium tabnum', badgeTone === 'danger' ? 'bg-danger text-white' : 'text-muted-foreground')}>{badge}</span>}
    </button>
  )
}

function useScrollFade<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      el.toggleAttribute('data-fade-top', el.scrollTop > 2)
      el.toggleAttribute('data-fade-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 2)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [dep])
  return ref
}

function MissionRow({ m, active, readOnly, onOpen, onRename }: { m: MissionSummary; active: boolean; readOnly: boolean; onOpen: () => void; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <div className="flex h-8 items-center gap-2 px-1">
        <InlineEdit value={m.title} onSave={onRename} onDone={() => setEditing(false)} className="flex-1" />
      </div>
    )
  return (
    <div className={cn('group/row flex h-8 items-center rounded-md transition-colors hover:bg-foreground/5', active ? 'bg-foreground/[0.06] text-foreground' : 'text-muted-foreground')}>
      <button onClick={onOpen} onDoubleClick={() => !readOnly && setEditing(true)} className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2 text-left text-sm">
        <MissionIcon m={m} />
        <span className="min-w-0 flex-1 truncate">{m.title}</span>
        <span className={cn('text-[11px] text-subtle tabnum', !readOnly && 'group-hover/row:hidden')}>
          {m.done}/{m.total}
        </span>
      </button>
      {!readOnly && (
        <button aria-label="Rename goal" onClick={() => setEditing(true)} className="mr-1 hidden size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground group-hover/row:flex">
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function Sidebar({ overview, mission, missionId, view, go, onRename }: { overview: Overview; mission: Mission | null; missionId: string | null; view: string; go: (r: { mission?: string | null; view?: string }) => void; onRename: (id: string, title: string) => void }) {
  const live = overview.missions.filter((m) => m.status === 'active' || m.status === 'paused')
  const done = overview.missions.filter((m) => !live.includes(m))
  const listRef = useScrollFade<HTMLDivElement>(live.length + done.length)
  const openFindings = mission?.findings.filter((f) => f.status === 'open').length ?? 0
  const badge: Record<string, number | undefined> = {
    board: mission ? mission.verdict.total - mission.verdict.done : undefined,
    agents: mission?.agents.filter((a) => a.status === 'running').length,
    director: openFindings,
  }
  const group = (label: string, list: MissionSummary[]) =>
    list.length > 0 && (
      <div className="flex flex-col gap-0.5">
        <div className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">
          {label} <span className="tabnum">{list.length}</span>
        </div>
        {list.map((m) => (
          <MissionRow key={m.id} m={m} active={m.id === missionId} readOnly={overview.remote} onOpen={() => go({ mission: m.id, view: MISSION_VIEWS.some((v) => v.id === view) ? view : 'board' })} onRename={(t) => onRename(m.id, t)} />
        ))}
      </div>
    )

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex h-8 items-center">
        <Logo />
      </div>
      {mission && (
        <nav className="flex flex-col gap-0.5">
          {MISSION_VIEWS.map((v) => (
            <NavItem key={v.id} active={view === v.id} icon={v.icon} label={v.label} badge={badge[v.id]} badgeTone={v.id === 'director' && mission.findings.some((f) => f.status === 'open' && f.severity === 'high') ? 'danger' : undefined} onClick={() => go({ view: v.id })} />
          ))}
        </nav>
      )}
      <div ref={listRef} className="scroll-fade -mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
        {group('Active goals', live)}
        {group('Finished', done)}
      </div>
      <nav className="flex flex-col gap-0.5">
        {GLOBAL_VIEWS.map((v) => (
          <NavItem key={v.id} active={view === v.id} icon={v.icon} label={v.label} onClick={() => go({ view: v.id })} />
        ))}
      </nav>
    </div>
  )
}

function HeaderTitle({ title, readOnly, onRename }: { title: string; readOnly: boolean; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <InlineEdit value={title} onSave={onRename} onDone={() => setEditing(false)} className="w-64 max-w-full font-medium" />
  return (
    <span className="group/title flex min-w-0 items-center gap-1.5">
      <span className="truncate font-medium" onDoubleClick={() => !readOnly && setEditing(true)}>
        {title}
      </span>
      {!readOnly && (
        <button aria-label="Rename goal" onClick={() => setEditing(true)} className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100">
          <Pencil className="size-3.5" />
        </button>
      )}
    </span>
  )
}

function StatusMenu({ overview, offline, readOnly }: { overview: Overview; offline: boolean; readOnly: boolean }) {
  const tunnel = overview.tunnel.status
  const rows: { label: string; value: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }[] = [
    { label: 'Grok Build', value: overview.supervisor.available ? 'Connected' : 'Not found', tone: overview.supervisor.available ? 'success' : 'danger' },
    { label: 'Desktop Bridge', value: overview.bridge.available ? 'Connected' : 'Off', tone: overview.bridge.available ? 'success' : 'warning' },
    { label: 'Phone tunnel', value: tunnel === 'up' ? 'On' : tunnel === 'starting' ? 'Starting' : tunnel === 'error' ? 'Error' : 'Off', tone: tunnel === 'up' ? 'success' : tunnel === 'error' ? 'danger' : 'neutral' },
  ]
  return (
    <div className="group relative">
      <button className={cn('flex h-8 items-center gap-1.5 rounded-md px-2 text-xs outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5', offline ? 'text-danger' : 'text-muted-foreground')}>
        <Dot tone={offline ? 'danger' : 'success'} pulse={!offline} />
        {offline ? 'Offline' : readOnly ? 'Read-only' : 'Live'}
      </button>
      <div className="invisible absolute top-full right-0 z-50 pt-1 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div className="w-56 rounded-lg bg-popover p-1.5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <Dot tone={r.tone} />
              <span className="flex-1">{r.label}</span>
              <span className="text-xs text-muted-foreground">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function useAlerts(mission: Mission | null) {
  const seen = useRef<{ id: string | null; findings: Set<string>; msgs: Map<string, string>; go: boolean | null }>({ id: null, findings: new Set(), msgs: new Map(), go: null })
  useEffect(() => {
    if (!mission) return
    const s = seen.current
    if (s.id !== mission.id) {
      s.id = mission.id
      s.findings = new Set(mission.findings.map((f) => f.id))
      s.msgs = new Map(mission.messages.map((m) => [m.id, m.status]))
      s.go = mission.verdict.go
      return
    }
    for (const f of mission.findings) {
      if (s.findings.has(f.id)) continue
      s.findings.add(f.id)
      toast[f.severity === 'high' ? 'error' : 'warning'](`Goal Director · ${f.taskId ?? 'mission'}`, { description: f.title })
    }
    for (const m of mission.messages) {
      const prev = s.msgs.get(m.id)
      if (prev === m.status) continue
      s.msgs.set(m.id, m.status)
      if (prev && ['accepted', 'resolved', 'rejected'].includes(m.status)) toast(`${m.id} ${m.status} by main chat`, { description: m.ackNote || m.text.slice(0, 90) })
    }
    if (s.go === false && mission.verdict.go) toast.success('Poll is GO', { description: 'Every task has proof.' })
    s.go = mission.verdict.go
  }, [mission])
}

function Welcome() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">No mission in flight</h1>
      <p className="text-muted-foreground">Give a big task to the agent with the goally skill. It splits the work into tasks, runs agents in parallel and this board follows along.</p>
      <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <code className="font-mono text-sm">/goally Add CSV export to reports</code>
      </div>
      <p className="text-sm text-muted-foreground">
        Or run <code className="font-mono text-foreground">goally demo</code> in a terminal to watch a simulated mission.
      </p>
    </div>
  )
}

const TITLES: Record<string, string> = { overview: 'Stats', board: 'Board', agents: 'Agents', director: 'Goal Director', activity: 'Activity', history: 'History', settings: 'Settings' }

export default function App() {
  const now = useNow(1000)
  const [route, go] = useHashRoute()
  const [task, setTask] = useState<string | null>(null)
  const [nav, setNav] = useState(false)
  const ov = usePoll<Overview>('/api/overview', 4000)
  const overview = ov.data
  const missionId = route.mission ?? overview?.defaultMission ?? null
  const ms = usePoll<Mission>(missionId ? `/api/missions/${missionId}` : null, 2000)
  const mission = ms.data && ms.data.id === missionId ? ms.data : null
  const readOnly = overview?.remote ?? false
  const offline = !!ms.error || !!ov.error
  const view = route.view in TITLES ? route.view : 'board'
  const global = view === 'history' || view === 'settings'
  useAlerts(mission)

  useEffect(() => {
    document.title = mission ? `${mission.verdict.go ? 'GO' : 'NO-GO'} · ${mission.title}` : 'Goally'
  }, [mission])
  useEffect(() => setNav(false), [route.view, route.mission])

  const rename = async (id: string, title: string) => {
    try {
      await post(`/api/missions/${id}/rename`, { title })
      toast.success('Goal renamed')
      ov.refresh()
      ms.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const setStatus = async (status: 'active' | 'paused') => {
    if (!mission) return
    try {
      await post(`/api/missions/${mission.id}/status`, { status })
      toast(status === 'paused' ? 'Mission paused' : 'Mission resumed', { description: status === 'paused' ? 'New agent launches are denied.' : 'Agents may launch again.' })
      ms.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (ov.error?.status === 401)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Private link required</h1>
        <p className="text-muted-foreground">Scan the QR code in Settings → Phone access on your Mac.</p>
      </div>
    )

  if (!overview)
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Connecting to Goally…
      </div>
    )

  const sidebar = <Sidebar overview={overview} mission={mission} missionId={missionId} view={view} go={go} onRename={rename} />
  const live = mission && (mission.status === 'active' || mission.status === 'paused')

  let body: React.ReactNode
  if (view === 'history') body = <HistoryView overview={overview} now={now} onPick={(id) => go({ mission: id, view: 'board' })} />
  else if (view === 'settings') body = <SettingsView overview={overview} onSaved={ov.refresh} />
  else if (!mission) body = missionId && !ms.error ? <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading mission…</div> : <Welcome />
  else if (view === 'board') body = <Board mission={mission} now={now} onOpenTask={setTask} />
  else if (view === 'agents') body = <Agents mission={mission} config={overview.config} now={now} onOpenTask={setTask} />
  else if (view === 'director') body = <Director mission={mission} overview={overview} now={now} readOnly={readOnly} refresh={ms.refresh} />
  else if (view === 'activity') body = <ActivityView mission={mission} onOpenTask={setTask} />
  else body = <OverviewView mission={mission} config={overview.config} now={now} onOpenTask={setTask} go={(v) => go({ view: v })} />

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-sidebar lg:block">{sidebar}</aside>
      <Sheet open={nav} onOpenChange={setNav}>
        <SheetContent side="left" showCloseButton={false} className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setNav(true)} aria-label="Menu">
            <Menu />
          </Button>
          {mission && !global ? (
            <div className="flex min-w-0 items-center gap-3 text-sm">
              <HeaderTitle title={mission.title} readOnly={readOnly} onRename={(t) => rename(mission.id, t)} />
              {mission.status !== 'active' && <Pill>{mission.status}</Pill>}
              <GoalProgress mission={mission} now={now} />
            </div>
          ) : (
            <span className="text-sm font-medium">{TITLES[view]}</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <StatusMenu overview={overview} offline={offline} readOnly={readOnly} />
            {live && !readOnly && !global && (
              <Button size="sm" variant="outline" onClick={() => setStatus(mission.status === 'paused' ? 'active' : 'paused')}>
                {mission.status === 'paused' ? <Play /> : <Pause />}
                {mission.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
            )}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
          {global && <PageHeader title={TITLES[view]} />}
          <AnimatePresence mode="wait">
            <motion.div key={view + (global ? '' : missionId)} initial={{ y: 6 }} animate={{ y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
              {body}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {mission && <TaskSheet taskId={task} mission={mission} now={now} onClose={() => setTask(null)} />}
      <Toaster position="bottom-right" />
    </div>
  )
}
