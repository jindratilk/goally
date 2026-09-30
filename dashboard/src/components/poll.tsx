import { motion } from 'motion/react'
import type { Mission } from '@/lib/api'
import { clock } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Arrow, Dim, Dot, Note, Tag } from './blueprint'

const STATUS_WORD: Record<string, string> = {
  todo: 'Standby',
  running: 'In flight',
  review: 'Review',
  blocked: 'Hold',
  failed: 'Scrub',
  done: 'Go',
}

function Ring({ mission }: { mission: Mission }) {
  const { stations, go, done, total } = mission.verdict
  const n = Math.max(stations.length, 1)
  const R = 118
  const C = 2 * Math.PI * R
  const gap = n > 1 ? 6 : 0
  const seg = C / n - gap
  const running = mission.agents.filter((a) => a.status === 'running').length
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <svg viewBox="0 0 300 300" className="absolute inset-0 size-full -rotate-90">
        <circle cx="150" cy="150" r="142" fill="none" stroke="var(--line-2)" />
        <circle cx="150" cy="150" r="96" fill="none" stroke="var(--line-2)" strokeDasharray="2 6" />
        {stations.map((s, i) => {
          const color = s.go ? 'var(--go)' : s.status === 'blocked' || s.status === 'failed' ? 'var(--nogo)' : s.status === 'running' || s.status === 'review' ? 'var(--ink)' : 'var(--line)'
          return (
            <motion.circle
              key={s.taskId}
              cx="150"
              cy="150"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={s.go ? 10 : 6}
              strokeDasharray={`${seg} ${C - seg}`}
              initial={false}
              animate={{ strokeDashoffset: -(i * (seg + gap)), opacity: s.status === 'todo' ? 0.5 : 1 }}
              transition={{ type: 'spring', stiffness: 80, damping: 18 }}
            />
          )
        })}
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2
          const r1 = i % 5 === 0 ? 132 : 136
          return <line key={i} x1={150 + Math.cos(a) * r1} y1={150 + Math.sin(a) * r1} x2={150 + Math.cos(a) * 140} y2={150 + Math.sin(a) * 140} stroke="var(--ink-3)" strokeWidth={i % 5 === 0 ? 1 : 0.5} />
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="label label-sm">Poll</span>
        <motion.span
          key={go ? 'go' : 'nogo'}
          initial={{ scale: 0.94 }}
          animate={{ scale: 1 }}
          className={cn('display mt-1 text-[54px] sm:text-[62px]', go ? 'text-go' : 'text-ink')}
        >
          {go ? 'GO' : 'NO-GO'}
        </motion.span>
        <span className="mono tabnum mt-1 text-[12px] text-ink-2">
          {done}/{total} proven{running ? ` · ${running} in flight` : ''}
        </span>
      </div>
    </div>
  )
}

export function MissionHero({ mission, now }: { mission: Mission; now: number }) {
  const elapsed = (mission.endedAt ?? now) - mission.startedAt
  const { stations, blockers, go } = mission.verdict
  const statusTone = mission.status === 'complete' ? 'go' : mission.status === 'aborted' ? 'nogo' : mission.status === 'paused' ? 'warn' : 'ink'
  return (
    <section className="frame overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="relative flex min-w-0 flex-col gap-6 p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={statusTone}>
              <Dot tone={statusTone === 'ink' ? 'go' : statusTone} pulse={mission.status === 'active'} />
              {mission.status}
            </Tag>
            <span className="mono text-[11px] text-ink-3">{mission.id}</span>
          </div>
          <div>
            <h1 className="display text-balance text-[34px] sm:text-[52px] xl:text-[60px]">{mission.title}</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">
              <span className="label label-sm mr-2 text-bp-ink">Goal</span>
              {mission.goal}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line-2 py-4 sm:grid-cols-4">
            {[
              ['Workspace', mission.workspace.split('/').pop() || mission.workspace],
              ['Manager', mission.conversationId ? `MAIN ${mission.conversationId.slice(0, 8)}` : 'not bound'],
              ['Launched', new Date(mission.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
              ['Agents flown', String(mission.stats.agentsTotal)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="label label-sm">{k}</dt>
                <dd className="mono mt-1 truncate text-[12px] text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto grid grid-cols-2 gap-6 sm:flex sm:items-end sm:gap-10">
            <div>
              <span className="label label-sm">Mission clock</span>
              <div className="display tabnum mt-1 text-[40px] sm:text-[56px]">
                <span className="text-ink-3">T+</span>
                {clock(elapsed)}
              </div>
            </div>
            <div>
              <span className="label label-sm">Coverage</span>
              <div className="display tabnum mt-1 text-[40px] sm:text-[56px]">{Math.round(mission.verdict.coverage * 100)}%</div>
            </div>
          </div>
          <div className="relative">
            <Dim label={`${mission.verdict.done} / ${mission.verdict.total} CARDS WITH PROOF`} />
            <div className="mt-3 h-[3px] w-full bg-line-2">
              <motion.div className="h-full bg-ink" initial={false} animate={{ width: `${mission.verdict.coverage * 100}%` }} transition={{ type: 'spring', stiffness: 60, damping: 20 }} />
            </div>
          </div>
        </div>

        <div className="relative order-first flex min-w-0 flex-col gap-4 border-b border-line-2 p-5 sm:p-8 lg:order-none lg:border-b-0 lg:border-l">
          <div className="pointer-events-none absolute top-6 right-6 hidden flex-col items-end sm:flex">
            <Note className="text-right">
              proof = passing check
              <br />
              after the last edit
            </Note>
            <Arrow className="mt-1 h-7 w-16 -scale-x-100" d="M4 6 C 30 30, 60 30, 86 16" />
          </div>
          <Ring mission={mission} />
          <ol className="flex flex-col gap-1.5">
            {stations.map((s) => (
              <li key={s.taskId} className="flex items-baseline gap-2 text-[13px]">
                <span className="mono w-11 shrink-0 text-[11px] text-ink-3">{s.taskId}</span>
                <span className="min-w-0 truncate uppercase tracking-[0.08em]">{s.title}</span>
                <span className="leader" />
                <span
                  className={cn(
                    'cond shrink-0 text-[13px] tracking-[0.14em]',
                    s.go ? 'text-go' : s.status === 'blocked' || s.status === 'failed' ? 'text-nogo' : s.status === 'todo' ? 'text-ink-3' : 'text-ink',
                  )}
                  title={s.reason}
                >
                  {STATUS_WORD[s.status] ?? s.status}
                </span>
              </li>
            ))}
          </ol>
          {!go && blockers.length > 0 && (
            <div className="hatch-nogo rounded-[3px] border border-nogo/30 px-3 py-2.5">
              <span className="label label-sm text-nogo">Holds</span>
              <ul className="mt-1 space-y-0.5 text-[13px] text-ink-2">
                {blockers.slice(0, 4).map((b) => (
                  <li key={b}>— {b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
