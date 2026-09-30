import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATE_CLIS = [
  process.env.GOALLY_CURSOR_CLI,
  '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
  path.join(os.homedir(), 'Applications/Cursor.app/Contents/Resources/app/bin/cursor'),
  '/usr/local/bin/cursor',
  '/opt/homebrew/bin/cursor',
].filter(Boolean);

const BRIDGE_DIR = path.join(os.homedir(), '.cursor', 'desktop-bridge');

function run(cmd, args, { input, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(e.message) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function formatMessage(m) {
  const head = [m.from === 'user' ? 'OPERATOR' : 'GOAL DIRECTOR', m.id, m.severity?.toUpperCase(), m.taskId].filter(Boolean).join(' · ');
  return `[${head}] ${m.text}\n\nAcknowledge with the MCP tool goally_ack (messageId "${m.id}", decision accepted | rejected | resolved, short note).`;
}

export class Delivery {
  constructor({ getConfig, log }) {
    this.getConfig = getConfig;
    this.log = log;
    this.cache = { at: 0, status: null };
    this.lastForceAt = 0;
    this.busy = new Set();
  }

  cli() {
    return CANDIDATE_CLIS.find((p) => {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  }

  async bridgeStatus({ fresh = false } = {}) {
    if (!fresh && this.cache.status && Date.now() - this.cache.at < 20000) return this.cache.status;
    const status = await this.probe();
    this.cache = { at: Date.now(), status };
    return status;
  }

  async probe() {
    if (this.getConfig().delivery.bridge === 'off') return { available: false, reason: 'Disabled in settings', threads: [] };
    const cli = this.cli();
    if (!cli) return { available: false, reason: 'Cursor CLI not found', threads: [] };
    if (!fs.existsSync(BRIDGE_DIR)) {
      return { available: false, reason: 'Desktop Bridge is off. Enable Settings → Beta → "Allow CLI to access desktop agents" and restart Cursor.', threads: [] };
    }
    const r = await run(cli, ['desktop', 'ls', '--json'], { timeoutMs: 6000 });
    if (r.code !== 0) return { available: false, reason: (r.stderr || r.stdout || 'desktop ls failed').trim().slice(0, 200), threads: [] };
    try {
      const parsed = JSON.parse(r.stdout);
      const threads = Array.isArray(parsed) ? parsed : parsed.threads || parsed.items || [];
      return { available: true, reason: 'Desktop Bridge connected', threads, cli };
    } catch {
      return { available: false, reason: 'Unexpected desktop ls output', threads: [] };
    }
  }

  async resolveThread(mission) {
    const st = await this.bridgeStatus();
    if (!st.available) return null;
    const conv = mission.state.conversationId;
    const threads = st.threads;
    const idOf = (t) => String(t.id ?? t.threadId ?? t.composerId ?? '');
    let t = conv && threads.find((x) => idOf(x) === conv || idOf(x).startsWith(conv) || conv.startsWith(idOf(x)));
    if (!t) t = threads.find((x) => String(x.title || '').toUpperCase().startsWith('MISSION'));
    if (!t) return null;
    const id = idOf(t);
    if (id && mission.state.threadId !== id) mission.append('mission.thread', { threadId: id });
    return id;
  }

  pending(mission, cfg) {
    const now = Date.now();
    const resendMs = cfg.delivery.resendAfterMin * 60000;
    return mission.state.messages.filter(
      (m) => m.status === 'queued' || (['sent', 'delivered'].includes(m.status) && m.attempts < 3 && m.lastAttemptAt && now - m.lastAttemptAt > resendMs),
    );
  }

  async flush(mission) {
    if (this.busy.has(mission.id)) return;
    this.busy.add(mission.id);
    try {
      const cfg = this.getConfig();
      const list = this.pending(mission, cfg);
      if (!list.length) return;
      const threadId = await this.resolveThread(mission);
      if (!threadId) return;
      const st = await this.bridgeStatus();
      for (const m of list) {
        const force =
          cfg.delivery.forceOnHigh && m.severity === 'high' && Date.now() - this.lastForceAt > cfg.delivery.forceCooldownMin * 60000;
        const args = ['desktop', 'send', ...(force ? ['--force'] : []), threadId];
        const r = await run(st.cli, args, { input: formatMessage(m), timeoutMs: 10000 });
        if (r.code === 0) {
          if (force) this.lastForceAt = Date.now();
          mission.append('message.status', { id: m.id, status: 'sent', via: force ? 'bridge-force' : 'bridge', attempt: true });
        } else {
          this.log?.(`bridge send failed: ${r.stderr || r.stdout}`);
          mission.append('message.status', { id: m.id, attempt: true, note: `bridge: ${(r.stderr || r.stdout).trim().slice(0, 120)}` });
          this.cache.at = 0;
          break;
        }
      }
    } finally {
      this.busy.delete(mission.id);
    }
  }

  nextForHook(mission, { all = false } = {}) {
    const cfg = this.getConfig();
    const list = this.pending(mission, cfg).filter((m) => m.status === 'queued' || m.via !== 'hook' || all);
    if (!list.length) return '';
    const pick = all ? list.slice(0, 3) : list.slice(0, 1);
    for (const m of pick) mission.append('message.status', { id: m.id, status: 'delivered', via: 'hook', attempt: true });
    return pick.map(formatMessage).join('\n\n');
  }
}
