import { Bot, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Config, Mission } from '@/lib/api'
import { dur, stripTag } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AgentTree } from './agent-tree'
import { EmptyState, Pill, Segmented } from './shared'

export function Agents({ mission, config, now, onOpenTask }: { mission: Mission; config: Config; now: number; onOpenTask: (id: string) => void }) {
  const [layout, setLayout] = useState<'tree' | 'table'>('tree')
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all')
  const all = [...mission.agents].sort((a, b) => b.startedAt - a.startedAt)
  const isFailed = (a: Mission['agents'][number]) => a.status === 'error' || a.status === 'aborted'
  const count = (f: typeof filter) => all.filter((a) => f === 'all' || (f === 'failed' ? isFailed(a) : a.status === f)).length
  const rows = all.filter((a) => filter === 'all' || (filter === 'failed' ? isFailed(a) : a.status === filter))
  const running = all.filter((a) => a.status === 'running').length
  const failed = all.filter(isFailed)
  const tools = mission.main.toolCalls + mission.stats.subagentToolCalls

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
          <div className="flex flex-wrap items-center gap-3">
            {layout === 'tree' ? (
              <div className="flex items-center gap-3 text-sm tabnum">
                <span className="text-muted-foreground">{all.length} agents</span>
                {running > 0 && <span className="font-medium">{running} running</span>}
                {failed.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex h-6 items-center gap-1 rounded-md bg-danger/10 px-2 text-xs font-medium text-danger hover:bg-danger/15">
                      {failed.length} failed
                      <ChevronDown className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      {failed.map((a) => (
                        <DropdownMenuItem key={a.id} disabled={!a.taskId} onClick={() => a.taskId && onOpenTask(a.taskId)} className="flex-col items-start gap-0">
                          <span className="w-full truncate">
                            <span className="font-mono text-xs text-muted-foreground">{a.taskId ?? a.type}</span> {stripTag(a.task)}
                          </span>
                          {a.summary && <span className="w-full truncate text-xs text-muted-foreground">{a.summary}</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <span className="font-medium">{tools} tools</span>
              </div>
            ) : (
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
            )}
            <Segmented
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'tree', label: 'Tree' },
                { value: 'table', label: 'Table' },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {layout === 'tree' ? (
            <AgentTree mission={mission} now={now} onOpenTask={onOpenTask} />
          ) : rows.length === 0 ? (
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
                      <div className="truncate">{stripTag(a.task)}</div>
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
