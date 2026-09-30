import crypto from 'node:crypto';
import fs from 'node:fs';
import { ensureHome, paths, readJson, writeJsonAtomic } from './paths.mjs';

export const DEFAULTS = {
  maxParallelAgents: 4,
  supervisor: {
    enabled: true,
    intervalMin: 10,
    model: '',
    effort: 'medium',
    triggerOnAgentStop: true,
    maxTurns: 12,
    timeoutSec: 300,
  },
  // observe: findings only on the board · message: also write into the manager chat
  intervention: 'message',
  delivery: {
    bridge: 'auto', // auto | off
    forceOnHigh: true,
    forceCooldownMin: 10,
    resendAfterMin: 5,
  },
  remote: {
    enabled: false,
    hostname: '',
    readKey: '',
  },
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(base, patch) {
  if (!isObject(base) || !isObject(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObject(v) && isObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

export function loadConfig() {
  ensureHome();
  return sanitizeConfig(deepMerge(DEFAULTS, readJson(paths.config, {})));
}

export function saveConfig(patch) {
  const next = sanitizeConfig(deepMerge(loadConfig(), patch));
  writeJsonAtomic(paths.config, next);
  return next;
}

function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeConfig(c) {
  const d = DEFAULTS;
  // Legacy stored value 'block' meant "message + deny"; map to message.
  let intervention = c.intervention;
  if (intervention === 'block') intervention = 'message';
  return {
    maxParallelAgents: clampInt(c.maxParallelAgents, 1, 32, d.maxParallelAgents),
    supervisor: {
      enabled: Boolean(c.supervisor?.enabled),
      intervalMin: clampInt(c.supervisor?.intervalMin, 1, 120, d.supervisor.intervalMin),
      model: String(c.supervisor?.model ?? '').slice(0, 80),
      effort: ['low', 'medium', 'high'].includes(c.supervisor?.effort) ? c.supervisor.effort : d.supervisor.effort,
      triggerOnAgentStop: Boolean(c.supervisor?.triggerOnAgentStop ?? true),
      maxTurns: clampInt(c.supervisor?.maxTurns, 1, 50, d.supervisor.maxTurns),
      timeoutSec: clampInt(c.supervisor?.timeoutSec, 30, 1800, d.supervisor.timeoutSec),
    },
    intervention: ['observe', 'message'].includes(intervention) ? intervention : d.intervention,
    delivery: {
      bridge: ['auto', 'off'].includes(c.delivery?.bridge) ? c.delivery.bridge : d.delivery.bridge,
      forceOnHigh: Boolean(c.delivery?.forceOnHigh ?? true),
      forceCooldownMin: clampInt(c.delivery?.forceCooldownMin, 0, 120, d.delivery.forceCooldownMin),
      resendAfterMin: clampInt(c.delivery?.resendAfterMin, 1, 120, d.delivery.resendAfterMin),
    },
    remote: {
      enabled: Boolean(c.remote?.enabled),
      hostname: String(c.remote?.hostname ?? '').slice(0, 200),
      readKey: String(c.remote?.readKey ?? ''),
    },
  };
}

export function ensureToken() {
  ensureHome();
  try {
    const t = fs.readFileSync(paths.token, 'utf8').trim();
    if (t.length >= 32) return t;
  } catch {}
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(paths.token, token, { mode: 0o600 });
  return token;
}

export function readToken() {
  try {
    return fs.readFileSync(paths.token, 'utf8').trim();
  } catch {
    return '';
  }
}
