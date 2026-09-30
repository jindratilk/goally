import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { ensureToken, loadConfig, saveConfig } from '../config.mjs';
import { HOST, LOCAL_URL, PORT, ensureHome, paths, readJson, writeJsonAtomic } from '../paths.mjs';
import { Delivery } from './delivery.mjs';
import { HookHandler, defaultResponse } from './hooks.mjs';
import { redact } from './redact.mjs';
import { Registry } from './registry.mjs';
import { Supervisor } from './supervisor.mjs';
import { Tunnel } from './tunnel.mjs';
import { continuationBrief, missionSummary, publicState, statusText, verdict } from './views.mjs';

const VERSION = '0.1.0';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.otf': 'font/otf', '.ttf': 'font/ttf', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const TASK_STATUSES = ['todo', 'running', 'review', 'blocked', 'done', 'failed'];

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

const SHOT_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function isRemote(req) {
  const addr = req.socket.remoteAddress || '';
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  return !loopback || Boolean(req.headers['cf-connecting-ip'] || req.headers['cf-ray'] || req.headers['x-forwarded-for']);
}

function evaluateProof(state, task, evidence) {
  const kinds = new Set(evidence.map((e) => e.kind));
  const hardRef = evidence.some((e) => ['commit', 'url', 'deploy', 'screenshot'].includes(e.kind) && e.ref);
  const greenAfterEdit = state.lastGreenTestAt && (!state.lastEditAt || state.lastGreenTestAt >= state.lastEditAt);
  if (kinds.has('test')) {
    if (greenAfterEdit) return { accepted: true, reason: 'Passing test recorded after the last edit' };
    if (!state.lastGreenTestAt) return { accepted: false, reason: 'No passing test was observed by the hooks. Run the targeted test in the terminal, then complete again.' };
    return { accepted: false, reason: 'Files changed after the last passing test. Re-run the targeted test, then complete again.' };
  }
  if (hardRef) return { accepted: true, reason: 'Verifiable reference provided' };
  if (/manual|none/i.test(task.verify) && kinds.has('note')) return { accepted: true, reason: 'Manual verification per task' };
  return { accepted: false, reason: 'Evidence must include a passing test, a commit, a URL or a screenshot path.' };
}

export async function startDaemon() {
  ensureHome();
  const token = ensureToken();
  let config = loadConfig();
  const getConfig = () => config;
  const registry = new Registry();
  registry.loadAll();
  const delivery = new Delivery({ getConfig, log });
  const supervisor = new Supervisor({ registry, delivery, getConfig, log });
  const hooks = new HookHandler({ registry, delivery, supervisor, getConfig });

  registry.listeners.add((ev, mission) => {
    if (ev.type === 'message') delivery.flush(mission).catch(() => {});
  });

  const setConfig = (patch) => (config = saveConfig(patch));
  const tunnel = new Tunnel({ getConfig, setConfig, log });
  if (config.remote.enabled) tunnel.start().catch((e) => log('tunnel', e.message));

  ingestSpool(hooks);
  supervisor.start();
  const flushTimer = setInterval(() => {
    for (const m of registry.live()) delivery.flush(m).catch(() => {});
  }, 60000);
  flushTimer.unref();

  const remoteUrl = () => (tunnel.state.status === 'up' ? `https://${tunnel.state.hostname}` : null);
  const urlFor = (m) => `${LOCAL_URL}/#/m/${m.id}`;

  function missionFrom(body) {
    const m = registry.resolve({ missionId: body.missionId, workspace: body.workspace, conversationId: body.conversationId });
    if (!m) throw Object.assign(new Error('No live mission for this workspace. Start one with goally_start_run.'), { status: 404 });
    return m;
  }

  const rpc = {
    startRun(body) {
      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      if (!body.title || !body.goal || !tasks.length) throw Object.assign(new Error('title, goal and at least one task are required'), { status: 400 });
      if (!body.workspace) throw Object.assign(new Error('workspace is required'), { status: 400 });
      const m = registry.create({
        title: String(body.title).slice(0, 140),
        goal: redact(String(body.goal), 20000),
        workspace: body.workspace,
        conversationId: body.conversationId,
        tasks: tasks.slice(0, 60).map((t, i) => ({ ...t, id: `CT-${i + 1}` })),
      });
      return {
        missionId: m.id,
        url: urlFor(m),
        remoteUrl: remoteUrl() ? `${remoteUrl()}/#/m/${m.id}` : null,
        maxParallelAgents: config.maxParallelAgents,
        tasks: m.state.tasks.map((t) => ({ id: t.id, title: t.title, depends: t.depends })),
      };
    },
    addTask(body) {
      const m = missionFrom(body);
      m.append('task.add', { task: { title: body.title, description: body.description, acceptance: body.acceptance, verify: body.verify, depends: body.depends } });
      return { taskId: m.state.tasks.at(-1).id };
    },
    updateTask(body) {
      const m = missionFrom(body);
      const task = m.state.tasks.find((t) => t.id === String(body.taskId).toUpperCase());
      if (!task) throw Object.assign(new Error(`Unknown task ${body.taskId}`), { status: 404 });
      if (body.status && !TASK_STATUSES.includes(body.status)) throw Object.assign(new Error(`status must be one of ${TASK_STATUSES.join(', ')}`), { status: 400 });
      if (body.status === 'done') throw Object.assign(new Error('Use goally_complete_task with evidence to mark a task done.'), { status: 400 });
      m.append('task.update', { taskId: task.id, status: body.status, note: body.note ? redact(body.note, 2000) : undefined });
      return { ok: true, task: { id: task.id, status: task.status } };
    },
    completeTask(body) {
      const m = missionFrom(body);
      const task = m.state.tasks.find((t) => t.id === String(body.taskId).toUpperCase());
      if (!task) throw Object.assign(new Error(`Unknown task ${body.taskId}`), { status: 404 });
      const evidence = (Array.isArray(body.evidence) ? body.evidence : [])
        .slice(0, 20)
        .map((e) => ({ kind: String(e.kind || 'note'), ref: redact(String(e.ref || ''), 400), note: e.note ? redact(String(e.note), 600) : undefined }));
      const r = evaluateProof(m.state, task, evidence);
      m.append('task.complete', { taskId: task.id, evidence, ...r });
      const v = verdict(m.state);
      return { accepted: r.accepted, reason: r.reason, mission: { go: v.go, done: v.done, total: v.total } };
    },
    status(body) {
      const m = missionFrom(body);
      return { text: statusText(m, { url: urlFor(m) }), verdict: verdict(m.state), missionId: m.id, url: urlFor(m) };
    },
    resume(body) {
      const m = missionFrom(body);
      if (body.conversationId && body.conversationId !== m.state.conversationId) m.append('mission.bind', { conversationId: body.conversationId });
      return { text: continuationBrief(m, { url: urlFor(m) }), missionId: m.id, url: urlFor(m) };
    },
    ack(body) {
      const m = missionFrom(body);
      const msg = m.state.messages.find((x) => x.id === String(body.messageId).toUpperCase());
      if (!msg) throw Object.assign(new Error(`Unknown message ${body.messageId}`), { status: 404 });
      const map = { accepted: 'acked', rejected: 'rejected', resolved: 'resolved' };
      const status = map[body.decision];
      if (!status) throw Object.assign(new Error('decision must be accepted, rejected or resolved'), { status: 400 });
      m.append('message.status', { id: msg.id, status, note: body.note ? redact(String(body.note), 500) : undefined });
      if (msg.findingId && status === 'resolved') m.append('finding.status', { id: msg.findingId, status: 'resolved' });
      return { ok: true };
    },
    demoFinding(body) {
      const m = missionFrom(body);
      if (!m.state.workspace.includes('/.goally/demo-workspace')) throw Object.assign(new Error('demo only'), { status: 403 });
      supervisor.apply(m, { findings: [body.finding], resolved: [] }, config);
      m.append('supervisor.run', { ok: true, ms: 18400, findings: 1, summary: 'CT-3 drifted into unrequested hardening', coveredSeq: m.state.lastSeq });
      return { ok: true };
    },
    finish(body) {
      const m = missionFrom(body);
      const v = verdict(m.state);
      if (!v.go && !body.force) return { ok: false, go: false, blockers: v.blockers };
      m.append('mission.status', { status: body.force && !v.go ? 'aborted' : 'complete' });
      registry.writeActive();
      return { ok: true, go: v.go };
    },
  };

  function dashboardGuard(req) {
    if (isRemote(req)) throw Object.assign(new Error('Read-only over remote access'), { status: 403 });
    const origin = req.headers.origin;
    if (origin && !(origin === LOCAL_URL || origin === `http://localhost:${PORT}` || /^http:\/\/(localhost|127\.0\.0\.1):5177$/.test(origin))) throw Object.assign(new Error('Bad origin'), { status: 403 });
    if (req.headers['x-goally-client'] !== 'dashboard') throw Object.assign(new Error('Missing client header'), { status: 403 });
  }

  function remoteReadGuard(req, url) {
    if (!isRemote(req)) return;
    if (req.headers['cf-access-jwt-assertion']) return;
    const key = config.remote.readKey;
    const given = url.searchParams.get('key') || /(?:^|;\s*)goally_key=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    if (!key || !given || !safeEqual(key, given)) throw Object.assign(new Error('Private link key missing or rotated'), { status: 401 });
  }

  const shapes = readJson(path.join(paths.logs, 'hook-shapes.json'), {});
  function recordShape(event, payload) {
    const keys = Object.keys(payload).sort().join(',');
    if (shapes[event]?.keys === keys) return;
    shapes[event] = { keys, t: Date.now(), sample: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, typeof v === 'string' ? redact(v, 80) : Array.isArray(v) ? `[${v.length}]` : typeof v])) };
    writeJsonAtomic(path.join(paths.logs, 'hook-shapes.json'), shapes);
  }

  async function bridgeInfo() {
    const b = await delivery.bridgeStatus();
    return { available: b.available, reason: b.reason, threads: b.threads?.length ?? 0 };
  }

  async function handle(req, res) {
    const url = new URL(req.url, LOCAL_URL);
    const p = url.pathname;

    if (p === '/api/health') return send(res, 200, { ok: true, version: VERSION, pid: process.pid });

    if (p.startsWith('/api/hook/') || p.startsWith('/api/rpc/')) {
      if (isRemote(req)) return send(res, 403, { error: 'forbidden' });
      const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!safeEqual(auth, token)) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      if (p.startsWith('/api/hook/')) {
        const event = p.slice('/api/hook/'.length);
        recordShape(event, body.payload || {});
        try {
          return send(res, 200, hooks.handle(event, body.payload || {}, body.env || {}));
        } catch (e) {
          log('hook error', event, e.stack);
          return send(res, 200, defaultResponse(event));
        }
      }
      const method = p.slice('/api/rpc/'.length);
      if (!Object.hasOwn(rpc, method)) return send(res, 404, { error: `unknown method ${method}` });
      return send(res, 200, await rpc[method](body));
    }

    if (p.startsWith('/api/')) {
      remoteReadGuard(req, url);
      const remote = isRemote(req);
      if (req.method === 'GET' && p === '/api/missions') {
        return send(res, 200, { missions: registry.list().map(missionSummary), remote });
      }
      if (req.method === 'GET' && p === '/api/overview') {
        const live = registry.live()[0] || registry.list()[0];
        return send(res, 200, {
          version: VERSION,
          remote,
          config: remote ? { ...config, remote: { enabled: config.remote.enabled, hostname: config.remote.hostname } } : config,
          bridge: await bridgeInfo(),
          supervisor: supervisor.status(),
          tunnel: remote ? { status: tunnel.state.status } : tunnel.info(),
          localUrl: LOCAL_URL,
          remoteUrl: remoteUrl(),
          defaultMission: live?.id || null,
          missions: registry.list().map(missionSummary),
        });
      }
      const mm = /^\/api\/missions\/([a-z0-9-]+)(\/[a-z-]+)?(\/[A-Z0-9-]+)?$/i.exec(p);
      if (mm) {
        const m = registry.get(mm[1]);
        if (!m) return send(res, 404, { error: 'mission not found' });
        const sub = mm[2] || '';
        if (req.method === 'GET' && !sub) return send(res, 200, publicState(m, { url: urlFor(m) }));
        if (req.method === 'GET' && sub === '/brief') return send(res, 200, { text: continuationBrief(m, { url: urlFor(m) }) });
        if (req.method === 'GET' && sub === '/events') return send(res, 200, { events: m.readEvents() });
        if (req.method === 'GET' && sub === '/shot') {
          // Serves only image files the agent attached as screenshot evidence for this mission.
          const ref = url.searchParams.get('ref') || '';
          const known = m.state.tasks.some((t) => t.evidence.some((e) => e.kind === 'screenshot' && e.ref === ref));
          const mime = SHOT_MIME[path.extname(ref).toLowerCase()];
          const file = ref.startsWith('~/') ? path.join(os.homedir(), ref.slice(2)) : path.resolve(m.state.workspace || '/', ref);
          let size = 0;
          try {
            const st = fs.statSync(file);
            if (st.isFile()) size = st.size;
          } catch {}
          if (!known || !mime || !size || size > 15e6) return send(res, 404, { error: 'screenshot not found' });
          res.writeHead(200, { 'content-type': mime, 'content-length': size, 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
          fs.createReadStream(file).pipe(res);
          return;
        }
        if (req.method === 'POST') {
          dashboardGuard(req);
          const body = await readBody(req);
          if (sub === '/message') {
            const text = String(body.text || '').trim();
            if (!text) return send(res, 400, { error: 'text required' });
            m.append('message', { message: { id: `M-${m.state.messages.length + 1}`, from: 'user', severity: body.urgent ? 'high' : 'medium', text: redact(text, 4000) } });
            return send(res, 200, { ok: true });
          }
          if (sub === '/rename') {
            const title = redact(String(body.title || '').trim(), 120);
            if (!title) return send(res, 400, { error: 'title required' });
            m.append('mission.rename', { title });
            return send(res, 200, { ok: true });
          }
          if (sub === '/status') {
            if (!['active', 'paused', 'complete', 'aborted'].includes(body.status)) return send(res, 400, { error: 'bad status' });
            m.append('mission.status', { status: body.status });
            registry.writeActive();
            return send(res, 200, { ok: true });
          }
          if (sub === '/supervise') {
            supervisor.run(m, { force: true, reason: 'manual' }).catch(() => {});
            return send(res, 202, { ok: true });
          }
          if (sub === '/finding' && mm[3]) {
            if (!['dismissed', 'resolved', 'open'].includes(body.status)) return send(res, 400, { error: 'bad status' });
            m.append('finding.status', { id: mm[3], status: body.status });
            return send(res, 200, { ok: true });
          }
          if (sub === '/deliver') {
            delivery.cache.at = 0;
            await delivery.flush(m);
            return send(res, 200, { ok: true, bridge: await bridgeInfo() });
          }
        }
        return send(res, 405, { error: 'method not allowed' });
      }
      if (p === '/api/tunnel' && req.method === 'POST') {
        dashboardGuard(req);
        const body = await readBody(req);
        if (body.action === 'start') return send(res, 200, await tunnel.start());
        if (body.action === 'stop') return send(res, 200, tunnel.stop());
        if (body.action === 'rotate') return send(res, 200, tunnel.rotateKey());
        return send(res, 400, { error: 'action must be start, stop or rotate' });
      }
      if (p === '/api/settings' && req.method === 'POST') {
        dashboardGuard(req);
        const body = await readBody(req);
        const { remote: _ignored, ...rest } = body;
        config = saveConfig(rest);
        return send(res, 200, { config });
      }
      return send(res, 404, { error: 'not found' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
    if (isRemote(req)) {
      try {
        remoteReadGuard(req, url);
      } catch {
        return send(res, 401, 'Goally: open the private link or scan the QR code from Settings → Remote access on your Mac.');
      }
    }
    return serveStatic(res, p, isRemote(req) && url.searchParams.get('key') ? url.searchParams.get('key') : null);
  }

  function serveStatic(res, p, setKey) {
    const root = paths.dashboard;
    let file = path.normalize(path.join(root, decodeURIComponent(p)));
    if (!file.startsWith(root)) return send(res, 403, 'forbidden');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) return send(res, 200, 'Goally daemon is running. Dashboard build missing: run `npm run build` in dashboard/.');
    const ext = path.extname(file);
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    };
    if (setKey) headers['set-cookie'] = `goally_key=${encodeURIComponent(setKey)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!e.status) log('error', req.method, req.url, e.stack);
      send(res, e.status || 500, { error: e.message });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });
  writeJsonAtomic(paths.daemon, { pid: process.pid, port: PORT, startedAt: Date.now(), version: VERSION });
  log(`Goally daemon ${VERSION} on ${LOCAL_URL} (pid ${process.pid})`);

  const shutdown = () => {
    supervisor.stop();
    tunnel.stop({ disable: false });
    server.close();
    try {
      fs.unlinkSync(paths.daemon);
    } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return { server, registry, supervisor, delivery, hooks };
}

function ingestSpool(hooks) {
  let raw = '';
  try {
    raw = fs.readFileSync(paths.spool, 'utf8');
    fs.unlinkSync(paths.spool);
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const { event, payload, env } = JSON.parse(line);
      if (!['stop', 'beforeShellExecution'].includes(event)) hooks.handle(event, payload, env);
    } catch {}
  }
}
