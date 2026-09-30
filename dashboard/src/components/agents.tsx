import { FileWarning } from 'lucide-react'
import { useState } from 'react'
import type { Config, Mission } from '@/lib/api'
import { ago, dur, shortPath } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dot, EmptyState, Pill, Segmented } from './shared'

export function Agents({ mission, config, now, onOpenTask }: { mission: Mission; config: Config; now: number; onOpenTask: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all')
  const all = [...mission.agents].sort((a, b) => b.startedAt - a.startedAt)
  const count = (f: typeof filter) => all.filter((a) => f === 'all' || (f === 'failed' ? a.status === 'error' || a.status === 'aborted' : a.status === f)).length
  const rows = all.filter((a) => filter === 'all' || (filter === 'failed' ? a.status === 'error' || a.status === 'aborted' : a.status === filter))
  const running = all.filter((a) => a.status === 'running').length
  const collided = new Set(mission.collisions.map((c) => c.path))
  const files = [...mission.files].sort((a, b) => Number(collided.has(b.path)) - Number(collided.has(a.path)) || b.count - a.count)
  const label = (id: string) => (/^CT-\d+$/.test(id) ? id : id === 'main' ? 'Main' : mission.agents.find((a) => a.id === id)?.taskId ?? id.slice(0, 6))

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Manager</CardTitle>
          <CardDescription>The chat that owns the mission and receives Director messages.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <Dot tone={mission.main.status === 'working' ? 'success' : 'neutral'} pulse={mission.main.status === 'working'} />
            <span className="capitalize">{mission.main.status}</span>
          </span>
          <span className="text-muted-foreground">Last active {ago(mission.main.lastActivityAt, now)}</span>
          <span className="text-muted-foreground">{mission.main.toolCalls} tool calls</span>
          <span className="text-muted-foreground">{mission.main.stops} turns</span>
          <span className="font-mono text-xs text-muted-foreground">{mission.conversationId ?? 'not bound'}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Subagents</CardTitle>
            <CardDescription>
              {running} of {config.maxParallelAgents} slots in use
            </CardDescription>
          </div>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: count('all') },
              { value: 'running', label: 'Running', count: count('running') },
              { value: 'completed', label: 'Done', count: count('completed') },
              { value: 'failed', label: 'Failed', count: count('failed') },
            ]}
          />
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={FileWarning} title="No agents" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead className="hidden md:table-cell">Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Tools</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Msgs</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Files</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => a.taskId && onOpenTask(a.taskId)}>
                    <TableCell className="font-mono text-xs">{a.taskId ?? '—'}</TableCell>
                    <TableCell className="max-w-[320px]">
                      <div className="truncate">{a.task.replace(/^\[CT-\d+\]\s*/, '')}</div>
                      {a.summary && <div className="truncate text-xs text-muted-foreground">{a.summary}</div>}
                      {a.status === 'running' && now - a.lastActivityAt > 120000 && <div className="text-xs text-warning">Quiet for {dur(now - a.lastActivityAt)}</div>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{a.model || a.type}</TableCell>
                    <TableCell>
                      <Pill tone={a.status === 'running' ? 'active' : a.status === 'completed' ? 'success' : 'danger'}>{a.status === 'error' ? 'failed' : a.status}</Pill>
                    </TableCell>
                    <TableCell className="text-right tabnum">{dur(a.durationMs ?? now - a.startedAt)}</TableCell>
                    <TableCell className="hidden text-right tabnum sm:table-cell">{a.toolCallCount || a.liveToolCalls}</TableCell>
                    <TableCell className="hidden text-right tabnum xl:table-cell">{a.messageCount}</TableCell>
                    <TableCell className="hidden text-right tabnum xl:table-cell">{a.modifiedFiles.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>{mission.collisions.length ? `${mission.collisions.length} edited by more than one card` : 'No collisions'}</CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No edits yet.</p>
          ) : (
            <ul className="divide-y">
              {files.slice(0, 20).map((f) => (
                <li key={f.path} className="flex items-center gap-3 py-2">
                  <span className={cn('min-w-0 flex-1 truncate font-mono text-xs', collided.has(f.path) && 'text-danger')} title={f.path}>
                    {shortPath(f.path, mission.workspace)}
                  </span>
                  <span className="flex gap-1">
                    {f.agents.map((a) => (
                      <Pill key={a} tone={collided.has(f.path) ? 'danger' : 'neutral'}>
                        {label(a)}
                      </Pill>
                    ))}
                  </span>
                  <span className="w-8 text-right text-xs text-muted-foreground tabnum">×{f.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
