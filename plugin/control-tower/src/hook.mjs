import fs from 'node:fs';
import path from 'node:path';
import { readToken } from './config.mjs';
import { LOCAL_URL, paths, readJson } from './paths.mjs';
import { spawnDaemon } from './client.mjs';

const PERMISSION = new Set(['preToolUse', 'subagentStart', 'beforeShellExecution', 'beforeMCPExecution', 'beforeReadFile']);

function fallback(event) {
  if (PERMISSION.has(event)) return { permission: 'allow' };
  if (event === 'beforeSubmitPrompt') return { continue: true };
  return {};
}

function readStdin(timeoutMs = 1500) {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function hasLiveMission(payload, env) {
  const ws = payload.workspace_roots?.[0] || env.projectDir;
  const active = readJson(paths.active, { missions: [] });
  return active.missions.some((m) => ws && (ws === m.workspace || ws.startsWith(`${m.workspace}/`)));
}

export async function runHook(event) {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {}
  const env = { projectDir: process.env.CURSOR_PROJECT_DIR || '' };
  let out = fallback(event);
  try {
    const res = await fetch(`${LOCAL_URL}/api/hook/${event}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${readToken()}` },
      body: JSON.stringify({ payload, env }),
      signal: AbortSignal.timeout(event === 'stop' ? 2500 : 1200),
    });
    if (res.ok) out = await res.json();
  } catch {
    if (hasLiveMission(payload, env)) {
      try {
        fs.mkdirSync(path.dirname(paths.spool), { recursive: true });
        fs.appendFileSync(paths.spool, `${JSON.stringify({ event, payload, env, t: Date.now() })}\n`, { mode: 0o600 });
        spawnDaemon();
      } catch {}
    }
  }
  process.stdout.write(JSON.stringify(out));
}
