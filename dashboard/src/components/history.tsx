import { Bot, Hammer, History as HistoryIcon, Rocket, ShieldCheck } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { Overview } from '@/lib/api'
import { ago, dur, pct } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Kpi, Pill } from './shared'

const chartConfig = { done: { label: 'Launched', color: 'var(--success)' }, open: { label: 'Open', color: 'var(--input)' } } satisfies ChartConfig

export function HistoryView({ overview, now, onPick }: { overview: Overview; now: number; onPick: (id: string) => void }) {
  const ms = overview.missions
  if (!ms.length) return <EmptyState icon={HistoryIcon} title="No missions yet" />
  const finished = ms.filter((m) => m.status === 'complete' || m.status === 'aborted')
  const tasks = ms.reduce((a, m) => a + m.total, 0)
  const proven = ms.reduce((a, m) => a + m.done, 0)
  const avg = finished.length ? finished.reduce((a, m) => a + m.elapsedMs, 0) / finished.length : null
  const data = [...ms].reverse().slice(-12).map((m) => ({ name: m.title.length > 18 ? m.title.slice(0, 17) + '…' : m.title, done: m.done, open: m.total - m.done }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Rocket} label="Missions" value={ms.length} sub={`${ms.filter((m) => m.go).length} reached GO`} />
        <Kpi icon={ShieldCheck} label="Tasks launched" value={`${proven}/${tasks}`} sub={pct(tasks ? proven / tasks : null)} />
        <Kpi icon={Bot} label="Agents launched" value={ms.reduce((a, m) => a + m.agentsTotal, 0)} sub={avg ? `avg mission ${dur(avg)}` : undefined} />
        <Kpi icon={Hammer} label="Full builds" value={ms.reduce((a, m) => a + m.fullBuilds, 0)} sub={`${ms.reduce((a, m) => a + m.findings, 0)} Director findings`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tasks per mission</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
            <BarChart data={data} margin={{ left: -20 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="done" stackId="a" fill="var(--color-done)" isAnimationActive={false} />
              <Bar dataKey="open" stackId="a" fill="var(--color-open)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All missions</CardTitle>
          <CardDescription>Stored in ~/.goally/missions</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Agents</TableHead>
                <TableHead className="hidden text-right md:table-cell">Duration</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ms.map((m) => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => onPick(m.id)}>
                  <TableCell className="max-w-[320px]">
                    <div className="truncate font-medium">{m.title}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{m.workspace.split('/').pop()}</div>
                  </TableCell>
                  <TableCell>
                    <Pill tone={m.go ? 'success' : m.status === 'active' ? 'active' : m.status === 'aborted' ? 'danger' : 'neutral'}>{m.go ? 'GO' : m.status}</Pill>
                  </TableCell>
                  <TableCell className="text-right tabnum">
                    {m.done}/{m.total}
                  </TableCell>
                  <TableCell className="hidden text-right tabnum sm:table-cell">{m.agentsTotal}</TableCell>
                  <TableCell className="hidden text-right tabnum md:table-cell">{dur(m.elapsedMs)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{ago(m.updatedAt, now)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
