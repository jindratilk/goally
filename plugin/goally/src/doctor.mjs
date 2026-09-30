import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { call, ensureDaemon } from './client.mjs';
import { loadConfig } from './config.mjs';
import { LOCAL_URL, PLUGIN_ROOT, paths } from './paths.mjs';

const G = '\x1b[32m';
const R = '\x1b[31m';
const Y = '\x1b[33m';
const D = '\x1b[2m';
const X = '\x1b[0m';

export async function doctor() {
  let ok = true;
  let holds = 0;
  const line = (state, label, detail = '') => {
    const mark = state === true ? `${G}GO   ${X}` : state === 'warn' ? `${Y}HOLD ${X}` : `${R}NO-GO${X}`;
    if (state === false) ok = false;
    if (state === "warn") holds++;
    console.log(`${mark} ${label}${detail ? ` ${D}· ${detail}${X}` : ''}`);
  };
  console.log(`\nGOALLY · PREFLIGHT POLL\n`);

  const major = Number(process.versions.node.split('.')[0]);
  line(major >= 20, 'Node.js', process.version);

  const up = await ensureDaemon();
  line(up, 'Daemon', up ? LOCAL_URL : `see ${paths.daemonLog}`);

  try {
    const mode = fs.statSync(paths.token).mode & 0o777;
    line(mode === 0o600, 'Local token', `mode ${mode.toString(8)}`);
  } catch {
    line(false, 'Local token', 'missing');
  }

  const installed = path.join(os.homedir(), '.cursor', 'plugins', 'local', 'goally');
  const manifest = path.join(installed, '.cursor-plugin', 'plugin.json');
  line(fs.existsSync(manifest) ? true : 'warn', 'Cursor plugin', fs.existsSync(manifest) ? installed : 'not installed · run scripts/install.sh');

  const hooksFile = path.join(fs.existsSync(manifest) ? installed : PLUGIN_ROOT, 'hooks', 'hooks.json');
  try {
    const hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf8')).hooks;
    const cmds = Object.values(hooks).flat().map((h) => h.command.split(' ')[0]);
    const missing = cmds.filter((c) => !fs.existsSync(c));
    line(missing.length === 0, 'Hooks', `${Object.keys(hooks).length} events${missing.length ? ` · missing ${missing[0]}` : ''}`);
  } catch (e) {
    line(false, 'Hooks', e.message);
  }

  line(fs.existsSync(path.join(paths.dashboard, 'index.html')), 'Dashboard build', paths.dashboard);

  if (up) {
    try {
      const o = await call('GET', '/api/overview');
      line(o.supervisor.available ? true : false, 'Grok Build CLI', o.supervisor.bin || 'install: curl -fsSL https://x.ai/cli/install.sh | bash');
      line(o.bridge.available ? true : 'warn', 'Desktop Bridge', o.bridge.reason);
    } catch (e) {
      line(false, 'Overview', e.message);
    }
  }

  const grokAuth = fs.existsSync(path.join(os.homedir(), '.grok', 'auth.json')) || Boolean(process.env.XAI_API_KEY);
  line(grokAuth ? true : 'warn', 'Grok sign-in', grokAuth ? 'session found' : 'run `grok login`');

  const cfg = loadConfig();
  const cf = spawnSync('cloudflared', ['--version'], { encoding: 'utf8' });
  line(cf.status === 0 ? true : 'warn', 'cloudflared', cf.status === 0 ? cf.stdout.trim().split('\n')[0] : 'brew install cloudflared');
  if (cfg.remote.enabled && cfg.remote.hostname) {
    try {
      const res = await fetch(`https://${cfg.remote.hostname}/api/overview`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
      const protectedByAccess = res.status === 302 || res.status === 401 || res.status === 403;
      line(protectedByAccess ? true : res.ok ? 'warn' : false, 'Remote access', `${cfg.remote.hostname} · HTTP ${res.status}${protectedByAccess ? ' · protected' : res.ok ? ' · NOT protected' : ''}`);
    } catch (e) {
      line(false, 'Remote access', `${cfg.remote.hostname} · ${e.message}`);
    }
  } else {
    line('warn', 'Remote access', 'off · goally tunnel start (free Cloudflare Quick Tunnel)');
  }

  console.log(`\n${ok ? (holds ? `${Y}GO WITH ${holds} HOLD${holds > 1 ? "S" : ""}${X}` : `${G}ALL STATIONS GO${X}`) : `${R}NO-GO · fix the items above${X}`}\n`);
  return ok;
}
