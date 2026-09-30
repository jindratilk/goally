import { ChevronDown, Pause, Play, Settings2, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Mission, Overview } from '@/lib/api'
import { post, useHashRoute, useNow, usePoll } from '@/lib/api'
import { ago, clock } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { Board } from '@/components/board'
import { Arrow, Dot, Note, Tag } from '@/components/blueprint'
import { FlightDirector } from '@/components/director'
import { Charts, Fleet, StatsStrip } from '@/components/fleet'
import { MissionHero } from '@/components/poll'
import { SettingsSheet } from '@/components/settings'
import { Files, Telemetry } from '@/components/telemetry'

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 32 32" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="16" cy="16" r="12" strokeOpacity=".35" />
        <circle cx="16" cy="16" r="6" />
        <path d="M16 2v5M16 25v5M2 16h5M25 16h5" />
        <path d="M16 16l8-8" strokeLinecap="round" />
      </svg>
      <div className="leading-none">
        <div className="display text-[15px] tracking-[0.22em]">Control Tower</div>
        <div className="label label-sm mt-1 hidden text-[9px] text-ink-3 sm:block">Mission control for agents</div>
      </div>
    </div>
  )
}

function MissionPicker({ overview, current, onPick }: { overview: Overview; current: string | null; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  if (overview.missions.length < 2) return null
  return (
    <div ref={ref} className="relative">
      <button className="btn-x sm" onClick={() => setOpen((o) => !o)}>
        Missions <span className="mono text-ink-3">{overview.missions.length}</span>
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="frame absolute top-9 right-0 z-50 w-[min(92vw,380px)] bg-black/95 p-1">
          {overview.missions.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onPick(m.id)
                setOpen(false)
              }}
              className={cn('flex w-full items-center gap-3 rounded-[3px] px-3 py-2.5 text-left hover:bg-white/5', m.id === current && 'bg-white/[0.06]')}
            >
              <Dot tone={m.status === 'active' ? 'go' : m.status === 'paused' ? 'warn' : m.status === 'aborted' ? 'nogo' : 'mute'} pulse={m.status === 'active'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px]">{m.title}</div>
                <div className="mono truncate text-[11px] text-ink-3">
                  {m.done}/{m.total} · {ago(m.updatedAt)} · {m.workspace.split('/').pop()}
                </div>
              </div>
              {m.go && <Tag tone="go">go</Tag>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function useAlerts(mission: Mission | null) {
  const seen = useRef<{ id: string | null; findings: Set<string>; msgs: Map<string, string>; go: boolean | null }>({ id: null, findings: new Set(), msgs: new Map(), go: null })
  useEffect(() => {
    if (!mission) return
    const s = seen.current
    const first = s.id !== mission.id
    if (first) {
      s.id = mission.id
      s.findings = new Set(mission.findings.map((f) => f.id))
      s.msgs = new Map(mission.messages.map((m) => [m.id, m.status]))
      s.go = mission.verdict.go
      return
    }
    for (const f of mission.findings) {
      if (s.findings.has(f.id)) continue
      s.findings.add(f.id)
      toast[f.severity === 'high' ? 'error' : 'warning'](`Flight Director · ${f.taskId ?? 'mission'}`, { description: f.title })
    }
    for (const m of mission.messages) {
      const prev = s.msgs.get(m.id)
      if (prev === m.status) continue
      s.msgs.set(m.id, m.status)
      if (prev && ['accepted', 'resolved', 'rejected'].includes(m.status)) toast(`${m.id} ${m.status} by MAIN`, { description: m.ackNote || m.text.slice(0, 90) })
    }
    if (s.go === false && mission.verdict.go) toast.success('Poll is GO', { description: 'Every card has proof.' })
    s.go = mission.verdict.go
  }, [mission])
}

function EmptyState({ overview }: { overview: Overview | null }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-8 py-16 sm:py-28">
      <span className="label text-bp-ink">Standing by</span>
      <h1 className="display text-[44px] sm:text-[76px]">No mission in flight</h1>
      <p className="max-w-xl text-[16px] leading-relaxed text-ink-2">
        Hand a big task to the agent with the <code className="mono text-ink">control-tower</code> skill. It audits the request, splits it into cards, and this board comes alive with parallel agents, proof of done and the Flight Director.
      </p>
      <div className="frame w-full p-5">
        <span className="label label-sm">In a Cursor chat</span>
        <code className="mono mt-2 block text-[14px] text-ink">/control-tower Add CSV export to reports, verify on preview</code>
        <div className="mt-5 flex items-center gap-3">
          <Arrow className="h-6 w-14" />
          <Note>or watch a simulated mission: run `tower demo` in a terminal</Note>
        </div>
      </div>
      {overview && (
        <div className="flex flex-wrap gap-3 text-[12px] text-ink-3">
          <span className="flex items-center gap-2">
            <Dot tone={overview.supervisor.available ? 'go' : 'nogo'} /> Grok Build
          </span>
          <span className="flex items-center gap-2">
            <Dot tone={overview.bridge.available ? 'go' : 'warn'} /> Desktop Bridge
          </span>
          <span className="flex items-center gap-2">
            <Dot tone={overview.tunnel.status === 'up' ? 'go' : 'mute'} /> Phone tunnel
          </span>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const now = useNow(1000)
  const [routeId, go] = useHashRoute()
  const [settings, setSettings] = useState(false)
  const ov = usePoll<Overview>('/api/overview', 4000)
  const overview = ov.data
  const missionId = routeId ?? overview?.defaultMission ?? null
  const ms = usePoll<Mission>(missionId ? `/api/missions/${missionId}` : null, 2000)
  const mission = ms.data && ms.data.id === missionId ? ms.data : null
  const readOnly = overview?.remote ?? false
  const offline = !!ms.error || !!ov.error
  useAlerts(mission)

  useEffect(() => {
    document.title = mission ? `${mission.verdict.go ? 'GO' : 'NO-GO'} · ${mission.title} · Control Tower` : 'Control Tower'
  }, [mission])

  const setStatus = async (status: 'active' | 'paused') => {
    if (!mission) return
    try {
      await post(`/api/missions/${mission.id}/status`, { status })
      toast(status === 'paused' ? 'Mission paused' : 'Mission resumed', { description: status === 'paused' ? 'New subagent launches are denied.' : 'Agents may launch again.' })
      ms.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const unauthorized = ov.error?.status === 401
  const config = overview?.config
  const lastSync = useMemo(() => (ms.lastOk ? clock(now - ms.lastOk) : null), [now, ms.lastOk])

  return (
    <>
      <div className="backdrop" />
      <div className="grain" />
      <header className="sticky top-0 z-40 border-b border-line-2 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <span className={cn('hidden items-center gap-2 text-[11px] uppercase tracking-[0.16em] sm:flex', offline ? 'text-nogo' : 'text-ink-3')}>
              {offline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
              {offline ? 'Signal lost' : readOnly ? 'Remote · read-only' : 'Live'}
              {!offline && lastSync && <span className="mono normal-case tracking-normal">{lastSync}</span>}
            </span>
            {overview && <MissionPicker overview={overview} current={missionId} onPick={go} />}
            {mission && !readOnly && (mission.status === 'active' || mission.status === 'paused') && (
              <button className="btn-x sm" onClick={() => setStatus(mission.status === 'paused' ? 'active' : 'paused')}>
                {mission.status === 'paused' ? <Play className="size-3" /> : <Pause className="size-3" />}
                <span className="hidden sm:inline">{mission.status === 'paused' ? 'Resume' : 'Pause'}</span>
              </button>
            )}
            {overview && (
              <button className="btn-x sm" onClick={() => setSettings(true)} aria-label="Settings">
                <Settings2 className="size-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-6">
        {unauthorized && (
          <div className="py-24 text-center">
            <h1 className="display text-[40px]">Private link required</h1>
            <p className="mt-3 text-ink-2">Scan the QR code from Settings → Remote access on your Mac.</p>
          </div>
        )}
        {!unauthorized && !mission && (!overview || (missionId && !ms.error)) && (
          <div className="flex items-center justify-center gap-3 py-40">
            <Dot tone="ink" pulse />
            <span className="label">Acquiring signal</span>
          </div>
        )}
        {!unauthorized && !mission && overview && (!missionId || ms.error) && <EmptyState overview={overview} />}
        {mission && overview && config && (
          <>
            <MissionHero mission={mission} now={now} />
            <StatsStrip mission={mission} />
            <Board mission={mission} now={now} />
            <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
                <Fleet mission={mission} config={config} now={now} />
                <Files mission={mission} />
              </div>
              <FlightDirector mission={mission} overview={overview} config={config} now={now} readOnly={readOnly} />
            </div>
            <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Charts mission={mission} config={config} now={now} />
              <Telemetry mission={mission} />
            </div>
            <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 py-6 text-[11px] uppercase tracking-[0.16em] text-ink-3">
              <span className="mono normal-case tracking-normal">{mission.workspace}</span>
              <span>MAIN {mission.conversationId ? mission.conversationId.slice(0, 8) : 'unbound'}</span>
              <span>Control Tower {overview.version}</span>
            </footer>
          </>
        )}
      </main>
      {overview && <SettingsSheet open={settings} onOpenChange={setSettings} overview={overview} onSaved={ov.refresh} />}
      <Toaster position="bottom-right" />
    </>
  )
}
