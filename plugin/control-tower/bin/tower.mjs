#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { LOCAL_URL, paths, readJson } from '../src/paths.mjs';

const [cmd = 'help', ...rest] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case 'daemon': {
      const { startDaemon } = await import('../src/daemon/server.mjs');
      try {
        await startDaemon();
      } catch (e) {
        if (e.code === 'EADDRINUSE') {
          console.error(`Control Tower already running on ${LOCAL_URL}`);
          process.exit(0);
        }
        throw e;
      }
      return;
    }
    case 'hook': {
      const { runHook } = await import('../src/hook.mjs');
      await runHook(rest[0] || 'unknown');
      return;
    }
    case 'mcp': {
      const { runMcp } = await import('../src/mcp.mjs');
      await runMcp();
      return;
    }
    case 'start': {
      const { ensureDaemon } = await import('../src/client.mjs');
      const ok = await ensureDaemon();
      console.log(ok ? `Control Tower running · ${LOCAL_URL}` : 'Daemon failed to start. See ~/.control-tower/logs/daemon.log');
      process.exit(ok ? 0 : 1);
    }
    case 'stop': {
      const d = readJson(paths.daemon, null);
      if (!d) return console.log('Not running.');
      try {
        process.kill(d.pid, 'SIGTERM');
        console.log(`Stopped pid ${d.pid}.`);
      } catch {
        console.log('Not running.');
      }
      return;
    }
    case 'open': {
      const { ensureDaemon } = await import('../src/client.mjs');
      await ensureDaemon();
      spawn('open', [LOCAL_URL], { stdio: 'ignore', detached: true }).unref();
      console.log(LOCAL_URL);
      return;
    }
    case 'status': {
      const { call, ensureDaemon } = await import('../src/client.mjs');
      await ensureDaemon();
      const ws = rest[0] || process.cwd();
      try {
        console.log((await call('POST', '/api/rpc/status', { workspace: ws })).text);
      } catch (e) {
        console.log(e.message);
      }
      return;
    }
    case 'doctor': {
      const { doctor } = await import('../src/doctor.mjs');
      process.exit((await doctor()) ? 0 : 1);
    }
    case 'demo': {
      const { runDemo } = await import('../src/demo.mjs');
      await runDemo({ speed: Number(rest[0] || 1) });
      return;
    }
    case 'send': {
      const { call, ensureDaemon } = await import('../src/client.mjs');
      await ensureDaemon();
      const r = await call('POST', '/api/rpc/status', { workspace: process.cwd() });
      const res = await fetch(`${LOCAL_URL}/api/missions/${r.missionId}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tower-client': 'dashboard' },
        body: JSON.stringify({ text: rest.join(' ') }),
      });
      console.log(res.ok ? 'Queued for MAIN.' : await res.text());
      return;
    }
    case 'tunnel': {
      const action = rest[0] || 'start';
      if (!['start', 'stop', 'rotate', 'status'].includes(action)) {
        console.log('usage: tower tunnel [start|stop|rotate|status]');
        return;
      }
      const { ensureDaemon } = await import('../src/client.mjs');
      await ensureDaemon();
      const headers = { 'content-type': 'application/json', 'x-tower-client': 'dashboard' };
      const t =
        action === 'status'
          ? (await (await fetch(`${LOCAL_URL}/api/overview`)).json()).tunnel
          : await (await fetch(`${LOCAL_URL}/api/tunnel`, { method: 'POST', headers, body: JSON.stringify({ action }) })).json();
      if (t.status === 'up') {
        console.log(`Tunnel up · https://${t.hostname}`);
        console.log(`Phone link (read-only, keep private):\n  ${t.phoneUrl}`);
        try {
          const QR = (await import('qrcode')).default;
          console.log(await QR.toString(t.phoneUrl, { type: 'terminal', small: true }));
        } catch {}
      } else {
        console.log(`Tunnel ${t.status}${t.error ? ` · ${t.error}` : ''}`);
      }
      return;
    }
    case 'logs': {
      process.stdout.write(fs.existsSync(paths.daemonLog) ? fs.readFileSync(paths.daemonLog, 'utf8').split('\n').slice(-80).join('\n') : 'no logs\n');
      return;
    }
    default:
      console.log(`tower · Control Tower for Cursor agents

  tower start        start the daemon (${LOCAL_URL})
  tower open         open the board
  tower status [ws]  print mission status for a workspace
  tower send <text>  message the mission manager from the terminal
  tower doctor       check hooks, MCP, Grok, Desktop Bridge and tunnel
  tower demo [x]     simulate a mission on the board (x = speed multiplier)
  tower tunnel [cmd] phone access: start | stop | rotate | status (free Cloudflare Quick Tunnel)
  tower logs         daemon log tail
  tower stop         stop the daemon`);
  }
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exit(1);
});
