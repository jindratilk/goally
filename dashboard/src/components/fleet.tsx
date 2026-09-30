import { motion } from 'motion/react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Config, Mission } from '@/lib/api'
import { dur, pct, tplus } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Dot, Empty, Note, Panel, Stat } from './blueprint'

export function Fleet({ mission, config, now }: { mission: Mission; config: Config; now: number }) {
  const running = mission.agents.filter((a) => a.status === 'running')
  const recent = mission.agents.filter((a) => a.status !== 'running').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)).slice(0, 4)
  const limit = config.maxParallelAgents
  const mainIdle = mission.main.lastActivityAt ? now - mission.main.lastActivityAt : null
  return (
    <Panel
      code="03"
      title="Fleet"
      aside={
        <div className="flex items-center gap-1" aria-label={`${running.length} of ${limit} slots`}>
          {Array.from({ length: Math.max(limit, running.length) }, (_, i) => (
            <span key={i} className={cn('h-3 w-2 rounded-[1px] border', i < running.length ? (i >= limit ? 'border-nogo bg-nogo' : 'border-ink bg-ink') : 'border-line')} />
          ))}
          <span className="mono ml-2 text-[11px] text-ink-2 tabnum">
            {running.length}/{limit}
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-[4px] border border-ink/30 bg-white/[0.03] px-3 py-2.5">
          <Dot tone={mission.main.status === 'working' ? 'go' : 'mute'} pulse={mission.main.status === 'working'} />
          <span className="cond text-[15px]">Main · manager</span>
          <span className="text-[12px] text-ink-3">{mission.main.lastTool ? `last ${mission.main.lastTool}` : 'waiting'}</span>
          <span className="mono ml-auto text-[11px] text-ink-3 tabnum">{mainIdle != null ? `idle ${dur(mainIdle)}` : '—'}</span>
        </div>
        {running.map((a) => (
          <motion.div
            key={a.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="scan grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-[4px] border border-line px-3 py-2.5"
          >
            <Dot tone="ink" pulse />
            <span className="min-w-0 truncate text-[14px]">
              <span className="mono mr-2 text-[12px] text-ink">{a.taskId ?? '—'}</span>
              {a.task.replace(/^\[CT-\d+\]\s*/, '')}
            </span>
            <span className="mono text-[11px] text-ink-2 tabnum">{dur(now - a.startedAt)}</span>
            <span />
            <span className="truncate text-[11px] text-ink-3">
              {a.model || a.type} · {a.liveToolCalls} tools{a.lastTool ? ` · ${a.lastTool}` : ''}
              {now - a.lastActivityAt > 120000 && <span className="text-warn"> · quiet {dur(now - a.lastActivityAt)}</span>}
            </span>
            <span />
          </motion.div>
        ))}
        {running.length === 0 && <Empty>No subagents in flight.</Empty>}
        {recent.length > 0 && (
          <div className="mt-2">
            <span className="label label-sm">Recently landed</span>
            <ul className="mt-2 space-y-1.5">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-[12px] text-ink-2">
                  <Dot tone={a.status === 'completed' ? 'go' : 'nogo'} />
                  <span className="mono text-[11px]">{a.taskId ?? a.id.slice(0, 6)}</span>
                  <span className="truncate text-ink-3">{a.summary || a.status}</span>
                  <span className="mono ml-auto shrink-0 text-[11px] text-ink-3">{dur(a.durationMs)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  )
}

export function StatsStrip({ mission }: { mission: Mission }) {
  const s = mission.stats
  const items = [
    { label: 'Agents', value: s.agentsTotal, sub: `peak ${s.peakParallel} parallel` },
    { label: 'Tests', value: `${s.testsPass}/${s.tests}`, sub: `${pct(s.passRate)} pass · ${s.targetedTests} targeted`, tone: s.testsFail ? ('warn' as const) : undefined },
    { label: 'Full builds', value: s.fullBuilds, sub: 'targeted tests preferred', tone: s.fullBuilds ? ('warn' as const) : undefined },
    { label: 'Tool calls', value: s.toolCalls + s.subagentToolCalls, sub: `${s.failures} failed` },
    { label: 'Files', value: s.filesTouched, sub: `${s.collisions} collisions`, tone: s.collisions ? ('nogo' as const) : undefined },
    { label: 'Interventions', value: `${s.interventionsResolved}/${s.interventions}`, sub: `${s.supervisorRuns} director checks` },
  ]
  return (
    <section className="frame grid grid-cols-2 divide-line-2 sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-line-2 [&>*:not(:last-child)]:border-b sm:[&>*]:border-r xl:[&>*]:border-b-0">
      {items.map((i) => (
        <Stat key={i.label} {...i} />
      ))}
    </section>
  )
}

const axis = { stroke: 'var(--ink-3)', fontSize: 10, fontFamily: 'JetBrains Mono Variable, monospace' }

export function Charts({ mission, config, now }: { mission: Mission; config: Config; now: number }) {
  const start = mission.startedAt
  const series = [...mission.parallel]
  if (series.length) series.push({ t: mission.endedAt ?? now, n: series.at(-1)!.n })
  const limit = config.maxParallelAgents
  const s = mission.stats
  const mix = [
    { name: 'Targeted', v: s.targetedTests, fill: 'var(--go)' },
    { name: 'Broad suite', v: s.broadTests, fill: 'var(--warn)' },
    { name: 'Full build', v: s.fullBuilds, fill: 'var(--nogo)' },
  ]
  const byKind = Object.entries(s.findingsByKind)
  return (
    <Panel code="04" title="Telemetry charts" aside={<Note className="hidden text-[13px] sm:inline">keep it under the limit line</Note>}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <span className="label label-sm">Parallel agents vs limit</span>
          <div className="mt-3 h-44">
            {series.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--ink)" stopOpacity={0.35} />
                      <stop offset="1" stopColor="var(--ink)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line-2)" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => tplus(t, start).slice(2)} tick={axis} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={40} />
                  <YAxis allowDecimals={false} domain={[0, Math.max(limit + 1, s.peakParallel)]} tick={axis} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ stroke: 'var(--ink-3)' }}
                    contentStyle={{ background: '#000', border: '1px solid var(--line)', borderRadius: 4, fontSize: 12 }}
                    labelFormatter={(t) => tplus(Number(t), start)}
                    formatter={(v) => [v, 'agents']}
                  />
                  <ReferenceLine y={limit} stroke="var(--warn)" strokeDasharray="4 4" label={{ value: `LIMIT ${limit}`, fill: 'var(--warn)', fontSize: 10, position: 'insideTopRight', letterSpacing: 2 }} />
                  <Area type="stepAfter" dataKey="n" stroke="var(--ink)" strokeWidth={1.5} fill="url(#pf)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Empty>Chart starts with the first launch.</Empty>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <span className="label label-sm">Verification mix</span>
            <div className="mt-3 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mix} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={84} tick={{ ...axis, fill: 'var(--ink-2)' }} tickLine={false} axisLine={false} />
                  <Bar dataKey="v" barSize={8} radius={1} isAnimationActive={false} label={{ position: 'right', fill: 'var(--ink-2)', fontSize: 11 }}>
                    {mix.map((m) => (
                      <Cell key={m.name} fill={m.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <span className="label label-sm">Director findings by kind</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {byKind.length === 0 && <span className="text-[13px] text-ink-3">clean so far</span>}
              {byKind.map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-2 rounded-[3px] border border-line px-2 py-1 text-[12px]">
                  <span className="uppercase tracking-[0.12em] text-ink-2">{k}</span>
                  <span className="mono text-ink">{v}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
