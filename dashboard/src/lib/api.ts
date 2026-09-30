import { useCallback, useEffect, useRef, useState } from 'react'

export type TaskStatus = 'todo' | 'running' | 'review' | 'blocked' | 'failed' | 'done'

export interface Evidence { kind: string; ref: string; t: number }
export interface Task {
  id: string
  title: string
  description: string
  acceptance: string
  verify: string
  depends: string[]
  lane: string
  status: TaskStatus
  owner: string | null
  agentIds: string[]
  notes: { t: number; text: string; status?: string }[]
  evidence: Evidence[]
  proof: { ok: boolean; reason: string; at: number } | null
  startedAt: number | null
  doneAt: number | null
  updatedAt: number
}
export interface Agent {
  id: string
  type: string
  task: string
  taskId: string | null
  model: string
  parallel: boolean
  status: 'running' | 'completed' | 'error' | 'aborted'
  startedAt: number
  endedAt: number | null
  durationMs: number | null
  messageCount: number
  toolCallCount: number
  liveToolCalls: number
  modifiedFiles: string[]
  summary: string
  lastActivityAt: number
  lastTool: string | null
}
export interface Finding {
  id: string
  kind: string
  severity: 'low' | 'medium' | 'high'
  taskId: string | null
  title: string
  detail: string
  action: string
  t: number
  status: 'open' | 'resolved' | 'dismissed'
}
export interface Message {
  id: string
  from: 'flight-director' | 'user' | string
  severity: 'low' | 'medium' | 'high'
  taskId?: string | null
  findingId?: string | null
  text: string
  t: number
  status: 'queued' | 'delivered' | 'accepted' | 'rejected' | 'resolved' | string
  via?: string | null
  attempts?: number
  deliveredAt?: number | null
  ackNote?: string
}
export interface TimelineItem { t: number; seq: number; kind: string; text: string; level?: 'info' | 'warn' | 'error' | 'ok'; taskId?: string; agent?: string }
export interface ToolCall { t: number; agent: string; tool: string; kind: string; command?: string; exitCode?: number | null; ok: boolean; targeted: boolean; full: boolean; durationMs?: number | null; error?: string | null }
export interface FileTouch { path: string; count: number; agents: string[]; lastAt: number; lastAgent: string }
export interface Station { taskId: string; title: string; go: boolean; status: TaskStatus; reason: string }
export interface Verdict { go: boolean; done: number; total: number; coverage: number; stations: Station[]; blockers: string[] }
export interface Stats {
  elapsedMs: number; agentsTotal: number; agentsRunning: number; agentsFailed: number; peakParallel: number; avgAgentMs: number
  toolCalls: number; subagentToolCalls: number; filesTouched: number; edits: number; tests: number; testsPass: number; testsFail: number
  passRate: number | null; targetedTests: number; broadTests: number; fullBuilds: number; failures: number; compactions: number
  commits: number; deploys: number; blocked: number; collisions: number; findings: number; findingsByKind: Record<string, number>
  interventions: number; interventionsResolved: number; supervisorRuns: number; supervisorCostUsd: number
}
export interface Mission {
  id: string
  title: string
  goal: string
  workspace: string
  conversationId: string | null
  threadId: string | null
  status: 'active' | 'paused' | 'complete' | 'aborted'
  startedAt: number
  endedAt: number | null
  updatedAt: number
  tasks: Task[]
  agents: Agent[]
  main: { status: string; lastActivityAt: number | null; lastTool: string | null; toolCalls: number; stops: number }
  files: FileTouch[]
  collisions: { path: string; agents: string[]; t: number }[]
  findings: Finding[]
  messages: Message[]
  supervisor: { runs: number; lastRunAt: number | null; lastOk: boolean | null; lastError: string | null; costUsd: number; running: boolean; lastSummary: string | null }
  timeline: TimelineItem[]
  tools: ToolCall[]
  parallel: { t: number; n: number }[]
  verdict: Verdict
  stats: Stats
  url: string
}
export interface MissionSummary { id: string; title: string; workspace: string; status: Mission['status']; startedAt: number; endedAt: number | null; updatedAt: number; done: number; total: number; go: boolean; elapsedMs: number; agentsTotal: number; findings: number; fullBuilds: number }
export interface Config {
  maxParallelAgents: number
  supervisor: { enabled: boolean; intervalMin: number; model: string; effort: string; triggerOnAgentStop: boolean; maxTurns: number; timeoutSec: number }
  intervention: 'observe' | 'message' | 'block'
  fullBuild: { policy: 'allow' | 'warn' | 'block'; patterns: string[] }
  stopLoopLimit: number
  delivery: { bridge: 'auto' | 'off'; forceOnHigh: boolean; forceCooldownMin: number; resendAfterMin: number }
  remote: { enabled: boolean; hostname: string; readKey?: string }
}
export interface TunnelInfo { status: 'off' | 'starting' | 'up' | 'error'; hostname?: string | null; error?: string | null; startedAt?: number | null; enabled?: boolean; phoneUrl?: string | null }
export interface Overview {
  version: string
  remote: boolean
  config: Config
  bridge: { available: boolean; reason: string; threads: number }
  supervisor: { bin: string | null; available: boolean }
  tunnel: TunnelInfo
  localUrl: string
  remoteUrl: string | null
  defaultMission: string | null
  missions: MissionSummary[]
}

const key = new URLSearchParams(location.search).get('key')
if (key) history.replaceState(null, '', location.pathname + location.hash)

function withKey(path: string) {
  if (!key) return path
  return path + (path.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(withKey(path), { credentials: 'same-origin', cache: 'no-store' })
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}

export async function post<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-tower-client': 'dashboard' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || res.statusText)
  return data
}

export function usePoll<T>(path: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [lastOk, setLastOk] = useState<number | null>(null)
  const pathRef = useRef(path)
  pathRef.current = path

  const refresh = useCallback(async () => {
    const p = pathRef.current
    if (!p) return
    try {
      const d = await get<T>(p)
      if (pathRef.current !== p) return
      setData(d)
      setError(null)
      setLastOk(Date.now())
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    }
  }, [])

  useEffect(() => {
    setData(null)
    if (!path) return
    refresh()
    let timer = setInterval(refresh, intervalMs)
    const onVis = () => {
      clearInterval(timer)
      if (document.visibilityState === 'visible') {
        refresh()
        timer = setInterval(refresh, intervalMs)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [path, intervalMs, refresh])

  return { data, error, lastOk, refresh }
}

export function useHashRoute() {
  const read = () => /#\/m\/([a-z0-9-]+)/i.exec(location.hash)?.[1] ?? null
  const [id, setId] = useState<string | null>(read)
  useEffect(() => {
    const on = () => setId(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((next: string) => {
    location.hash = `#/m/${next}`
  }, [])
  return [id, go] as const
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
