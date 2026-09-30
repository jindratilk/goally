import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureToken, readToken } from './config.mjs';
import { LOCAL_URL, PLUGIN_ROOT, ensureHome, paths } from './paths.mjs';

export async function call(method, route, body, { timeoutMs = 3000 } = {}) {
  const token = readToken();
  const res = await fetch(`${LOCAL_URL}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function isDaemonUp(timeoutMs = 600) {
  try {
    const res = await fetch(`${LOCAL_URL}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export function spawnDaemon() {
  ensureHome();
  ensureToken();
  const out = fs.openSync(paths.daemonLog, 'a');
  const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'bin', 'goally.mjs'), 'daemon'], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, GOALLY_DETACHED: '1' },
  });
  child.unref();
  return child.pid;
}

export async function ensureDaemon({ waitMs = 5000 } = {}) {
  if (await isDaemonUp()) return true;
  spawnDaemon();
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 150));
    if (await isDaemonUp(400)) return true;
  }
  return false;
}
