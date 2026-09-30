import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { missionDir, paths } from '../paths.mjs';
import { redact } from './redact.mjs';
import { stats, verdict } from './views.mjs';

const GROK_CANDIDATES = [
  process.env.GOALLY_GROK_BIN,
  path.join(os.homedir(), '.grok', 'bin', 'grok'),
  path.join(os.homedir(), '.local', 'bin', 'grok'),
  '/opt/homebrew/bin/grok',
  '/usr/local/bin/grok',
].filter(Boolean);

const KINDS = ['overengineering', 'stuck', 'full-build', 'off-scope', 'no-proof', 'integration', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];

const BRIEF_FILES = [path.join(paths.home, 'director.md'), fileURLToPath(new URL('../../director.md', import.meta.url))];

export function directorBrief() {
  for (const f of BRIEF_FILES) {
    try {
      return fs.readFileSync(f, 'utf8').trim();
    } catch {}
  }
  return 'You are the Goal Director, an independent reviewer of a coding-agent mission. Flag only what matters.';
}

function findGrok() {
  return GROK_CANDIDATES.find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`;
}

function gitContext(dir, since) {
  const git = (...args) => {
    try {
      return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 4e6, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  if (!git('rev-parse', '--is-inside-work-tree')) return null;
  const cap = (t, n) => t.split('\n').filter(Boolean).slice(0, n).join('\n');
  return {
    log: cap(git('log', '--oneline', `--since=@${Math.floor(since / 1000)}`), 30),
    status: cap(git('status', '--short'), 60),
    diff: cap(git('diff', '--stat', 'HEAD').split('\n').slice(-40).join('\n'), 40),
  };
}

export function buildPrompt(mission, { reason = 'interval', git = null } = {}) {
  const s = mission.state;
  const now = Date.now();
  const v = verdict(s);
  const st = stats(s, now);
  const lastRun = s.supervisor.lastRunAt;
  const L = [];
  L.push(directorBrief());
  L.push('');
  L.push(`# Mission ${s.id}: ${s.title}`);
  L.push(`Harness ${s.harness || 'unknown'} · status ${s.status} · running ${ago(now - s.startedAt)} · ${v.done}/${v.total} proven · verdict ${v.go ? 'GO' : 'NO-GO'}`);
  if (reason === 'kickoff') L.push('This is the kickoff check: the plan was just registered. Judge the plan itself (does the task split cover the goal without extra scope, are the verify commands targeted) and give a first ETA.');
  else if (lastRun) {
    const doneSince = s.tasks.filter((t) => t.doneAt && t.doneAt > lastRun).map((t) => t.id);
    const reportsSince = s.tasks.reduce((n, t) => n + t.notes.filter((x) => x.t > lastRun).length, 0);
    L.push(`Since your last check ${ago(now - lastRun)} ago: ${doneSince.length ? `${doneSince.join(', ')} proven` : 'no task proven'}, ${reportsSince} task updates.`);
  }
  L.push('');
  L.push('## Goal (from the operator)');
  L.push(redact(s.goal, 4000));
  L.push('');
  L.push('## Tasks');
  for (const t of s.tasks) {
    L.push(`- ${t.id} [${t.status}]${t.lane ? ` (${t.lane})` : ''} ${t.title}${t.owner ? ` · owner ${t.owner}` : ''}`);
    if (t.acceptance) L.push(`  acceptance: ${redact(t.acceptance, 400)}`);
    if (t.verify) L.push(`  verify: ${redact(t.verify, 300)}`);
    if (t.startedAt) L.push(`  started ${ago(now - t.startedAt)} ago${t.doneAt ? `, done after ${ago(t.doneAt - t.startedAt)}` : ''}`);
    if (t.proof) L.push(`  proof: ${t.proof.ok ? 'accepted' : `rejected (${t.proof.reason})`}`);
    for (const n of t.notes.filter((x) => x.text && x.kind !== 'claim').slice(-3)) L.push(`  ${n.kind || 'note'} ${ago(now - n.t)} ago${n.by ? ` by ${n.by}` : ''}: ${redact(n.text, 300)}${n.attachments?.length ? ` [${n.attachments.map((a) => `${a.kind}: ${a.ref}`).join(', ')}]` : ''}`);
    if (t.lastCheck) L.push(`  last check ${t.lastCheck.ok ? 'PASS' : 'FAIL'} ${ago(now - t.lastCheck.t)} ago (${ago(t.lastCheck.durationMs || 0)}): ${redact(t.lastCheck.command, 200)}`);
  }
  const hooks = s.counters.toolCalls > 0 || Object.keys(s.agents).length > 0 || s.counters.edits > 0;
  if (!hooks) {
    L.push('');
    L.push(`## Activity\nThis harness (${s.harness || 'unknown'}) sends no hooks, so tool calls, edits and agent runs are not recorded. Judge from the task reports and checks above, the git state below, and the files themselves.`);
  }
  if (hooks) {
  L.push('');
  L.push('## Agents');
  for (const a of Object.values(s.agents).slice(-20)) {
    L.push(`- ${a.taskId || '(untagged)'} ${a.type} [${a.status}] ${a.endedAt ? `ran ${ago(a.durationMs || 0)}` : `running ${ago(now - a.startedAt)}, last activity ${ago(now - a.lastActivityAt)} ago`} · tools ${a.toolCallCount || a.liveToolCalls} · files ${a.modifiedFiles.length}`);
    L.push(`  task: ${redact(a.task, 300)}`);
    if (a.summary) L.push(`  summary: ${redact(a.summary, 500)}`);
    if (a.transcript) L.push(`  transcript: ${a.transcript}`);
  }
  L.push(`MANAGER: ${s.main.status}, last activity ${ago(now - s.main.lastActivityAt)} ago, ${s.main.toolCalls} tool calls${s.transcriptPath ? `, transcript: ${s.transcriptPath}` : ''}`);
  L.push('');
  L.push('## Stats');
  L.push(`tests pass/fail ${st.testsPass}/${st.testsFail} · targeted ${st.targetedTests} vs broad ${st.broadTests} · full builds ${st.fullBuilds} · failures ${st.failures} · compactions ${st.compactions} · file collisions ${st.collisions} · edits ${st.edits} across ${st.filesTouched} files`);
  L.push('');
  L.push('## Recent tool activity (oldest first)');
  for (const t of s.tools.filter((x) => x.kind !== 'read').slice(-45)) {
    L.push(`- ${ago(now - t.t)} ago ${t.agent === 'main' ? 'MANAGER' : s.agents[t.agent]?.taskId || 'sub'} ${t.tool}${t.command ? ` \`${t.command}\`` : ''} ${t.ok ? 'ok' : `FAILED${t.error ? ` (${t.error})` : ''}`}${t.full ? ' FULL-BUILD' : ''}${t.targeted ? ' targeted' : ''}`);
  }
  L.push('');
  L.push('## Most edited files');
  for (const [p, f] of Object.entries(s.files).sort((a, b) => b[1].count - a[1].count).slice(0, 15)) {
    L.push(`- ${p} · ${f.count} edits by ${f.agents.map((x) => (x === 'main' ? 'MANAGER' : s.agents[x]?.taskId || 'sub')).join(', ')}`);
  }
  }
  if (git) {
    L.push('');
    L.push('## Git since the mission started');
    L.push(git.log ? `Commits:\n${git.log}` : 'Commits: none');
    if (git.status) L.push(`Working tree:\n${git.status}`);
    if (git.diff) L.push(`Diff vs HEAD:\n${git.diff}`);
  }
  const open = s.findings.filter((f) => f.status === 'open');
  L.push('');
  L.push('## Your open findings from earlier checks');
  if (!open.length) L.push('- none');
  for (const f of open) {
    const msg = s.messages.find((m) => m.findingId === f.id);
    L.push(`- ${f.id} ${f.severity} ${f.kind}${f.taskId ? ` ${f.taskId}` : ''}: ${f.title}${msg ? ` · message ${msg.status}${msg.ackNote ? ` (manager: ${msg.ackNote})` : ''}` : ''}`);
  }
  L.push('');
  L.push('# Output');
  L.push('Reply with ONLY one JSON object, no prose, no code fence:');
  L.push('{"summary":"one sentence on mission health","eta":{"minutes":25,"reason":"why, from pace and what is left"},"findings":[{"kind":"overengineering|stuck|full-build|off-scope|no-proof|integration|other","severity":"low|medium|high","taskId":"CT-1 or null","title":"short headline","detail":"evidence you saw","action":"one imperative instruction for the manager"}],"resolved":["F-1"]}');
  L.push('eta.minutes is your estimate of wall-clock minutes until every task is proven. At most 3 new findings; an open finding only comes back if it got worse. "resolved" lists open finding ids that are no longer true.');
  return L.join('\n');
}

export function parseVerdict(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const findings = (Array.isArray(obj.findings) ? obj.findings : [])
      .slice(0, 3)
      .map((f) => ({
        kind: KINDS.includes(f.kind) ? f.kind : 'other',
        severity: SEVERITIES.includes(f.severity) ? f.severity : 'medium',
        taskId: typeof f.taskId === 'string' && /^CT-\d+$/i.test(f.taskId) ? f.taskId.toUpperCase() : null,
        title: String(f.title || '').slice(0, 160),
        detail: String(f.detail || '').slice(0, 800),
        action: String(f.action || '').slice(0, 400),
      }))
      .filter((f) => f.title);
    const minutes = Math.round(Number(obj.eta?.minutes));
    const eta = Number.isFinite(minutes) && minutes >= 0 && minutes < 10000 ? { minutes, reason: String(obj.eta?.reason || '').slice(0, 300) } : null;
    return { summary: String(obj.summary || '').slice(0, 300), eta, findings, resolved: Array.isArray(obj.resolved) ? obj.resolved.map(String) : [] };
  } catch {
    return null;
  }
}

export class Supervisor {
  constructor({ registry, delivery, getConfig, log }) {
    this.registry = registry;
    this.delivery = delivery;
    this.getConfig = getConfig;
    this.log = log;
    this.running = new Set();
    this.timers = new Map();
    this.interval = null;
  }

  status() {
    const bin = findGrok();
    return { bin: bin || null, available: Boolean(bin) };
  }

  start() {
    this.interval = setInterval(() => this.tick(), 30000);
    this.interval.unref?.();
  }

  stop() {
    clearInterval(this.interval);
  }

  tick() {
    const cfg = this.getConfig();
    if (!cfg.supervisor.enabled) return;
    for (const m of this.registry.live()) {
      if (m.state.status !== 'active') continue;
      const last = m.state.supervisor.lastRunAt || m.state.startedAt;
      if (Date.now() - last >= cfg.supervisor.intervalMin * 60000) this.run(m).catch((e) => this.log?.(`supervisor: ${e.message}`));
    }
  }

  kickoff(mission) {
    const cfg = this.getConfig();
    if (!cfg.supervisor.enabled) return;
    const t = setTimeout(() => {
      this.timers.delete(mission.id);
      this.run(mission, { force: true, reason: 'kickoff' }).catch((e) => this.log?.(`supervisor: ${e.message}`));
    }, 45000);
    t.unref?.();
    clearTimeout(this.timers.get(mission.id));
    this.timers.set(mission.id, t);
  }

  trigger(mission, reason) {
    const cfg = this.getConfig();
    if (!cfg.supervisor.enabled || !cfg.supervisor.triggerOnAgentStop) return;
    if (this.timers.has(mission.id)) return;
    const last = mission.state.supervisor.lastRunAt || 0;
    const wait = Math.max(20000, 120000 - (Date.now() - last));
    const t = setTimeout(() => {
      this.timers.delete(mission.id);
      this.run(mission, { reason }).catch((e) => this.log?.(`supervisor: ${e.message}`));
    }, wait);
    t.unref?.();
    this.timers.set(mission.id, t);
  }

  async run(mission, { force = false, reason = 'interval' } = {}) {
    if (this.running.has(mission.id)) return { skipped: 'already running' };
    const cfg = this.getConfig();
    const s = mission.state;
    if (!force && s.lastSeq - (s.supervisor.lastSeq || 0) < 3) {
      mission.append('supervisor.skip', { reason: 'no new activity' });
      return { skipped: 'no new activity' };
    }
    const bin = findGrok();
    this.running.add(mission.id);
    const coveredSeq = s.lastSeq;
    mission.append('supervisor.start', { reason });
    const started = Date.now();
    try {
      if (!bin) throw new Error('grok CLI not found. Install Grok Build: curl -fsSL https://x.ai/cli/install.sh | bash');
      const dir = path.join(missionDir(mission.id), 'supervisor');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const prompt = buildPrompt(mission, { reason, git: gitContext(s.workspace, s.startedAt) });
      const file = path.join(dir, `check-${String(s.supervisor.runs + 1).padStart(3, '0')}.md`);
      fs.writeFileSync(file, prompt, { mode: 0o600 });
      const args = [
        '-p', prompt,
        '--output-format', 'json',
        '--tools', 'read_file,grep,list_dir',
        '--disallowed-tools', 'Agent',
        '--max-turns', String(cfg.supervisor.maxTurns),
        '--cwd', s.workspace,
        '--no-auto-update',
      ];
      if (cfg.supervisor.model) args.push('-m', cfg.supervisor.model);
      if (cfg.supervisor.effort) args.push('--effort', cfg.supervisor.effort);
      if (s.supervisor.sessionId) args.push('--resume', s.supervisor.sessionId);
      const r = await this.exec(bin, args, cfg.supervisor.timeoutSec * 1000, s.workspace);
      fs.writeFileSync(file.replace(/\.md$/, '.out.json'), r.stdout || r.stderr || '', { mode: 0o600 });
      let out;
      try {
        const raw = r.stdout.trim();
        try {
          out = JSON.parse(raw);
        } catch {
          out = JSON.parse(raw.split('\n').filter(Boolean).at(-1));
        }
      } catch {
        throw new Error((r.stderr || r.stdout || `grok exited ${r.code}`).trim().split('\n').slice(-2).join(' ').slice(0, 240));
      }
      if (out.type === 'error' || (r.code !== 0 && !out.text)) throw new Error(String(out.message || `grok exited ${r.code}`).split('\n')[0]);
      const parsed = parseVerdict(out.text);
      if (!parsed) throw new Error('Goal Director reply was not valid JSON');
      this.apply(mission, parsed, cfg);
      mission.append('supervisor.run', {
        ok: true, ms: Date.now() - started, findings: parsed.findings.length, summary: parsed.summary, eta: parsed.eta, reason,
        sessionId: out.sessionId || s.supervisor.sessionId, costUsd: Number(out.total_cost_usd || 0), coveredSeq,
      });
      this.delivery.flush(mission).catch(() => {});
      return { ok: true, ...parsed };
    } catch (e) {
      mission.append('supervisor.run', { ok: false, ms: Date.now() - started, error: e.message, coveredSeq: s.supervisor.lastSeq });
      return { ok: false, error: e.message };
    } finally {
      this.running.delete(mission.id);
    }
  }

  apply(mission, parsed, cfg) {
    const s = mission.state;
    for (const id of parsed.resolved) {
      const f = s.findings.find((x) => x.id === id && x.status === 'open');
      if (f) mission.append('finding.status', { id, status: 'resolved' });
    }
    for (const f of parsed.findings) {
      const dup = s.findings.find((x) => x.status === 'open' && x.kind === f.kind && x.taskId === f.taskId);
      if (dup && SEVERITIES.indexOf(f.severity) <= SEVERITIES.indexOf(dup.severity)) continue;
      const id = `F-${s.findings.length + 1}`;
      mission.append('finding', { finding: { id, ...f } });
      if (cfg.intervention === 'observe' || f.severity === 'low') continue;
      mission.append('message', {
        message: {
          id: `M-${s.messages.length + 1}`,
          from: 'flight-director',
          severity: f.severity,
          taskId: f.taskId,
          findingId: id,
          text: `${f.title}. ${f.action}`,
        },
      });
    }
  }

  exec(bin, args, timeoutMs, cwd) {
    return new Promise((resolve) => {
      const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GROK_DISABLE_AUTOUPDATER: '1' } });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: e.message });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  }
}
