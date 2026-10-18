// Public documentation data only. No daemon, account, filesystem or stored missions.
import type { Agent, Config, Mission, Overview, Task, TaskStatus } from '../src/lib/api'

export const NOW = Date.UTC(2026, 0, 15, 12, 30)
const minute = 60_000
const startedAt = NOW - 8 * minute
const id = 'readme-csv-export'

const rows: { title: string; lane: string; status: TaskStatus; verify: string; depends?: string[] }[] = [
  { title: 'Create the CSV export endpoint', lane: 'backend', status: 'done', verify: 'npx vitest run src/api/export.test.ts' },
  { title: 'Escape commas, quotes and newlines', lane: 'backend', status: 'done', verify: 'npx vitest run src/lib/csv.test.ts' },
  { title: 'Cover empty results and Unicode', lane: 'qa', status: 'done', verify: 'npx vitest run src/lib/csv.test.ts' },
  { title: 'Add the export button to reports', lane: 'ui', status: 'running', verify: 'npx playwright test e2e/export.spec.ts' },
  { title: 'Keep active filters in the export', lane: 'backend', status: 'running', verify: 'npx vitest run src/api/filters.test.ts' },
  { title: 'Test the complete download flow', lane: 'qa', status: 'review', verify: 'npx playwright test e2e/export.spec.ts' },
  { title: 'Check keyboard and screen reader flow', lane: 'qa', status: 'todo', verify: 'npx playwright test e2e/accessibility.spec.ts', depends: ['CT-4', 'CT-6'] },
  { title: 'Verify download on the preview', lane: 'release', status: 'todo', verify: 'Preview download + observed check', depends: ['CT-4', 'CT-5', 'CT-6'] },
]

const tasks: Task[] = rows.map((row, index) => ({
  ...row, id: `CT-${index + 1}`, description: '', acceptance: 'The change works through the complete user flow.',
  depends: row.depends || [], owner: row.status === 'todo' ? null : `${row.lane}-agent`,
  agentIds: row.status === 'running' ? [`agent-${index + 1}`] : [], notes: [],
  evidence: row.status === 'done' ? [{ kind: 'test', ref: row.verify, t: NOW - minute }] : [],
  proof: row.status === 'done' ? { ok: true, reason: 'Observed check passed after the last edit', at: NOW - minute } : null,
  lastCheck: row.status === 'done' ? { t: NOW - minute, ok: true, command: row.verify, exitCode: 0, durationMs: 1800, by: `${row.lane}-agent` } : null,
  startedAt: row.status === 'todo' ? null : startedAt + minute,
  doneAt: row.status === 'done' ? NOW - minute : null,
  updatedAt: NOW - minute,
}))

const agents: Agent[] = tasks.filter((t) => t.status === 'running').map((task, index) => ({
  id: task.agentIds[0], type: 'generalPurpose', task: task.title, taskId: task.id,
  model: 'gpt-6.1-sol', parallel: true, status: 'running', startedAt: NOW - (index ? 102_000 : 138_000),
  endedAt: null, durationMs: null, messageCount: 8, toolCallCount: index ? 11 : 16, liveToolCalls: index ? 11 : 16,
  modifiedFiles: [], summary: '', lastActivityAt: NOW - 4000, lastTool: 'Read',
}))

export const config: Config = {
  maxParallelAgents: 4,
  supervisor: { provider: 'codex', enabled: true, intervalMin: 10, model: '', effort: 'high', triggerOnAgentStop: true, maxTurns: 24, timeoutSec: 600 },
  intervention: 'message',
  delivery: { bridge: 'auto', forceOnHigh: true, forceCooldownMin: 10, resendAfterMin: 5 },
  remote: { enabled: false, hostname: '' },
}

export const mission: Mission = {
  id, title: 'CSV export for reports', goal: 'Export the filtered reports as a CSV and verify the complete download flow.',
  workspace: '/demo/csv-export', conversationId: null, threadId: null,
  status: 'active', startedAt, endedAt: null, updatedAt: NOW,
  tasks, lanes: ['backend', 'ui', 'qa', 'release'], harness: 'codex', agents,
  eta: { minutes: 14, reason: 'Two implementation tasks and the final download verification remain.', at: NOW },
  main: { status: 'working', lastActivityAt: NOW - 2000, lastTool: 'Read', toolCalls: 28, stops: 0 },
  files: [], collisions: [],
  findings: [{
    id: 'F-1', kind: 'no-proof', severity: 'medium', taskId: 'CT-6',
    title: 'Download flow needs verification',
    detail: 'The UI and export endpoint passed separately. The filtered download has not been checked together.',
    action: 'Run the download flow with filters and attach the result before closing CT-6.',
    t: NOW - minute, status: 'open',
  }],
  messages: [{
    id: 'M-1', from: 'flight-director', severity: 'medium', taskId: 'CT-6', findingId: 'F-1',
    text: 'Run the download flow with filters and attach the result before closing CT-6.',
    t: NOW - minute, status: 'delivered', via: 'hook', attempts: 1, deliveredAt: NOW - 50_000,
  }],
  supervisor: { runs: 3, lastRunAt: NOW - minute, lastOk: true, lastError: null, costUsd: 0, running: false, lastSummary: 'Implementation is moving. Verify the filtered download before marking CT-6 done.' },
  timeline: [], tools: [], parallel: [{ t: startedAt, n: 0 }, { t: startedAt + minute, n: 2 }],
  verdict: {
    go: false, done: 3, total: tasks.length, coverage: 3 / tasks.length,
    stations: tasks.map((task) => ({ taskId: task.id, title: task.title, go: task.status === 'done', status: task.status, reason: task.status === 'done' ? 'Observed check passed' : 'Needs proof' })),
    blockers: ['Five tasks still need proof.'],
  },
  stats: {
    elapsedMs: NOW - startedAt, agentsTotal: 5, agentsRunning: 2, agentsFailed: 0, peakParallel: 3, avgAgentMs: 120_000,
    toolCalls: 55, subagentToolCalls: 27, filesTouched: 6, edits: 12, tests: 3, testsPass: 3, testsFail: 0,
    passRate: 1, targetedTests: 3, broadTests: 0, fullBuilds: 0, failures: 0, compactions: 0,
    commits: 1, deploys: 0, blocked: 0, collisions: 0, findings: 1, findingsByKind: { 'no-proof': 1 },
    interventions: 1, interventionsResolved: 0, supervisorRuns: 3, supervisorCostUsd: 0,
  },
  url: `#/m/${id}/board`,
}

export const overview: Overview = {
  version: '0.1.0', remote: false, config,
  bridge: { available: false, reason: 'Cursor hooks + MCP deliver on the next tool call.', threads: 0 },
  supervisor: {
    provider: 'codex', label: 'Codex', bin: '/demo/bin/codex', available: true, setup: 'Install Codex CLI, then run codex login.',
    providers: (['grok', 'claude', 'codex'] as const).map((provider) => ({
      provider, label: provider === 'grok' ? 'Grok Build' : provider === 'claude' ? 'Claude' : 'Codex',
      bin: `/demo/bin/${provider}`, available: true, setup: '',
    })),
  },
  tunnel: { status: 'off' }, localUrl: '', remoteUrl: null, defaultMission: id,
  missions: [{
    id, title: mission.title, workspace: mission.workspace, status: mission.status, startedAt,
    endedAt: null, updatedAt: NOW, done: 3, total: tasks.length, go: false,
    elapsedMs: NOW - startedAt, agentsTotal: 5, findings: 1, fullBuilds: 0,
  }],
}
