// Fictional Fokly development scenario for public documentation only.
// No daemon, account, filesystem or stored missions are used.
import type { Agent, Config, Finding, Mission, MissionSummary, Overview, Task, TaskStatus, TimelineItem, ToolCall } from '../src/lib/api'

export const NOW = Date.UTC(2026, 0, 15, 12, 30)
const minute = 60_000
const startedAt = NOW - 26 * minute
const id = 'readme-fokly-onboarding'
const workspace = '/demo/fokly'

interface DemoTask {
  title: string
  lane: string
  status: TaskStatus
  check: string
  acceptance: string
  progress: string
  file: string
  depends?: number[]
}

const rows: DemoTask[] = [
  {
    title: 'Define the first-run state machine', lane: 'core', status: 'done', check: 'OnboardingStateTests',
    acceptance: 'Welcome, permissions, model setup and first session advance in order and resume from persisted state.',
    progress: 'Covered fresh install, partial setup and completed onboarding with deterministic state transitions.',
    file: 'Core/OnboardingState.swift',
  },
  {
    title: 'Build the welcome and privacy steps', lane: 'ui', status: 'done', check: 'WelcomeStepTests',
    acceptance: 'Explain local processing, required permissions and the model download before asking the user to continue.',
    progress: 'The welcome flow explains what stays on the Mac and why each permission is needed.',
    file: 'Views/Onboarding/WelcomeStep.swift',
  },
  {
    title: 'Request Screen Recording permission', lane: 'permissions', status: 'done', check: 'ScreenPermissionTests',
    acceptance: 'Open the correct System Settings pane and distinguish granted, denied and not-yet-requested access.',
    progress: 'The permission adapter reports current access without repeatedly presenting the system prompt.',
    file: 'Core/Permissions/ScreenRecordingAccess.swift',
  },
  {
    title: 'Request Accessibility permission', lane: 'permissions', status: 'done', check: 'AccessibilityPermissionTests',
    acceptance: 'Explain window return, request Accessibility access and continue only when the grant is observed.',
    progress: 'Added explicit permission states and a direct link to Accessibility settings.',
    file: 'Core/Permissions/AccessibilityAccess.swift',
  },
  {
    title: 'Persist completed onboarding steps', lane: 'core', status: 'done', check: 'OnboardingPersistenceTests',
    acceptance: 'A relaunch preserves completed steps while checking that required permissions still exist.',
    progress: 'Stored the setup checkpoint; a completed welcome step is no longer repeated on launch.',
    file: 'Core/OnboardingStore.swift',
  },
  {
    title: 'Resume after System Settings', lane: 'permissions', status: 'running', check: 'PermissionReturnTests',
    acceptance: 'Returning from System Settings refreshes both permission states and focuses the next available action.',
    progress: 'Refreshing grants when Fokly becomes active; checking the revoked-permission return path next.',
    file: 'Core/Permissions/PermissionMonitor.swift', depends: [3, 4],
  },
  {
    title: 'Show local model download progress', lane: 'models', status: 'running', check: 'ModelDownloadProgressTests',
    acceptance: 'Show downloaded bytes, total size and a clear preparing state before the first local inference.',
    progress: 'Byte progress and preparation states are connected to the downloader; verifying slow connections.',
    file: 'Views/Onboarding/ModelDownloadStep.swift', depends: [2],
  },
  {
    title: 'Hand off to the menu bar popover', lane: 'ui', status: 'running', check: 'MenuBarHandoffTests',
    acceptance: 'Finishing setup closes onboarding and opens the menu bar with the first-session form ready to use.',
    progress: 'The AppKit status item opens the existing SwiftUI popover and restores keyboard focus.',
    file: 'App/MenuBarController.swift', depends: [1, 5],
  },
  {
    title: 'Recover interrupted model downloads', lane: 'models', status: 'running', check: 'ModelDownloadRecoveryTests',
    acceptance: 'Cancel, connection loss and retry preserve valid partial data and never start two downloads.',
    progress: 'Retry now reuses the partial file. Adding a guard against duplicate download jobs.',
    file: 'Core/Models/ModelDownloader.swift', depends: [1],
  },
  {
    title: 'Verify first launch on a clean Mac', lane: 'qa', status: 'blocked', check: 'CleanInstallOnboardingTests',
    acceptance: 'A fresh install completes permissions, model setup and a first focus session without hidden setup state.',
    progress: 'Waiting for permission return and the menu bar handoff before the clean-install integration pass.',
    file: 'Tests/Onboarding/CleanInstallOnboardingTests.swift', depends: [6, 8, 9],
  },
  {
    title: 'Restore onboarding after relaunch', lane: 'core', status: 'review', check: 'OnboardingRelaunchTests',
    acceptance: 'Quitting in every setup step resumes at the correct screen without dropping saved progress.',
    progress: 'State restoration checks pass; the clean-install integration pass is still required.',
    file: 'Tests/Onboarding/OnboardingRelaunchTests.swift', depends: [5],
  },
  {
    title: 'Cover denied and revoked permissions', lane: 'qa', status: 'review', check: 'PermissionRecoveryTests',
    acceptance: 'Denied and later-revoked access show useful recovery instructions and never claim that setup is ready.',
    progress: 'Denial and revocation cases pass with injected permission states; checking real Settings return next.',
    file: 'Tests/Permissions/PermissionRecoveryTests.swift', depends: [3, 4],
  },
  {
    title: 'Add keyboard and VoiceOver flow', lane: 'accessibility', status: 'review', check: 'OnboardingAccessibilityTests',
    acceptance: 'Every step has a useful heading, logical tab order and named actions, including download retry.',
    progress: 'Labels and focus order are in place. The final end-to-end keyboard pass remains.',
    file: 'Views/Onboarding/OnboardingAccessibility.swift', depends: [2],
  },
  {
    title: 'Check onboarding in dark mode', lane: 'ui', status: 'review', check: 'OnboardingAppearanceTests',
    acceptance: 'Welcome, permission, download and error states use semantic colors in both appearances.',
    progress: 'All setup screens use the shared palette; checking error and preparing states before approval.',
    file: 'Views/Onboarding/OnboardingStyle.swift', depends: [2],
  },
  {
    title: 'Start the first focus session', lane: 'core', status: 'review', check: 'FirstSessionTests',
    acceptance: 'A goal and duration entered after onboarding start one session with the local model ready.',
    progress: 'Session creation passes with a prepared model. Full setup-to-session integration is pending.',
    file: 'Core/FocusSessionController.swift', depends: [1, 5],
  },
  {
    title: 'Verify offline first-run messaging', lane: 'qa', status: 'todo', check: 'OfflineSetupTests',
    acceptance: 'A Mac without a connection explains that the initial model download needs internet and offers retry.',
    progress: 'Check offline launch and the transition back to an available connection.',
    file: 'Tests/Onboarding/OfflineSetupTests.swift', depends: [7, 9],
  },
  {
    title: 'Test download cancel and retry', lane: 'qa', status: 'todo', check: 'DownloadRetryIntegrationTests',
    acceptance: 'Cancel, retry and relaunch do not corrupt partial data or duplicate an active model transfer.',
    progress: 'Exercise the complete recovery flow through the public setup controls.',
    file: 'Tests/Models/DownloadRetryIntegrationTests.swift', depends: [7, 9],
  },
  {
    title: 'Check menu bar-only launch', lane: 'qa', status: 'todo', check: 'MenuBarLaunchTests',
    acceptance: 'Relaunching after setup opens only the status item; the global shortcut reveals the session form.',
    progress: 'Verify the status item, shortcut and absence of a repeated onboarding window.',
    file: 'Tests/App/MenuBarLaunchTests.swift', depends: [8],
  },
  {
    title: 'Polish reduced-motion transitions', lane: 'ui', status: 'todo', check: 'ReducedMotionTests',
    acceptance: 'Step changes respect Reduce Motion and preserve the focused control when content updates.',
    progress: 'Review transitions after the accessibility and appearance passes.',
    file: 'Views/Onboarding/OnboardingTransitions.swift', depends: [13, 14],
  },
  {
    title: 'Run the final first-session check', lane: 'release', status: 'todo', check: 'FirstRunEndToEndTests',
    acceptance: 'From a clean launch, finish setup, start a focus session and return to the menu bar with passing proof.',
    progress: 'Attach observed evidence for the complete first-run flow before calling the goal done.',
    file: 'Tests/Onboarding/FirstRunEndToEndTests.swift', depends: [10, 15, 18],
  },
]

const liveDurations = [312_000, 276_000, 228_000, 138_000]
let liveIndex = 0
const tasks: Task[] = rows.map((row, index) => {
  const claimed = row.status !== 'todo' && row.status !== 'blocked'
  const checked = row.status === 'done' || row.status === 'review'
  const taskStartedAt = !claimed ? null : row.status === 'running' ? NOW - liveDurations[liveIndex++]
    : startedAt + (row.status === 'done' ? (index < 4 ? 2 : 9) : [10, 11, 12, 13, 19][index - 10]) * minute
  const checkedAt = NOW - (row.status === 'done' ? 17 - index : 7 - (index - 10)) * minute
  const verify = `swift test --filter ${row.check}`
  const owner = claimed ? `${row.lane}-agent` : null
  return {
    id: `CT-${index + 1}`, title: row.title, description: row.progress, acceptance: row.acceptance, verify,
    lane: row.lane, status: row.status, depends: (row.depends ?? []).map((n) => `CT-${n}`),
    owner, agentIds: claimed ? [`agent-${index + 1}`] : [],
    notes: [
      ...(claimed ? [{ t: taskStartedAt!, by: owner, kind: 'claim' as const, text: 'Claimed task' }] : []),
      { t: checked ? checkedAt - minute : NOW - minute, by: owner ?? 'main', kind: row.status === 'blocked' ? 'blocker' as const : 'progress' as const, text: row.progress },
      ...(checked ? [{ t: checkedAt, by: owner, kind: 'check' as const, text: verify, ok: true, exitCode: 0, durationMs: 2400 + index * 180, output: `${row.check}: all checks passed.` }] : []),
      ...(row.status === 'done' ? [{ t: checkedAt + 1000, by: 'main', kind: 'result' as const, text: 'Observed verification accepted after the last edit.', status: 'done' }] : []),
    ],
    evidence: row.status === 'done' ? [{ kind: 'test', ref: verify, t: checkedAt }] : [],
    proof: row.status === 'done' ? { ok: true, reason: 'Observed verification passed after the last edit', at: checkedAt + 1000 } : null,
    lastCheck: checked ? { t: checkedAt, ok: true, command: verify, exitCode: 0, durationMs: 2400 + index * 180, by: owner } : null,
    startedAt: taskStartedAt, doneAt: row.status === 'done' ? checkedAt + 1000 : null,
    updatedAt: checked ? checkedAt + 1000 : NOW - minute,
  }
})

const agents: Agent[] = tasks.filter((task) => task.agentIds.length).map((task) => {
  const running = task.status === 'running'
  const endedAt = running ? null : task.lastCheck!.t
  const index = tasks.indexOf(task)
  return {
    id: task.agentIds[0], type: 'generalPurpose', task: task.title, taskId: task.id,
    model: 'gpt-6.1-sol', parallel: true, status: running ? 'running' : 'completed',
    startedAt: task.startedAt!, endedAt, durationMs: endedAt ? endedAt - task.startedAt! : null,
    messageCount: 8 + index, toolCallCount: 12 + index, liveToolCalls: 12 + index,
    modifiedFiles: [`${workspace}/Fokly/${rows[index].file}`],
    summary: running ? rows[index].progress : task.status === 'done' ? 'Verified and accepted.' : 'Targeted checks passed; awaiting integration review.',
    lastActivityAt: running ? NOW - 4000 : endedAt!, lastTool: running ? 'Edit' : 'Bash',
  }
})

const findings: Finding[] = [
  {
    id: 'F-1', kind: 'overengineering', severity: 'low', taskId: 'CT-1', status: 'resolved', t: NOW - 18 * minute,
    title: 'Keep setup state in the existing store',
    detail: 'A separate workflow framework would duplicate the existing setup state.',
    action: 'Use a small state enum and the existing persistence adapter.',
  },
  {
    id: 'F-2', kind: 'no-proof', severity: 'medium', taskId: 'CT-10', status: 'open', t: NOW - 2 * minute,
    title: 'Verify the complete first-run handoff',
    detail: 'Individual permission checks pass, but the full path from System Settings to the first session still needs proof.',
    action: 'After CT-6 and CT-8, run the clean-install flow and attach observed results.',
  },
  {
    id: 'F-3', kind: 'integration', severity: 'medium', taskId: 'CT-9', status: 'open', t: NOW - minute,
    title: 'Prevent overlapping download retries',
    detail: 'Retry must reuse the current download job when the network reconnects.',
    action: 'Keep a single transfer owner and test cancel, retry and reconnect together.',
  },
]

const checks: ToolCall[] = tasks.filter((task) => task.lastCheck).map((task) => ({
  t: task.lastCheck!.t, agent: task.agentIds[0], tool: 'Bash', kind: 'test', command: task.verify,
  exitCode: 0, ok: true, targeted: true, full: false, durationMs: task.lastCheck!.durationMs,
}))
const tools: ToolCall[] = [
  { t: startedAt + minute, agent: 'main', tool: 'Bash', kind: 'read', command: 'rg --files Fokly Tests', exitCode: 0, ok: true, targeted: false, full: false, durationMs: 140 },
  ...checks,
  { t: NOW - 5 * minute, agent: 'main', tool: 'Bash', kind: 'test', command: 'swift test --filter ModelDownloadRecoveryTests', exitCode: 1, ok: false, targeted: true, full: false, durationMs: 2800, error: 'Retry created a second transfer after reconnect.' },
  { t: NOW - 2 * minute, agent: 'main', tool: 'Bash', kind: 'git', command: 'git diff --check', exitCode: 0, ok: true, targeted: false, full: false, durationMs: 90 },
  { t: NOW - 30_000, agent: 'agent-8', tool: 'Bash', kind: 'read', command: 'rg -n "showPopover|makeKey" Fokly/App', exitCode: 0, ok: true, targeted: false, full: false, durationMs: 110 },
].sort((a, b) => a.t - b.t)

const timeline: TimelineItem[] = [
  { t: startedAt, seq: 1, kind: 'mission', text: 'Started Fokly first-run onboarding: 20 tasks across seven lanes.' },
  { t: startedAt + minute, seq: 2, kind: 'main', text: 'Audited setup state, permission adapters and the menu bar entry point.' },
  { t: startedAt + 2 * minute, seq: 3, kind: 'agent', text: 'Launched the first four agents within the parallel limit.' },
  ...tasks.filter((task) => task.status === 'done').map((task, index) => ({
    t: task.doneAt!, seq: 4 + index, kind: 'proof', text: `${task.title}: observed check accepted.`, level: 'ok' as const, taskId: task.id,
  })),
  { t: NOW - 18 * minute, seq: 9, kind: 'finding', text: 'Goal Director: use the existing setup store instead of adding a workflow framework.', taskId: 'CT-1' },
  { t: NOW - 17 * minute, seq: 10, kind: 'ack', text: 'Manager accepted the simpler state enum; architecture finding resolved.', level: 'ok', taskId: 'CT-1' },
  { t: NOW - 12 * minute, seq: 11, kind: 'git', text: 'Checkpointed permission adapters and onboarding persistence.' },
  ...tasks.filter((task) => task.status === 'review').map((task, index) => ({
    t: task.lastCheck!.t, seq: 12 + index, kind: 'test', text: `${rows[tasks.indexOf(task)].check} passed; integration review remains.`, level: 'ok' as const, taskId: task.id,
  })),
  { t: NOW - 5 * minute, seq: 17, kind: 'test', text: 'Download recovery check caught a duplicate transfer on reconnect.', level: 'warn', taskId: 'CT-9' },
  { t: NOW - 3 * minute, seq: 18, kind: 'agent', text: 'Agents are working on permission return, model setup and the menu bar handoff.' },
  { t: NOW - 2 * minute, seq: 19, kind: 'finding', text: 'Goal Director requested clean-install proof for the complete setup flow.', level: 'warn', taskId: 'CT-10' },
  { t: NOW - 90_000, seq: 20, kind: 'blocked', text: 'Clean-install verification is waiting for the permission and handoff tasks.', level: 'warn', taskId: 'CT-10' },
  { t: NOW - minute, seq: 21, kind: 'message', text: 'Delivered retry ownership guidance to the manager.', taskId: 'CT-9' },
  { t: NOW - 30_000, seq: 22, kind: 'main', text: 'Reviewing keyboard focus after the menu bar popover opens.', taskId: 'CT-8' },
]
timeline.sort((a, b) => a.t - b.t).forEach((event, index) => { event.seq = index + 1 })

export const config: Config = {
  maxParallelAgents: 4,
  supervisor: { provider: 'codex', enabled: true, intervalMin: 10, model: '', effort: 'high', triggerOnAgentStop: true, maxTurns: 24, timeoutSec: 600 },
  intervention: 'message',
  delivery: { bridge: 'auto', forceOnHigh: true, forceCooldownMin: 10, resendAfterMin: 5 },
  remote: { enabled: false, hostname: '' },
}

const done = tasks.filter((task) => task.status === 'done').length
const tests = tools.filter((tool) => tool.kind === 'test')
const subagentToolCalls = agents.reduce((sum, agent) => sum + agent.toolCallCount, 0)
const parallelChanges = new Map<number, number>([[startedAt, 0]])
for (const agent of agents) {
  parallelChanges.set(agent.startedAt, (parallelChanges.get(agent.startedAt) ?? 0) + 1)
  if (agent.endedAt) parallelChanges.set(agent.endedAt, (parallelChanges.get(agent.endedAt) ?? 0) - 1)
}
let parallelCount = 0
const parallel = [...parallelChanges].sort(([a], [b]) => a - b).map(([t, delta]) => ({ t, n: parallelCount += delta }))

export const mission: Mission = {
  id, title: 'Fokly: onboarding',
  goal: 'Guide a fresh Fokly install through privacy, permissions and local model setup, then start the first focus session from the menu bar.',
  workspace, conversationId: null, threadId: null, status: 'active', startedAt, endedAt: null, updatedAt: NOW,
  tasks, lanes: [...new Set(rows.map((row) => row.lane))], harness: 'codex', agents,
  eta: { minutes: 22, reason: 'Permission return, model recovery and the final first-session checks remain.', at: NOW },
  main: { status: 'working', lastActivityAt: NOW - 2000, lastTool: 'Read', toolCalls: 38, stops: 0 },
  files: agents.flatMap((agent) => agent.modifiedFiles.map((path) => ({ path, count: 2, agents: [agent.id], lastAt: agent.lastActivityAt, lastAgent: agent.id }))),
  collisions: [], findings,
  messages: [
    { id: 'M-1', from: 'flight-director', severity: 'low', taskId: 'CT-1', findingId: 'F-1', text: 'Keep onboarding in the existing setup store. A state enum is enough.', t: NOW - 18 * minute, status: 'resolved', via: 'hook', attempts: 1, deliveredAt: NOW - 18 * minute + 5000, ackNote: 'Reused the existing store and removed the extra abstraction.' },
    { id: 'M-2', from: 'flight-director', severity: 'medium', taskId: 'CT-10', findingId: 'F-2', text: 'Run the clean-install flow after permission return and the menu bar handoff are ready.', t: NOW - 2 * minute, status: 'accepted', via: 'hook', attempts: 1, deliveredAt: NOW - 110_000, ackNote: 'CT-10 stays blocked until the integration prerequisites finish.' },
    { id: 'M-3', from: 'flight-director', severity: 'medium', taskId: 'CT-9', findingId: 'F-3', text: 'Keep one download owner across cancel, retry and reconnect. Verify the combined recovery path.', t: NOW - minute, status: 'delivered', via: 'hook', attempts: 1, deliveredAt: NOW - 50_000 },
  ],
  supervisor: { runs: 6, lastRunAt: NOW - minute, lastOk: true, lastError: null, costUsd: 0, running: false, lastSummary: 'Five tasks have accepted proof. Keep four agents on the remaining integration work; verify the full first-run flow before launch.' },
  timeline, tools,
  parallel,
  verdict: {
    go: false, done, total: tasks.length, coverage: done / tasks.length,
    stations: tasks.map((task) => ({ taskId: task.id, title: task.title, go: task.status === 'done', status: task.status, reason: task.proof?.reason ?? (task.status === 'blocked' ? 'Waiting for integration prerequisites' : 'Needs accepted proof') })),
    blockers: ['Clean-install verification is waiting for CT-6, CT-8 and CT-9.', 'The complete setup-to-session flow still needs observed proof.'],
  },
  stats: {
    elapsedMs: NOW - startedAt, agentsTotal: agents.length, agentsRunning: 4, agentsFailed: 0, peakParallel: 4,
    avgAgentMs: agents.reduce((sum, agent) => sum + (agent.durationMs ?? NOW - agent.startedAt), 0) / agents.length,
    toolCalls: subagentToolCalls + 38, subagentToolCalls, filesTouched: agents.length, edits: agents.length * 2,
    tests: tests.length, testsPass: tests.filter((test) => test.ok).length, testsFail: tests.filter((test) => !test.ok).length,
    passRate: tests.filter((test) => test.ok).length / tests.length, targetedTests: tests.length, broadTests: 0, fullBuilds: 0,
    failures: 1, compactions: 0, commits: 1, deploys: 0, blocked: 1, collisions: 0,
    findings: findings.length, findingsByKind: { overengineering: 1, 'no-proof': 1, integration: 1 },
    interventions: 3, interventionsResolved: 1, supervisorRuns: 6, supervisorCostUsd: 0,
  },
  url: `#/m/${id}/board`,
}

// These populate the real sidebar and History view, not Fokly's actual project history.
const otherGoals: { title: string; status: Mission['status']; done: number; total: number; minutes: number; agoMin: number; agents: number; findings: number; builds: number }[] = [
  { title: 'Menu bar controls', status: 'active', done: 7, total: 12, minutes: 38, agoMin: 0, agents: 11, findings: 2, builds: 0 },
  { title: 'Reminder handoff', status: 'active', done: 4, total: 9, minutes: 23, agoMin: 2, agents: 7, findings: 1, builds: 0 },
  { title: 'Model warmup', status: 'paused', done: 3, total: 8, minutes: 48, agoMin: 18, agents: 6, findings: 2, builds: 0 },
  { title: 'Permission fixes', status: 'complete', done: 6, total: 6, minutes: 34, agoMin: 120, agents: 7, findings: 1, builds: 0 },
  { title: 'VoiceOver labels', status: 'complete', done: 8, total: 8, minutes: 41, agoMin: 240, agents: 9, findings: 2, builds: 0 },
  { title: 'Session restore', status: 'complete', done: 9, total: 9, minutes: 57, agoMin: 1440, agents: 11, findings: 2, builds: 1 },
  { title: 'Focus history', status: 'complete', done: 7, total: 7, minutes: 46, agoMin: 2880, agents: 8, findings: 1, builds: 0 },
  { title: 'Launch at login', status: 'complete', done: 5, total: 5, minutes: 22, agoMin: 4320, agents: 5, findings: 0, builds: 0 },
  { title: 'Signed updates', status: 'complete', done: 6, total: 6, minutes: 53, agoMin: 5760, agents: 8, findings: 1, builds: 1 },
  { title: 'Window return', status: 'complete', done: 10, total: 10, minutes: 64, agoMin: 7200, agents: 12, findings: 3, builds: 1 },
  { title: 'Energy footprint', status: 'complete', done: 8, total: 8, minutes: 39, agoMin: 8640, agents: 9, findings: 1, builds: 0 },
]

const mainSummary: MissionSummary = {
  id, title: mission.title, workspace, status: mission.status, startedAt, endedAt: null, updatedAt: NOW,
  done, total: tasks.length, go: false, elapsedMs: NOW - startedAt,
  agentsTotal: agents.length, findings: findings.length, fullBuilds: 0,
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
  missions: [mainSummary, ...otherGoals.map((goal): MissionSummary => {
    const updatedAt = NOW - goal.agoMin * minute
    return {
      id: `readme-fokly-${goal.title.toLowerCase().replaceAll(' ', '-')}`, title: goal.title, workspace, status: goal.status,
      startedAt: updatedAt - goal.minutes * minute, endedAt: goal.status === 'complete' ? updatedAt : null,
      updatedAt, done: goal.done, total: goal.total, go: goal.status === 'complete', elapsedMs: goal.minutes * minute,
      agentsTotal: goal.agents, findings: goal.findings, fullBuilds: goal.builds,
    }
  })],
}
