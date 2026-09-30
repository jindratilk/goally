import { Bot } from 'lucide-react'
import { useState } from 'react'
import type { Config, Mission } from '@/lib/api'
import { dur } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Pill, Segmented } from './shared'

export function Agents({ mission, config, now, onOpenTask }: { mission: Mission; config: Config; now: number; onOpenTask: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all')
  const all = [...mission.agents].sort((a, b) => b.startedAt - a.startedAt)
  const count = (f: typeof filter) => all.filter((a) => f === 'all' || (f === 'failed' ? a.status === 'error' || a.status === 'aborted' : a.status === f)).length
  const rows = all.filter((a) => filter === 'all' || (filter === 'failed' ? a.status === 'error' || a.status === 'aborted' : a.status === filter))
  const running = all.filter((a) => a.status === 'running').length

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Agents</CardTitle>
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
            <EmptyState icon={Bot} title="No agents" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
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
    </div>
  )
}
