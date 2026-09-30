import fs from 'node:fs';
import path from 'node:path';
import { missionDir } from '../paths.mjs';

const MAX_TOOLS = 400;
const MAX_TIMELINE = 500;

function short(s, n = 140) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function push(list, item, max) {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

function runningCount(state) {
  return Object.values(state.agents).filter((a) => a.status === 'running').length;
}

function note(state, ev, kind, text, extra = {}) {
  push(state.timeline, { t: ev.t, seq: ev.seq, kind, text, ...extra }, MAX_TIMELINE);
}

function findTask(state, id) {
  return id ? state.tasks.find((t) => t.id === id) : undefined;
}

function recalcTaskFromAgents(state, task) {
  if (!task || task.status === 'done' || task.status === 'blocked') return;
  const agents = task.agentIds.map((id) => state.agents[id]).filter(Boolean);
  if (agents.some((a) => a.status === 'running')) task.status = 'running';
  else if (agents.length && agents.every((a) => a.status === 'error' || a.status === 'aborted')) task.status = 'failed';
  else if (agents.some((a) => a.status === 'completed')) task.status = 'review';
}

export function initialState(ev) {
  const m = ev.mission;
  return {
    id: m.id,
    title: m.title,
    goal: m.goal,
    workspace: m.workspace,
    conversationId: m.conversationId || null,
    threadId: null,
    status: 'active',
    startedAt: ev.t,
    endedAt: null,
    updatedAt: ev.t,
    tasks: [],
    agents: {},
    main: { status: 'working', lastActivityAt: ev.t, lastTool: null, toolCalls: 0, stops: 0 },
    tools: [],
    counters: {
      toolCalls: 0, testsPass: 0, testsFail: 0, targetedTests: 0, broadTests: 0,
      fullBuilds: 0, failures: 0, compactions: 0, commits: 0, deploys: 0, blocked: 0,
      interventions: 0, edits: 0,
    },
    files: {},
    collisions: [],
    findings: [],
    messages: [],
    supervisor: { runs: 0, lastRunAt: null, lastOk: null, lastError: null, sessionId: null, lastSeq: 0, costUsd: 0, running: false },
    timeline: [],
    parallel: [{ t: ev.t, n: 0 }],
    lastGreenTestAt: null,
    lastEditAt: null,
    lastSeq: ev.seq,
  };
}

function makeTask(t, i) {
  return {
    id: t.id || `CT-${i + 1}`,
    title: short(t.title, 120) || `Task ${i + 1}`,
    description: String(t.description || ''),
    acceptance: String(t.acceptance || ''),
    verify: String(t.verify || ''),
    depends: Array.isArray(t.depends) ? t.depends.map(String) : [],
    lane: t.lane ? String(t.lane) : '',
    status: 'todo',
    owner: null,
    agentIds: [],
    notes: [],
    evidence: [],
    proof: null,
    startedAt: null,
    doneAt: null,
    updatedAt: null,
  };
}

export function reduce(state, ev) {
  if (ev.type === 'mission.start') {
    state = initialState(ev);
    ev.tasks?.forEach((t, i) => state.tasks.push(makeTask(t, i)));
    note(state, ev, 'mission', `Mission start · ${state.tasks.length} tasks`, { level: 'info' });
    return state;
  }
  if (!state) return state;
  state.updatedAt = ev.t;
  state.lastSeq = ev.seq;
  const agentLabel = (id) => (id === 'main' ? 'MAIN' : /^CT-\d+$/.test(id) ? id : state.agents[id]?.taskId || id?.slice(0, 8) || '?');

  switch (ev.type) {
    case 'mission.bind':
      state.conversationId = ev.conversationId;
      if (ev.transcriptPath) state.transcriptPath = ev.transcriptPath;
      note(state, ev, 'mission', `MAIN session bound · ${String(ev.conversationId).slice(0, 8)}`, { level: 'info' });
      break;
    case 'mission.thread':
      state.threadId = ev.threadId;
      break;
    case 'mission.rename':
      state.title = String(ev.title || '').trim().slice(0, 120) || state.title;
      break;
    case 'mission.status':
      state.status = ev.status;
      if (ev.status === 'complete' || ev.status === 'aborted') state.endedAt = ev.t;
      else state.endedAt = null;
      note(state, ev, 'mission', `Mission ${ev.status.toUpperCase()}`, { level: 'info' });
      break;
    case 'task.add': {
      const task = makeTask({ ...ev.task, id: ev.task.id || `CT-${state.tasks.length + 1}` }, state.tasks.length);
      state.tasks.push(task);
      note(state, ev, 'task', `${task.id} added · ${task.title}`, { taskId: task.id });
      break;
    }
    case 'task.update': {
      const task = findTask(state, ev.taskId);
      if (!task) break;
      if (ev.status) task.status = ev.status;
      if (ev.owner) task.owner = ev.owner;
      if (ev.note) task.notes.push({ t: ev.t, text: ev.note });
      if (ev.status === 'running' && !task.startedAt) task.startedAt = ev.t;
      task.updatedAt = ev.t;
      note(state, ev, 'task', `${task.id} → ${String(ev.status || 'note').toUpperCase()}${ev.note ? ` · ${short(ev.note, 90)}` : ''}`, { taskId: task.id });
      break;
    }
    case 'task.complete': {
      const task = findTask(state, ev.taskId);
      if (!task) break;
      task.evidence.push(...(ev.evidence || []).map((e) => ({ ...e, t: ev.t })));
      task.proof = { ok: ev.accepted, reason: ev.reason, at: ev.t };
      task.updatedAt = ev.t;
      if (ev.accepted) {
        task.status = 'done';
        task.doneAt = ev.t;
        note(state, ev, 'proof', `${task.id} GO · proof accepted`, { taskId: task.id, level: 'ok' });
      } else {
        if (task.status !== 'done') task.status = 'review';
        note(state, ev, 'proof', `${task.id} NO-GO · ${short(ev.reason, 100)}`, { taskId: task.id, level: 'warn' });
      }
      break;
    }
    case 'agent.start': {
      const a = {
        id: ev.agentId,
        type: ev.subagentType || 'generalPurpose',
        task: String(ev.task || ''),
        taskId: ev.taskId || null,
        model: ev.model || '',
        parallel: Boolean(ev.parallel),
        branch: ev.branch || '',
        status: 'running',
        startedAt: ev.t,
        endedAt: null,
        durationMs: null,
        messageCount: 0,
        toolCallCount: 0,
        liveToolCalls: 0,
        modifiedFiles: [],
        summary: '',
        lastActivityAt: ev.t,
        lastTool: null,
      };
      state.agents[a.id] = a;
      const task = findTask(state, a.taskId);
      if (task) {
        if (!task.agentIds.includes(a.id)) task.agentIds.push(a.id);
        task.owner = a.id;
        if (!task.startedAt) task.startedAt = ev.t;
        task.updatedAt = ev.t;
        recalcTaskFromAgents(state, task);
      }
      state.parallel.push({ t: ev.t, n: runningCount(state) });
      note(state, ev, 'agent', `${a.taskId || 'AGENT'} launched · ${short(a.task, 90)}`, { taskId: a.taskId, agent: a.id });
      break;
    }
    case 'agent.stop': {
      const a = state.agents[ev.agentId];
      if (!a) break;
      a.status = ev.status || 'completed';
      a.endedAt = ev.t;
      a.durationMs = ev.durationMs ?? ev.t - a.startedAt;
      a.messageCount = ev.messageCount ?? a.messageCount;
      a.toolCallCount = ev.toolCallCount ?? a.toolCallCount;
      a.modifiedFiles = ev.modifiedFiles || a.modifiedFiles;
      a.summary = String(ev.summary || '');
      if (ev.transcript) a.transcript = ev.transcript;
      const task = findTask(state, a.taskId);
      if (task) task.updatedAt = ev.t;
      recalcTaskFromAgents(state, task);
      state.parallel.push({ t: ev.t, n: runningCount(state) });
      const level = a.status === 'completed' ? 'ok' : 'error';
      if (a.status !== 'completed') state.counters.failures += 1;
      note(state, ev, 'agent', `${a.taskId || 'AGENT'} ${a.status.toUpperCase()} · ${a.modifiedFiles.length} files · ${Math.round(a.durationMs / 1000)}s`, { taskId: a.taskId, agent: a.id, level });
      break;
    }
    case 'tool': {
      const c = state.counters;
      c.toolCalls += 1;
      const rec = {
        t: ev.t, agent: ev.agent, tool: ev.tool, kind: ev.kind, command: ev.command ? short(ev.command, 240) : null,
        exitCode: ev.exitCode ?? null, ok: ev.ok, targeted: Boolean(ev.targeted), full: Boolean(ev.full),
        durationMs: ev.durationMs ?? null, error: ev.error ? short(ev.error, 200) : null,
      };
      push(state.tools, rec, MAX_TOOLS);
      if (ev.agent === 'main') {
        state.main.toolCalls += 1;
        state.main.lastActivityAt = ev.t;
        state.main.lastTool = ev.tool;
        state.main.status = 'working';
      } else if (state.agents[ev.agent]) {
        const a = state.agents[ev.agent];
        a.liveToolCalls += 1;
        a.lastActivityAt = ev.t;
        a.lastTool = ev.tool;
      }
      if (!ev.ok) c.failures += 1;
      const who = agentLabel(ev.agent);
      if (ev.kind === 'test') {
        if (ev.ok) {
          c.testsPass += 1;
          state.lastGreenTestAt = ev.t;
        } else c.testsFail += 1;
        if (ev.targeted) c.targetedTests += 1;
        else c.broadTests += 1;
        note(state, ev, 'test', `${who} test ${ev.ok ? 'PASS' : 'FAIL'}${ev.targeted ? ' (targeted)' : ''} · ${short(ev.command, 80)}`, { agent: ev.agent, level: ev.ok ? 'ok' : 'error' });
      } else if (ev.kind === 'build' && ev.full) {
        c.fullBuilds += 1;
        note(state, ev, 'build', `${who} FULL BUILD · ${short(ev.command, 80)}`, { agent: ev.agent, level: 'warn' });
      } else if (ev.kind === 'git' && ev.ok) {
        c.commits += 1;
        note(state, ev, 'git', `${who} ${short(ev.command, 90)}`, { agent: ev.agent });
      } else if (ev.kind === 'deploy' && ev.ok) {
        c.deploys += 1;
        note(state, ev, 'deploy', `${who} deploy · ${short(ev.command, 80)}`, { agent: ev.agent });
      } else if (!ev.ok) {
        note(state, ev, 'error', `${who} ${ev.tool} failed · ${short(ev.error || ev.command, 90)}`, { agent: ev.agent, level: 'error' });
      }
      break;
    }
    case 'file.edit': {
      state.counters.edits += 1;
      state.lastEditAt = ev.t;
      const f = state.files[ev.path] || (state.files[ev.path] = { count: 0, agents: [], lastAt: null, lastAgent: null });
      f.count += 1;
      f.lastAt = ev.t;
      f.lastAgent = ev.agent;
      const owner = state.agents[ev.agent]?.taskId || ev.agent;
      if (!f.agents.includes(owner)) {
        f.agents.push(owner);
        if (f.agents.length > 1 && !state.collisions.some((x) => x.path === ev.path)) {
          state.collisions.push({ path: ev.path, agents: [...f.agents], t: ev.t });
          note(state, ev, 'collision', `File collision · ${path.basename(ev.path)} · ${f.agents.map(agentLabel).join(' × ')}`, { level: 'warn' });
        } else if (f.agents.length > 1) {
          const col = state.collisions.find((x) => x.path === ev.path);
          col.agents = [...f.agents];
        }
      }
      if (ev.agent === 'main') state.main.lastActivityAt = ev.t;
      else if (state.agents[ev.agent]) state.agents[ev.agent].lastActivityAt = ev.t;
      break;
    }
    case 'compact':
      state.counters.compactions += 1;
      note(state, ev, 'compact', `Context compaction · ${ev.usage ?? '?'}% used`, { level: 'warn' });
      break;
    case 'main.stop':
      state.main.stops += 1;
      state.main.status = 'idle';
      state.main.lastActivityAt = ev.t;
      note(state, ev, 'main', `MAIN turn ended (${ev.status})${ev.followup ? ' · auto-continue sent' : ''}`, { level: ev.followup ? 'warn' : 'info' });
      break;
    case 'main.prompt':
      state.main.status = 'working';
      state.main.lastActivityAt = ev.t;
      break;
    case 'blocked':
      state.counters.blocked += 1;
      note(state, ev, 'blocked', `BLOCKED ${ev.what} · ${short(ev.reason, 100)}`, { agent: ev.agent, level: 'warn' });
      break;
    case 'finding': {
      state.findings.push({ ...ev.finding, t: ev.t, status: 'open' });
      note(state, ev, 'finding', `GOAL DIRECTOR ${ev.finding.severity.toUpperCase()} · ${short(ev.finding.title, 100)}`, { taskId: ev.finding.taskId, level: ev.finding.severity === 'high' ? 'error' : 'warn' });
      break;
    }
    case 'finding.status': {
      const f = state.findings.find((x) => x.id === ev.id);
      if (f) f.status = ev.status;
      break;
    }
    case 'message': {
      state.messages.push({
        ...ev.message, t: ev.t, status: 'queued', via: null, attempts: 0,
        lastAttemptAt: null, deliveredAt: null, ackNote: null,
      });
      if (ev.message.from === 'flight-director') state.counters.interventions += 1;
      note(state, ev, 'message', `${ev.message.from === 'user' ? 'YOU' : 'GOAL DIRECTOR'} → MAIN · ${short(ev.message.text, 90)}`, { level: 'info' });
      break;
    }
    case 'message.status': {
      const m = state.messages.find((x) => x.id === ev.id);
      if (!m) break;
      if (ev.attempt) {
        m.attempts += 1;
        m.lastAttemptAt = ev.t;
      }
      if (ev.status) m.status = ev.status;
      if (ev.via) m.via = ev.via;
      if (ev.status === 'delivered' || ev.status === 'sent') m.deliveredAt = m.deliveredAt || ev.t;
      if (ev.note) m.ackNote = ev.note;
      if (['acked', 'rejected', 'resolved'].includes(ev.status)) {
        note(state, ev, 'ack', `MAIN ${ev.status.toUpperCase()} ${m.id}${ev.note ? ` · ${short(ev.note, 80)}` : ''}`, { level: ev.status === 'rejected' ? 'warn' : 'ok' });
      }
      break;
    }
    case 'supervisor.start':
      state.supervisor.running = true;
      break;
    case 'supervisor.run': {
      const s = state.supervisor;
      s.running = false;
      s.runs += 1;
      s.lastRunAt = ev.t;
      s.lastOk = ev.ok;
      s.lastError = ev.error || null;
      s.lastSeq = ev.coveredSeq ?? s.lastSeq;
      if (ev.sessionId) s.sessionId = ev.sessionId;
      if (ev.costUsd) s.costUsd += ev.costUsd;
      s.lastSummary = ev.summary || s.lastSummary || '';
      note(state, ev, 'supervisor', ev.ok ? `Goal Director check · ${ev.findings ?? 0} findings${ev.summary ? ` · ${short(ev.summary, 80)}` : ''}` : `Goal Director offline · ${short(ev.error, 90)}`, { level: ev.ok ? 'info' : 'error' });      break;
    }
    case 'supervisor.skip':
      state.supervisor.running = false;
      break;
    default:
      break;
  }
  return state;
}

export class Mission {
  constructor(id) {
    this.id = id;
    this.dir = missionDir(id);
    this.file = path.join(this.dir, 'events.jsonl');
    this.state = null;
    this.seq = 0;
    this.listeners = new Set();
  }

  static create(start) {
    const m = new Mission(start.mission.id);
    fs.mkdirSync(m.dir, { recursive: true, mode: 0o700 });
    m.append('mission.start', start);
    return m;
  }

  static load(id) {
    const m = new Mission(id);
    const raw = fs.readFileSync(m.file, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        m.seq = Math.max(m.seq, ev.seq || 0);
        m.state = reduce(m.state, ev);
      } catch {}
    }
    return m.state ? m : null;
  }

  append(type, data = {}) {
    const ev = { seq: ++this.seq, t: data.t || Date.now(), type, ...data };
    fs.appendFileSync(this.file, `${JSON.stringify(ev)}\n`, { mode: 0o600 });
    this.state = reduce(this.state, ev);
    for (const fn of this.listeners) {
      try {
        fn(ev, this);
      } catch {}
    }
    return ev;
  }

  readEvents() {
    return fs
      .readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}
