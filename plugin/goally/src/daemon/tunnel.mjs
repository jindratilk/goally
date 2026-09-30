import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { LOCAL_URL, paths } from '../paths.mjs';

const CANDIDATES = ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', 'cloudflared'];
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function findCloudflared() {
  for (const c of CANDIDATES) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}

export class Tunnel {
  constructor({ getConfig, setConfig, log }) {
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this.log = log;
    this.child = null;
    this.state = { status: 'off', hostname: null, error: null, startedAt: null };
  }

  info() {
    const cfg = this.getConfig();
    const host = this.state.hostname;
    return {
      ...this.state,
      enabled: cfg.remote.enabled,
      phoneUrl: host && cfg.remote.readKey ? `https://${host}/?key=${cfg.remote.readKey}` : null,
    };
  }

  async start() {
    if (this.child) return this.info();
    const bin = findCloudflared();
    if (!bin) {
      this.state = { status: 'error', hostname: null, error: 'cloudflared not installed (brew install cloudflared)', startedAt: null };
      return this.info();
    }
    let cfg = this.getConfig();
    if (!cfg.remote.readKey) cfg = this.setConfig({ remote: { ...cfg.remote, readKey: crypto.randomBytes(18).toString('base64url') } });
    this.state = { status: 'starting', hostname: null, error: null, startedAt: Date.now() };
    const log = fs.openSync(`${paths.logs}/tunnel.log`, 'a');
    const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', LOCAL_URL], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    const onData = (d) => {
      fs.writeSync(log, d);
      const m = URL_RE.exec(String(d));
      if (m && this.state.status !== 'up') {
        const hostname = new URL(m[0]).hostname;
        this.state = { status: 'up', hostname, error: null, startedAt: this.state.startedAt };
        this.setConfig({ remote: { ...this.getConfig().remote, enabled: true, hostname } });
        this.log?.(`tunnel up · https://${hostname}`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      this.child = null;
      if (this.state.status !== 'off') this.state = { status: 'error', hostname: null, error: `cloudflared exited (${code})`, startedAt: null };
    });
    const until = Date.now() + 20000;
    while (Date.now() < until && this.state.status === 'starting') await new Promise((r) => setTimeout(r, 250));
    if (this.state.status === 'starting') this.state.error = 'Waiting for trycloudflare.com URL…';
    return this.info();
  }

  stop({ disable = true } = {}) {
    this.state = { status: 'off', hostname: null, error: null, startedAt: null };
    if (this.child) this.child.kill('SIGTERM');
    this.child = null;
    if (disable) this.setConfig({ remote: { ...this.getConfig().remote, enabled: false, hostname: '' } });
    return this.info();
  }

  rotateKey() {
    this.setConfig({ remote: { ...this.getConfig().remote, readKey: crypto.randomBytes(18).toString('base64url') } });
    return this.info();
  }
}
