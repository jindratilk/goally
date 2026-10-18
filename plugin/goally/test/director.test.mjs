import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { directorArgs, directorOutput, providerStatus } from '../src/daemon/providers.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goally-director-test-'));
process.env.GOALLY_HOME = home;
const { DEFAULTS, loadConfig, saveConfig } = await import('../src/config.mjs');
const { Mission } = await import('../src/daemon/store.mjs');
const { Supervisor } = await import('../src/daemon/supervisor.mjs');
after(() => fs.rmSync(home, { recursive: true, force: true }));

const verdict = JSON.stringify({ summary: 'On track', eta: { minutes: 12, reason: 'One task left' }, findings: [], resolved: [] });
const response = (provider, text = verdict, sessionId = 'review-session') => ({ code: 0, stderr: '', stdout: provider === 'codex'
  ? [JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } }), JSON.stringify({ type: 'turn.completed' })].join('\n')
  : JSON.stringify(provider === 'claude' ? { result: text, session_id: sessionId, total_cost_usd: 0.02 } : { text, sessionId, total_cost_usd: 0.01 }) });
const options = { prompt: 'Review only', workspace: home, model: '', effort: 'high', maxTurns: 10, sessionId: 'previous' };

test('legacy configuration keeps Grok; switching providers clears only the model', () => {
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ supervisor: { model: 'grok-model' } }));
  assert.equal(loadConfig().supervisor.provider, 'grok');
  const cfg = saveConfig({ supervisor: { provider: 'claude' } });
  assert.equal(cfg.supervisor.provider, 'claude');
  assert.equal(cfg.supervisor.model, '');
  assert.equal(cfg.supervisor.intervalMin, 10);
  assert.equal(saveConfig({ supervisor: { provider: 'codex', model: 'codex-model' } }).supervisor.model, 'codex-model');
  assert.equal(saveConfig({ supervisor: { provider: 'unknown' } }).supervisor.provider, 'grok');
});

for (const provider of ['grok', 'claude', 'codex']) {
  test(`${provider}: finds an executable override and normalizes its output`, () => {
    const key = `GOALLY_${provider.toUpperCase()}_BIN`;
    const previous = process.env[key];
    process.env[key] = process.execPath;
    try {
      assert.equal(providerStatus(provider).bin, process.execPath);
      assert.equal(directorOutput(provider, response(provider)).text, verdict);
      assert.throws(() => directorOutput(provider, { code: 1, stdout: '', stderr: 'Not signed in' }), /Not signed in/);
      assert.throws(() => directorOutput(provider, { code: null, stdout: '', stderr: '', timedOut: true }), /timed out/);
    } finally {
      if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    }
  });
}

test('provider arguments enforce read-only reviews and use provider-specific flags', () => {
  const claude = directorArgs('claude', options);
  assert.equal(claude[claude.indexOf('--tools') + 1], 'Read,Grep,Glob');
  assert.equal(claude[claude.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.ok(claude.includes('--strict-mcp-config'));
  assert.ok(claude.includes('--resume'));
  assert.ok(!claude.includes('--cwd'));
  const codex = directorArgs('codex', options);
  assert.equal(codex[0], 'exec');
  assert.equal(codex[codex.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(codex.includes('approval_policy="never"'));
  assert.ok(codex.includes('mcp_servers={}'));
  assert.ok(codex.includes('model_reasoning_effort="high"'));
  assert.ok(!codex.includes('--resume'));
  assert.ok(!codex.includes('--max-turns'));
  const grok = directorArgs('grok', options);
  assert.equal(grok[grok.indexOf('--tools') + 1], 'read_file,grep,list_dir');
  assert.ok(grok.includes('--cwd'));
});

test('CLI discovery skips a broken executable and finds the working PATH installation', () => {
  const previousPath = process.env.PATH;
  const previousOverride = process.env.GOALLY_GROK_BIN;
  const binDir = path.join(home, 'bin');
  fs.mkdirSync(binDir);
  const broken = path.join(binDir, 'broken');
  const working = path.join(binDir, 'grok');
  fs.writeFileSync(broken, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  fs.writeFileSync(working, '#!/bin/sh\necho test-cli\n', { mode: 0o700 });
  process.env.PATH = binDir;
  process.env.GOALLY_GROK_BIN = broken;
  try { assert.equal(providerStatus('grok').bin, working); }
  finally {
    process.env.PATH = previousPath;
    if (previousOverride === undefined) delete process.env.GOALLY_GROK_BIN; else process.env.GOALLY_GROK_BIN = previousOverride;
  }
});

test('Codex ignores intermediate commentary and recovered stream errors', () => {
  const result = response('codex');
  result.stdout = '{"type":"error","message":"Reconnecting"}\n{"type":"item.completed","item":{"type":"reasoning","text":"Not the result"}}\n' + result.stdout;
  assert.equal(directorOutput('codex', result).text, verdict);
  result.stdout += '\n{"type":"turn.failed","error":{"message":"Rate limit"}}';
  assert.throws(() => directorOutput('codex', result), /Rate limit/);
});

test('Claude error envelopes and Grok JSON preceded by diagnostics are handled', () => {
  assert.throws(() => directorOutput('claude', { code: 0, stderr: '', stdout: '{"is_error":true,"errors":["Turn limit reached"]}' }), /Turn limit/);
  const result = response('grok');
  result.stdout = 'Starting reviewer\n' + result.stdout;
  assert.equal(directorOutput('grok', result).text, verdict);
  assert.throws(() => directorOutput('grok', { code: 1, stdout: '', stderr: '{"http_status":402}' }), /credits or billing/);
});

test('switching providers/models isolates sessions and persists the resulting review', async () => {
  const mission = Mission.create({ mission: { id: 'switch-test', title: 'Review', goal: 'Review', workspace: home }, tasks: [] });
  let cfg = structuredClone(DEFAULTS);
  const director = new Supervisor({ getConfig: () => cfg, delivery: { flush: async () => {} } });
  const calls = [];
  director.exec = async (_bin, args) => { calls.push(args); return response(cfg.supervisor.provider); };
  for (const provider of ['grok', 'claude', 'codex']) process.env[`GOALLY_${provider.toUpperCase()}_BIN`] = process.execPath;
  try {
    assert.equal((await director.run(mission, { force: true })).ok, true);
    assert.equal((await director.run(mission, { force: true })).ok, true);
    assert.ok(calls.at(-1).includes('--resume'));
    cfg = { ...cfg, supervisor: { ...cfg.supervisor, provider: 'claude' } };
    assert.equal((await director.run(mission, { force: true })).ok, true);
    assert.ok(!calls.at(-1).includes('--resume'));
    cfg.supervisor.model = 'another-model';
    assert.equal((await director.run(mission, { force: true })).ok, true);
    assert.ok(!calls.at(-1).includes('--resume'));
    cfg.supervisor.provider = 'codex';
    assert.equal((await director.run(mission, { force: true })).ok, true);
    assert.equal(mission.state.supervisor.sessionId, null);
    assert.equal(Mission.load(mission.id).state.supervisor.provider, 'codex');
    assert.equal(mission.state.eta.minutes, 12);
    assert.equal(mission.state.supervisor.running, false);
    director.exec = async () => ({ code: 1, stderr: 'Authentication required', stdout: '' });
    assert.equal((await director.run(mission, { force: true })).ok, false);
    assert.equal(mission.state.supervisor.lastOk, false);
    assert.equal(director.running.size, 0);
  } finally {
    for (const provider of ['grok', 'claude', 'codex']) delete process.env[`GOALLY_${provider.toUpperCase()}_BIN`];
  }
});

test('CLI timeout releases the child process', async () => {
  const director = new Supervisor({});
  const result = await director.exec(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 50, home);
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
});
