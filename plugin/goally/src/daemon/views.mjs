const OPEN_MSG = ['queued', 'sent', 'delivered'];

export function verdict(state) {
  const stations = state.tasks.map((t) => {
    let reason = '';
    let go = false;
    if (t.status === 'done' && t.proof?.ok) go = true;
    else if (t.status === 'blocked') reason = t.notes.filter((n) => n.text && (!n.kind || n.kind === 'blocker')).at(-1)?.text || 'Blocked';
    else if (t.status === 'failed') reason = 'Agent failed';
    else if (t.status === 'running') reason = t.owner ? `In progress · ${t.owner}` : 'In progress';
    else if (t.status === 'review') reason = t.proof && !t.proof.ok ? t.proof.reason : 'Finished, awaiting proof';
    else reason = 'Not started';
    return { taskId: t.id, title: t.title, go, status: t.status, reason };
  });
  const blockers = [];
  const running = Object.values(state.agents).filter((a) => a.status === 'running');
  if (running.length) blockers.push(`${running.length} agent(s) still running: ${running.map((a) => a.taskId || a.id.slice(0, 8)).join(', ')}`);
  for (const s of stations) if (!s.go && s.status !== 'running') blockers.push(`${s.taskId} ${s.title}: ${s.reason}`);
  if (state.lastEditAt && (!state.lastGreenTestAt || state.lastGreenTestAt < state.lastEditAt) && state.tasks.some((t) => t.status === 'done')) {
    blockers.push('Files changed after the last passing test. Re-run the targeted tests.');
  }
  const openHigh = state.findings.filter((f) => f.status === 'open' && f.severity === 'high');
  for (const f of openHigh) blockers.push(`Goal Director: ${f.title}`);
  const unacked = state.messages.filter((m) => OPEN_MSG.includes(m.status));
  if (unacked.length) blockers.push(`${unacked.length} message(s) not acknowledged by MAIN (goally_ack)`);
  const done = stations.filter((s) => s.go).length;
  return {
    go: stations.length > 0 && done === stations.length && blockers.length === 0,
    done,
    total: stations.length,
    coverage: stations.length ? done / stations.length : 0,
    stations,
    blockers,
  };
}

function sum(list, fn) {
  return list.reduce((n, x) => n + (fn(x) || 0), 0);
}

export function stats(state, now = Date.now()) {
  const agents = Object.values(state.agents);
  const finished = agents.filter((a) => a.endedAt);
  const c = state.counters;
  const tests = c.testsPass + c.testsFail;
  const findingsByKind = {};
  for (const f of state.findings) findingsByKind[f.kind] = (findingsByKind[f.kind] || 0) + 1;
  const fd = state.messages.filter((m) => m.from === 'flight-director');
  return {
    elapsedMs: (state.endedAt || now) - state.startedAt,
    agentsTotal: agents.length,
    agentsRunning: agents.filter((a) => a.status === 'running').length,
    agentsFailed: agents.filter((a) => a.status === 'error' || a.status === 'aborted').length,
    peakParallel: Math.max(0, ...state.parallel.map((p) => p.n)),
    avgAgentMs: finished.length ? Math.round(sum(finished, (a) => a.durationMs) / finished.length) : 0,
    toolCalls: c.toolCalls,
    subagentToolCalls: sum(agents, (a) => a.toolCallCount || a.liveToolCalls),
    filesTouched: Object.keys(state.files).length,
    edits: c.edits,
    tests,
    testsPass: c.testsPass,
    testsFail: c.testsFail,
    passRate: tests ? c.testsPass / tests : null,
    targetedTests: c.targetedTests,
    broadTests: c.broadTests,
    fullBuilds: c.fullBuilds,
    failures: c.failures,
    compactions: c.compactions,
    commits: c.commits,
    deploys: c.deploys,
    blocked: c.blocked,
    collisions: state.collisions.length,
    findings: state.findings.length,
    findingsByKind,
    interventions: fd.length,
    interventionsResolved: fd.filter((m) => m.status === 'resolved' || m.status === 'acked').length,
    supervisorRuns: state.supervisor.runs,
    supervisorCostUsd: Math.round(state.supervisor.costUsd * 10000) / 10000,
  };
}

export function publicState(mission, extra = {}) {
  const s = mission.state;
  return {
    ...s,
    tools: s.tools.slice(-150),
    timeline: s.timeline.slice(-200),
    agents: Object.values(s.agents),
    files: Object.entries(s.files)
      .map(([p, f]) => ({ path: p, ...f }))
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, 80),
    verdict: verdict(s),
    stats: stats(s),
    ...extra,
  };
}

export function missionSummary(mission) {
  const s = mission.state;
  const v = verdict(s);
  const st = stats(s);
  return {
    id: s.id,
    title: s.title,
    workspace: s.workspace,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    updatedAt: s.updatedAt,
    done: v.done,
    total: v.total,
    go: v.go,
    elapsedMs: st.elapsedMs,
    agentsTotal: st.agentsTotal,
    findings: st.findings,
    findingsByKind: st.findingsByKind,
    fullBuilds: st.fullBuilds,
    avgTaskMs: avgTaskMs(s),
  };
}

function avgTaskMs(s) {
  const done = s.tasks.filter((t) => t.doneAt && t.startedAt);
  return done.length ? Math.round(sum(done, (t) => t.doneAt - t.startedAt) / done.length) : 0;
}

function fmtMs(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export function statusText(mission, { url } = {}) {
  const s = mission.state;
  const v = verdict(s);
  const lines = [];
  lines.push(`MISSION ${s.id} · ${s.title} · ${s.status.toUpperCase()} · ${v.go ? 'GO' : 'NO-GO'} (${v.done}/${v.total} proven)`);
  if (url) lines.push(`Dashboard: ${url}`);
  lines.push('');
  lines.push('Tasks:');
  for (const t of s.tasks) {
    const st = v.stations.find((x) => x.taskId === t.id);
    lines.push(`- [${t.id}]${t.lane ? ` (${t.lane})` : ''} ${t.status.toUpperCase()}${st.go ? ' GO' : ''} · ${t.title}${t.owner ? ` · ${t.owner}` : ''}${st.go ? '' : ` · ${st.reason}`}`);
  }
  if (v.blockers.length) {
    lines.push('');
    lines.push('Blockers:');
    for (const b of v.blockers) lines.push(`- ${b}`);
  }
  const inbox = s.messages.filter((m) => OPEN_MSG.includes(m.status));
  if (inbox.length) {
    lines.push('');
    lines.push('Inbox (acknowledge each with goally_ack):');
    for (const m of inbox) lines.push(`- ${m.id} [${m.from}] ${m.severity ? `${m.severity.toUpperCase()} ` : ''}${m.text}`);
  }
  return lines.join('\n');
}

export function continuationBrief(mission, { url } = {}) {
  const s = mission.state;
  const v = verdict(s);
  const out = [];
  out.push(`# Continuation brief · ${s.title}`);
  out.push('');
  out.push(`Mission ${s.id} in ${s.workspace}. Running ${fmtMs(Date.now() - s.startedAt)}.${url ? ` Board: ${url}` : ''}`);
  out.push('');
  out.push('## Goal');
  out.push(s.goal);
  out.push('');
  out.push('## Proven (do not redo)');
  const proven = s.tasks.filter((t) => t.status === 'done' && t.proof?.ok);
  if (!proven.length) out.push('- nothing yet');
  for (const t of proven) out.push(`- [${t.id}] ${t.title} · evidence: ${t.evidence.map((e) => `${e.kind}:${e.ref}`).join(', ')}`);
  out.push('');
  out.push('## Remaining');
  for (const t of s.tasks.filter((x) => !(x.status === 'done' && x.proof?.ok))) {
    out.push(`- [${t.id}] ${t.status.toUpperCase()} · ${t.title}`);
    if (t.acceptance) out.push(`  - acceptance: ${t.acceptance}`);
    if (t.verify) out.push(`  - verify: ${t.verify}`);
    if (t.owner) out.push(`  - owner: ${t.owner}`);
    const last = t.notes.filter((n) => n.text && n.kind !== 'claim').at(-1);
    if (last) out.push(`  - last ${last.kind || 'note'}: ${last.text}`);
    const agents = t.agentIds.map((id) => s.agents[id]).filter(Boolean);
    const lastAgent = agents.at(-1);
    if (lastAgent?.summary) out.push(`  - last agent summary: ${lastAgent.summary.slice(0, 400)}`);
    if (lastAgent?.modifiedFiles?.length) out.push(`  - files: ${lastAgent.modifiedFiles.slice(0, 12).join(', ')}`);
  }
  const recentErrors = s.timeline.filter((e) => e.level === 'error').slice(-6);
  if (recentErrors.length) {
    out.push('');
    out.push('## Recent errors');
    for (const e of recentErrors) out.push(`- ${e.text}`);
  }
  const open = s.findings.filter((f) => f.status === 'open');
  if (open.length) {
    out.push('');
    out.push('## Open Goal Director findings');
    for (const f of open) out.push(`- ${f.severity.toUpperCase()} ${f.kind} · ${f.title} → ${f.action}`);
  }
  if (v.blockers.length) {
    out.push('');
    out.push('## Blockers to GO');
    for (const b of v.blockers) out.push(`- ${b}`);
  }
  out.push('');
  out.push('Continue with the remaining tasks only. Each one is claimed with goally_claim_task, proven with goally_check or an artifact, and closed with goally_complete_task.');
  return out.join('\n');
}
