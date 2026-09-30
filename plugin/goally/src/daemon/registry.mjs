import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { paths, writeJsonAtomic } from '../paths.mjs';
import { Mission } from './store.mjs';

const LIVE = ['active', 'paused'];

function normalize(p) {
  return p ? path.resolve(String(p)).replace(/\/+$/, '') : '';
}

const commonDirs = new Map();
function gitCommonDir(dir) {
  if (!commonDirs.has(dir)) {
    let v = null;
    try {
      v = fs.realpathSync(path.resolve(dir, execFileSync('git', ['-C', dir, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()));
    } catch {}
    commonDirs.set(dir, v);
  }
  return commonDirs.get(dir);
}

export function newMissionId(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `m-${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

export class Registry {
  constructor() {
    this.missions = new Map();
    this.listeners = new Set();
  }

  loadAll() {
    if (!fs.existsSync(paths.missions)) return;
    for (const id of fs.readdirSync(paths.missions)) {
      try {
        const m = Mission.load(id);
        if (m) this.attach(m);
      } catch {}
    }
    this.writeActive();
  }

  attach(m) {
    this.missions.set(m.id, m);
    m.listeners.add((ev, mission) => {
      for (const fn of this.listeners) fn(ev, mission);
    });
  }

  get(id) {
    return this.missions.get(id);
  }

  list() {
    return [...this.missions.values()].sort((a, b) => b.state.startedAt - a.state.startedAt);
  }

  live() {
    return this.list().filter((m) => LIVE.includes(m.state.status));
  }

  forWorkspace(workspace) {
    const ws = normalize(workspace);
    if (!ws) return undefined;
    const live = this.live();
    const byPath = live.find((m) => {
      const mw = normalize(m.state.workspace);
      return mw === ws || ws.startsWith(`${mw}/`) || mw.startsWith(`${ws}/`);
    });
    if (byPath) return byPath;
    // A subagent in a git worktree of the mission repo shares its common git dir.
    const repo = gitCommonDir(ws);
    return repo ? live.find((m) => gitCommonDir(m.state.workspace) === repo) : undefined;
  }

  forConversation(conversationId) {
    if (!conversationId) return undefined;
    return this.live().find((m) => m.state.conversationId === conversationId || m.state.agents[conversationId]);
  }

  resolve({ conversationId, workspace, missionId } = {}) {
    if (missionId) return this.get(missionId);
    return this.forConversation(conversationId) || this.forWorkspace(workspace);
  }

  create({ title, goal, workspace, tasks, conversationId, harness, lanes }) {
    for (const old of this.live()) {
      if (normalize(old.state.workspace) === normalize(workspace)) old.append('mission.status', { status: 'aborted', reason: 'superseded' });
    }
    const id = newMissionId();
    const m = Mission.create({
      mission: { id, title, goal, workspace: normalize(workspace), conversationId: conversationId || null, harness: harness || null },
      tasks,
      lanes,
    });
    this.attach(m);
    this.writeActive();
    return m;
  }

  writeActive() {
    const live = this.live().map((m) => ({ id: m.id, workspace: m.state.workspace, conversationId: m.state.conversationId }));
    try {
      writeJsonAtomic(paths.active, { updatedAt: Date.now(), missions: live });
    } catch {}
  }
}
