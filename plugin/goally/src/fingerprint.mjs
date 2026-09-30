import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function stamp(file) {
  try {
    const st = fs.statSync(file);
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return 'gone';
  }
}

/**
 * Cheap identity of the files a check depends on. Equal fingerprints mean nothing was edited in between.
 * With `files`, only those paths count (so parallel agents editing elsewhere don't invalidate the proof);
 * without, HEAD plus every dirty file in the git tree. Returns null when neither is available.
 */
export function workspaceFingerprint(dir, files = []) {
  const h = crypto.createHash('sha1');
  if (files.length) {
    for (const f of [...new Set(files)].sort()) h.update(`\n${f}:${stamp(path.resolve(dir, f))}`);
    return `f:${h.digest('hex').slice(0, 16)}`;
  }
  try {
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 8e6, stdio: ['ignore', 'pipe', 'ignore'] });
    const root = git('rev-parse', '--show-toplevel').trim();
    let head = '';
    try {
      head = git('rev-parse', 'HEAD').trim();
    } catch {}
    h.update(head);
    const dirty = git('status', '--porcelain=v1', '-z', '-uall').split('\0').filter(Boolean).map((l) => l.slice(3)).sort();
    for (const rel of dirty.slice(0, 5000)) h.update(`\n${rel}:${stamp(path.join(root, rel))}`);
    return `g:${h.digest('hex').slice(0, 16)}`;
  } catch {
    return null;
  }
}
