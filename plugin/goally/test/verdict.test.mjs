import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verdict } from '../src/daemon/views.mjs';

const proven = { id: 'CT-1', title: 'Ship it', status: 'done', proof: { ok: true }, notes: [] };
const state = (over = {}) => ({ tasks: [proven], agents: {}, findings: [], messages: [], ...over });

test('open Goal Director findings warn but do not block GO', () => {
  const v = verdict(state({ findings: [{ id: 'F-1', status: 'open', severity: 'high', title: 'Scope drift' }] }));
  assert.equal(v.go, true);
  assert.deepEqual(v.blockers, []);
  assert.deepEqual(v.warnings, ['Goal Director: Scope drift']);
});

test('unanswered Goal Director messages do not block GO', () => {
  const v = verdict(state({ messages: [{ id: 'M-1', from: 'flight-director', status: 'delivered' }] }));
  assert.equal(v.go, true);
});

test('unanswered operator messages still block GO', () => {
  const v = verdict(state({ messages: [{ id: 'M-1', from: 'user', status: 'delivered' }] }));
  assert.equal(v.go, false);
  assert.match(v.blockers[0], /operator message/);
});
