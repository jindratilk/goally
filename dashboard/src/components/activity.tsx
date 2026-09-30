import { Bot, FlaskConical, GitBranch, Hammer, MessageSquare, OctagonAlert, Radar, Rocket, Search, ShieldCheck, Split, SquareKanban, Zap, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { Mission, TimelineItem } from '@/lib/api'
import { dur, tplus } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Pill, Segmented } from './shared'

const ICON: Record<string, LucideIcon> = {
  mission: Rocket, task: SquareKanban, proof: ShieldCheck, agent: Bot, test: FlaskConical, build: Hammer, git: GitBranch, deploy: Rocket,
  error: OctagonAlert, collision: Split, compact: Zap, main: Bot, blocked: OctagonAlert, finding: Radar, message: MessageSquare, ack: MessageSquare, supervisor: Radar,
}
const FILTERS: Record<string, (e: TimelineItem) => boolean> = {
  all: () => true,
  alerts: (e) => e.level === 'warn' || e.level === 'error',
  proof: (e) => ['proof', 'test', 'build'].includes(e.kind),
  agents: (e) => ['agent', 'collision', 'blocked', 'main'].includes(e.kind),
  director: (e) => ['finding', 'message', 'ack', 'supervisor'].includes(e.kind),
}

export function ActivityView({ mission, onOpenTask }: { mission: Mission; onOpenTask: (id: string) => void }) {
  const [tab, setTab] = useState<'events' | 'commands'>('events')
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase())
  const events = [...mission.timeline].reverse().filter((e) => FILTERS[filter](e) && match(e.text))
  const commands = [...mission.tools].reverse().filter((t) => t.command && match(`${t.agent} ${t.command}`))
  const label = (a: string) => (a === 'main' ? 'Main' : mission.agents.find((x) => x.id === a)?.taskId ?? a.slice(0, 6))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'events', label: 'Events', count: mission.timeline.length }, { value: 'commands', label: 'Commands', count: mission.tools.filter((t) => t.command).length }]} />
        {tab === 'events' && (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={Object.keys(FILTERS).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1), count: mission.timeline.filter(FILTERS[k]).length }))}
          />
        )}
        <div className="relative w-full sm:ml-auto sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 bg-card pl-8" />
        </div>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {tab === 'events' ? (
            events.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Search} title="No matching events" />
              </div>
            ) : (
              <ul className="divide-y">
                {events.map((e) => {
                  const Icon = ICON[e.kind] ?? Zap
                  return (
                    <li key={e.seq} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{tplus(e.t, mission.startedAt)}</span>
                      <Icon className={cn('size-4 shrink-0', e.level === 'error' ? 'text-danger' : e.level === 'warn' ? 'text-warning' : e.level === 'ok' ? 'text-success' : 'text-muted-foreground')} />
                      <span className="min-w-0 flex-1 truncate">{e.text}</span>
                      {e.taskId && (
                        <button onClick={() => onOpenTask(e.taskId!)} className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground">
                          {e.taskId}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Time</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="pr-4 text-right">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commands.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground">{tplus(t.t, mission.startedAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{label(t.agent)}</TableCell>
                    <TableCell className="max-w-[420px] truncate font-mono text-xs">{t.command}</TableCell>
                    <TableCell>
                      <Pill tone={t.full ? 'danger' : t.targeted ? 'success' : 'neutral'}>{t.full ? 'full build' : t.targeted ? 'targeted' : t.kind}</Pill>
                    </TableCell>
                    <TableCell className="pr-4 text-right text-xs">
                      <span className={t.ok ? 'text-success' : 'text-danger'}>{t.ok ? 'ok' : `exit ${t.exitCode ?? '?'}`}</span>
                      {t.durationMs != null && <span className="ml-2 text-muted-foreground">{dur(t.durationMs)}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
