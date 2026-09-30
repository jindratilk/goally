import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { call, ensureDaemon } from './client.mjs';
import { loadConfig } from './config.mjs';
import { LOCAL_URL, PLUGIN_ROOT, paths, readJson } from './paths.mjs';

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

  const home = os.homedir();
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  const app = path.join(home, '.goally', 'app');
  const appJs = path.join(app, 'bin', 'goally.mjs');
  const inApp = real(PLUGIN_ROOT) === real(app);
  line(inApp ? true : 'warn', 'Runtime', inApp ? app : `${PLUGIN_ROOT} · not ${app}, re-run scripts/install.sh`);
  line(fs.existsSync(path.join(paths.dashboard, 'index.html')), 'Dashboard build', paths.dashboard);

  console.log(`\n${D}HARNESSES${X}`);
  const mcpLine = (args, missing) => {
    if (!args) return ['warn', 'MCP', missing];
    const target = args.find((a) => a.endsWith('goally.mjs'));
    if (!target) return [false, 'MCP', 'entry has no goally.mjs'];
    if (!fs.existsSync(target)) return [false, 'MCP', `missing ${target}`];
    return real(target) === real(appJs) ? [true, 'MCP', appJs] : ['warn', 'MCP', `points at ${target} · re-run scripts/install.sh`];
  };
  let wired = 0;
  const harness = (name, detected, checks) => {
    if (!detected) return info(name, 'not detected');
    const results = checks();
    if (results.every(([s]) => s === true)) wired++;
    for (const [state, label, detail] of results) line(state, `${name} ${label}`, detail);
  };
  const info = (label, detail) => console.log(`${D}N/A   ${label} · ${detail}${X}`);

  const cursorDir = path.join(home, '.cursor', 'plugins', 'local', 'goally');
  harness('Cursor', fs.existsSync(path.join(home, '.cursor')) || fs.existsSync('/Applications/Cursor.app'), () => {
    const manifest = fs.existsSync(path.join(cursorDir, '.cursor-plugin', 'plugin.json'));
    const skill = fs.existsSync(path.join(cursorDir, 'skills', 'goally', 'SKILL.md'));
    const out = [[manifest && skill ? true : 'warn', 'plugin + skill', manifest && skill ? cursorDir : 'not installed · run scripts/install.sh']];
    const mcp = readJson(path.join(cursorDir, 'mcp.json'), null)?.mcpServers?.goally;
    out.push(mcpLine(mcp?.args || (mcp ? [] : null), 'no mcp.json entry'));
    try {
      const hooks = JSON.parse(fs.readFileSync(path.join(cursorDir, 'hooks', 'hooks.json'), 'utf8')).hooks;
      const cmds = Object.values(hooks).flat().map((h) => h.command.split(' ')[0]);
      const missing = cmds.filter((c) => !fs.existsSync(c));
      out.push([missing.length === 0, 'hooks', `${Object.keys(hooks).length} events${missing.length ? ` · missing ${missing[0]}` : ''}`]);
    } catch {
      out.push(['warn', 'hooks', 'no hooks.json']);
    }
    return out;
  });

  const hasCli = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).status === 0;
  harness('Claude Code', hasCli('claude') || fs.existsSync(path.join(home, '.claude')), () => {
    const skillDir = path.join(home, '.claude', 'skills', 'goally');
    const skill = fs.existsSync(path.join(skillDir, 'SKILL.md'));
    const cfg = readJson(path.join(home, '.claude.json'), {});
    const mcp = cfg.mcpServers?.goally || cfg.projects?.[process.cwd()]?.mcpServers?.goally;
    return [
      [skill ? true : 'warn', 'skill', skill ? skillDir : 'missing · run scripts/install.sh'],
      mcpLine(mcp ? mcp.args || [] : null, 'not in ~/.claude.json · run scripts/install.sh'),
    ];
  });

  const codexDir = process.env.CODEX_HOME || path.join(home, '.codex');
  harness('Codex', hasCli('codex') || fs.existsSync(codexDir), () => {
    const skillDir = path.join(codexDir, 'skills', 'goally');
    const skill = fs.existsSync(path.join(skillDir, 'SKILL.md'));
    let toml = '';
    try {
      toml = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
    } catch {}
    const block = toml.split(/^(?=\[)/m).find((b) => /^\[mcp_servers\.goally\]\s*$/m.test(b.split('\n')[0]));
    const args = block ? [...block.matchAll(/"([^"]*goally\.mjs)"/g)].map((m) => m[1]) : null;
    return [
      [skill ? true : 'warn', 'skill', skill ? skillDir : 'missing · run scripts/install.sh'],
      mcpLine(args, `not in ${path.join(codexDir, 'config.toml')} · run scripts/install.sh`),
    ];
  });
  if (!wired) line(false, 'Harness', 'Goally is not fully wired into Cursor, Claude Code or Codex · run scripts/install.sh');
  console.log('');

  if (up) {
    try {
      const o = await call('GET', '/api/overview');
      line(o.supervisor.available ? true : 'warn', 'Grok Build CLI', o.supervisor.bin || 'install: curl -fsSL https://x.ai/cli/install.sh | bash');
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
    // A fresh Quick Tunnel answers 530 or fails DNS for ~10-20 s after the daemon (re)starts.
    let res;
    let err;
    let host = cfg.remote.hostname;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 5000));
      host = loadConfig().remote.hostname || host;
      try {
        res = await fetch(`https://${host}/api/overview`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
        err = null;
        if (res.status < 500) break;
      } catch (e) {
        res = null;
        err = e;
      }
    }
    if (res && res.status < 500) {
      const protectedByAccess = res.status === 302 || res.status === 401 || res.status === 403;
      line(protectedByAccess ? true : 'warn', 'Remote access', `${host} · HTTP ${res.status}${protectedByAccess ? ' · protected' : res.ok ? ' · NOT protected' : ''}`);
    } else {
      line('warn', 'Remote access', `${host} · ${res ? `HTTP ${res.status}` : err?.message} · phone access only; goally tunnel stop && goally tunnel start`);
    }
  } else {
    line('warn', 'Remote access', 'off · goally tunnel start (free Cloudflare Quick Tunnel)');
  }

  console.log(`\n${ok ? (holds ? `${Y}GO WITH ${holds} HOLD${holds > 1 ? "S" : ""}${X}` : `${G}ALL STATIONS GO${X}`) : `${R}NO-GO · fix the items above${X}`}\n`);
  return ok;
}
