import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = process.env.GOALLY_HOME || path.join(os.homedir(), '.goally');
export const PORT = Number(process.env.GOALLY_PORT || 4777);
export const HOST = '127.0.0.1';
export const LOCAL_URL = `http://${HOST}:${PORT}`;

export const paths = {
  home: HOME,
  config: path.join(HOME, 'config.json'),
  token: path.join(HOME, 'token'),
  daemon: path.join(HOME, 'daemon.json'),
  lock: path.join(HOME, 'daemon.lock'),
  missions: path.join(HOME, 'missions'),
  spool: path.join(HOME, 'spool.jsonl'),
  active: path.join(HOME, 'active.json'),
  logs: path.join(HOME, 'logs'),
  daemonLog: path.join(HOME, 'logs', 'daemon.log'),
  dashboard: path.join(PLUGIN_ROOT, 'dashboard'),
};

export function ensureHome() {
  for (const dir of [paths.home, paths.missions, paths.logs]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function missionDir(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`invalid mission id: ${id}`);
  return path.join(paths.missions, id);
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(file, value, mode = 0o600) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode });
  fs.renameSync(tmp, file);
}
