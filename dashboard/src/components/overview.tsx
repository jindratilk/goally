import { Activity, Bot, FlaskConical, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { Config, Mission } from '@/lib/api'
import { ago, clock, pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import { EmptyState, Kpi, Pill, TaskBadge } from './shared'

const parallelConfig = { n: { label: 'Agents', color: 'var(--chart-1)' } } satisfies ChartConfig
const mixConfig = { v: { label: 'Runs' } } satisfies ChartConfig

export function Overview({ mission, config, now, onOpenTask, go }: { mission: Mission; config: Config; now: number; onOpenTask: (id: string) => void; go: (view: string) => void }) {
  const v = mission.verdict
  const s = mission.stats
  const running = mission.agents.filter((a) => a.status === 'running').length
  const open = mission.findings.filter((f) => f.status === 'open')
  const series = [...mission.parallel]
  if (series.length) series.push({ t: mission.endedAt ?? now, n: series.at(-1)!.n })
  const mix = [
    { name: 'Targeted', v: s.targetedTests, fill: 'var(--success)' },
    { name: 'Broad suite', v: s.broadTests, fill: 'var(--warning)' },
    { name: 'Full build', v: s.fullBuilds, fill: 'var(--danger)' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={ShieldCheck} label="Proven" value={`${v.done}/${v.total}`} tone={v.go ? 'success' : undefined}>
          <Progress value={Math.round(v.coverage * 100)} className="[&_[data-slot=progress-indicator]]:bg-success" />
        </Kpi>
        <Kpi icon={Bot} label="Agents running" value={`${running}/${config.maxParallelAgents}`} sub={`${s.agentsTotal} total · peak ${s.peakParallel}`} />
        <Kpi icon={FlaskConical} label="Tests passing" value={pct(s.passRate)} sub={`${s.testsPass}/${s.tests} · ${s.fullBuilds} full builds`} tone={s.testsFail ? 'warning' : undefined} />
        <Kpi icon={ShieldAlert} label="Open findings" value={open.length} sub={`${s.interventionsResolved}/${s.interventions} interventions resolved`} tone={open.some((f) => f.severity === 'high') ? 'danger' : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Go / No-go</CardTitle>
            <CardDescription>A card is GO only with proof after its last edit.</CardDescription>
            <CardAction>
              <Pill tone={v.go ? 'success' : 'danger'} className="h-6 px-2.5 text-xs">
                {v.go ? 'GO' : 'NO-GO'}
              </Pill>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {v.stations.map((st) => (
              <button key={st.taskId} onClick={() => onOpenTask(st.taskId)} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted">
                <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">{st.taskId}</span>
                <span className="min-w-0 flex-1 truncate">{st.title}</span>
                <TaskBadge status={st.status} />
              </button>
            ))}
            {!v.go && v.blockers.length > 0 && (
              <div className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {v.blockers.slice(0, 3).map((b) => (
                  <div key={b} className="truncate">
                    {b}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Parallel agents</CardTitle>
            <CardDescription>Running subagents over time against the limit of {config.maxParallelAgents}.</CardDescription>
          </CardHeader>
          <CardContent>
            {series.length > 1 ? (
              <ChartContainer config={parallelConfig} className="aspect-auto h-52 w-full">
                <AreaChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="fillN" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-n)" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="var(--color-n)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => clock(t - mission.startedAt)} tickLine={false} axisLine={false} minTickGap={48} />
                  <YAxis allowDecimals={false} domain={[0, Math.max(config.maxParallelAgents + 1, s.peakParallel)]} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `T+${clock(Number(p?.[0]?.payload?.t) - mission.startedAt)}`} />} />
                  <ReferenceLine y={config.maxParallelAgents} stroke="var(--warning)" strokeDasharray="4 4" />
                  <Area type="stepAfter" dataKey="n" stroke="var(--color-n)" strokeWidth={1.5} fill="url(#fillN)" isAnimationActive={false} />
                </AreaChart>
              </ChartContainer>
            ) : (
              <EmptyState icon={Activity} title="No launches yet" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Verification</CardTitle>
            <CardDescription>Targeted tests beat full builds.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={mixConfig} className="aspect-auto h-32 w-full">
              <BarChart data={mix} layout="vertical" margin={{ left: 0, right: 24 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={84} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="v" radius={4} barSize={14} isAnimationActive={false} label={{ position: 'right', fontSize: 12, fill: 'var(--muted-foreground)' }}>
                  {mix.map((m) => (
                    <Cell key={m.name} fill={m.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Latest activity</CardTitle>
            <CardAction>
              <button onClick={() => go('activity')} className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col">
              {[...mission.timeline].reverse().slice(0, 6).map((e) => (
                <li key={e.seq} className="flex items-center gap-3 border-b py-2 text-sm last:border-0">
                  <span className={cn('size-1.5 shrink-0 rounded-full', e.level === 'error' ? 'bg-danger' : e.level === 'warn' ? 'bg-warning' : e.level === 'ok' ? 'bg-success' : 'bg-subtle')} />
                  <span className="min-w-0 flex-1 truncate">{e.text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabnum">{ago(e.t, now)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
