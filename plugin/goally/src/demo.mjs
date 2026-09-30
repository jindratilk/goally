import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { call, ensureDaemon } from './client.mjs';
import { LOCAL_URL, paths } from './paths.mjs';

const MAIN = `demo-main-${crypto.randomBytes(3).toString('hex')}`;

/** A small mock of the reports page as a PNG, so the task panel has something to show. */
function writeDemoShot(file) {
  const W = 720, H = 400;
  const px = Buffer.alloc(W * H * 3, 0xf7);
  const rect = (x, y, w, h, [r, g, b]) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px.set([r, g, b], (j * W + i) * 3);
  };
  rect(0, 0, W, 44, [255, 255, 255]);
  rect(0, 44, W, 1, [222, 221, 215]);
  rect(24, 16, 120, 12, [38, 37, 30]);
  rect(24, 76, 200, 18, [38, 37, 30]);
  rect(548, 68, 148, 34, [38, 37, 30]);
  rect(566, 82, 112, 6, [247, 247, 244]);
  rect(24, 124, 672, 240, [255, 255, 255]);
  for (let r = 0; r < 6; r++) {
    rect(24, 124 + r * 40, 672, 1, [235, 234, 229]);
    rect(44, 140 + r * 40, 90 + ((r * 37) % 60), 8, [200, 199, 193]);
    rect(360, 140 + r * 40, 60, 8, [200, 199, 193]);
    rect(600, 140 + r * 40, 60, 8, r === 2 ? [31, 138, 101] : [200, 199, 193]);
  }
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

export async function runDemo({ speed = 1 } = {}) {
  if (!(await ensureDaemon())) throw new Error('daemon not running');
  const ws = path.join(paths.home, 'demo-workspace');
  fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
  const shot = path.join(ws, 'reports-export.png');
  writeDemoShot(shot);
  const sleep = (s) => new Promise((r) => setTimeout(r, (s * 1000) / Math.max(0.1, speed)));
  const base = { workspace_roots: [ws], cursor_version: 'demo', model: 'demo' };
  const hook = (event, payload) => call('POST', `/api/hook/${event}`, { payload: { ...base, ...payload } });
  const main = (event, payload = {}) => hook(event, { conversation_id: MAIN, ...payload });
  const shell = (conv, command, exitCode = 0, duration = 4000) =>
    hook(exitCode === 0 || exitCode === 1 ? 'postToolUse' : 'postToolUseFailure', {
      conversation_id: conv,
      tool_name: 'Shell',
      tool_input: { command },
      tool_output: JSON.stringify({ exitCode, stdout: exitCode ? 'FAIL 1 test' : 'ok' }),
      duration,
    });
  const edit = (conv, file) => hook('afterFileEdit', { conversation_id: conv, file_path: path.join(ws, file), edits: [] });
  const sub = (id, tag, task) =>
    hook('subagentStart', { conversation_id: MAIN, subagent_id: id, subagent_type: 'generalPurpose', task: `[${tag}] ${task}`, parent_conversation_id: MAIN, subagent_model: 'composer-2.5', is_parallel_worker: true });
  const stopSub = (id, tag, task, status, files, summary, ms) =>
    hook('subagentStop', { conversation_id: MAIN, subagent_id: id, subagent_type: 'generalPurpose', status, task: `[${tag}] ${task}`, description: task, summary, duration_ms: ms, message_count: 14, tool_call_count: 22, modified_files: files.map((f) => path.join(ws, f)), loop_count: 0 });

  const rpc = (method, body) => call('POST', `/api/rpc/${method}`, { missionId: id, ...body });
  const claim = (taskId, agent) => rpc('claimTask', { taskId, agent, takeover: true });
  const report = (taskId, agent, kind, text, attachments) => rpc('report', { taskId, agent, kind, text, attachments });
  const check = (taskId, agent, command, ok, durationMs, output = '') => rpc('recordCheck', { taskId, agent, command, ok, exitCode: ok ? 0 : 1, durationMs, output });
  let id;
  const r = await call('POST', '/api/rpc/startRun', {
    workspace: ws,
    harness: 'cursor',
    lanes: ['backend', 'ui', 'qa', 'release'],
    title: 'CSV export for reports',
    goal: 'Add CSV export to the reports page: backend endpoint, UI button, tests, and verify the real flow on the preview deploy. Do not touch billing. Done means a user can download a correct CSV on preview.',
    tasks: [
      { title: 'Export endpoint GET /api/reports/export', acceptance: 'Returns text/csv with header row and escaped fields', verify: 'npx vitest run src/api/export.test.ts', lane: 'backend' },
      { title: 'Export button on reports page', acceptance: 'Button downloads the file with the active filters', verify: 'npx playwright test e2e/export.spec.ts', lane: 'ui' },
      { title: 'CSV escaping edge cases', acceptance: 'Commas, quotes, newlines and unicode are escaped per RFC 4180', verify: 'npx vitest run src/lib/csv.test.ts', lane: 'qa' },
      { title: 'Verify real flow on preview', acceptance: 'Download works on the preview URL with a real account', verify: 'manual: preview URL + screenshot', depends: ['CT-1', 'CT-2', 'CT-3'], lane: 'release' },
    ],
  });
  id = r.missionId;
  console.log(`Demo mission ${id} · ${LOCAL_URL}/#/m/${id}`);

  await main('postToolUse', { tool_name: 'MCP:goally_start_run', tool_input: {}, tool_output: '{}' });
  await sleep(2);
  await sub('sa-api', 'CT-1', 'Build GET /api/reports/export returning text/csv');
  await claim('CT-1', 'api-agent');
  await sleep(1.2);
  await sub('sa-ui', 'CT-2', 'Add Export button to ReportsPage wired to the endpoint');
  await claim('CT-2', 'ui-agent');
  await sleep(1.2);
  await sub('sa-csv', 'CT-3', 'Harden CSV escaping: commas, quotes, newlines, unicode');
  await claim('CT-3', 'csv-agent');
  await sleep(2);
  await edit('sa-api', 'src/api/export.ts');
  await shell('sa-api', 'rg "reports" src/api');
  await sleep(1.5);
  await edit('sa-ui', 'src/ui/ExportButton.tsx');
  await edit('sa-csv', 'src/lib/csv.ts');
  await sleep(1.5);
  await shell('sa-csv', 'npm run build', 0, 94000);
  await sleep(1.5);
  await edit('sa-ui', 'src/api/export.ts');
  await report('CT-1', 'api-agent', 'decision', 'Streaming the rows with the existing query builder; no new dependency.');
  await shell('sa-api', 'npx vitest run src/api/export.test.ts', 0, 3200);
  await check('CT-1', 'api-agent', 'npx vitest run src/api/export.test.ts', true, 3200, '✓ src/api/export.test.ts (6 tests) 412ms\n\nTest Files  1 passed (1)\n     Tests  6 passed (6)');
  await sleep(2);
  await shell('sa-csv', 'npm run build', 0, 91000);
  await shell('sa-csv', 'npx vitest run', 1, 48000);
  await check('CT-3', 'csv-agent', 'npx vitest run', false, 48000, 'FAIL src/lib/csv/streaming-encoder.test.ts\n  × flushes partial rows\n\nTest Files  1 failed | 23 passed (24)');
  await sleep(2);
  await stopSub('sa-api', 'CT-1', 'Build GET /api/reports/export returning text/csv', 'completed', ['src/api/export.ts', 'src/api/export.test.ts'], 'Endpoint streams CSV with header row; 6 tests pass.', 41000);
  await sleep(1.5);
  await edit('sa-csv', 'src/lib/csv/streaming-encoder.ts');
  await edit('sa-csv', 'src/lib/csv/bom.ts');
  await sleep(1.5);
  await stopSub('sa-ui', 'CT-2', 'Add Export button to ReportsPage wired to the endpoint', 'completed', ['src/ui/ExportButton.tsx', 'src/api/export.ts'], 'Button added; also tweaked export.ts content-disposition.', 52000);
  await sleep(1.5);
  await call('POST', '/api/rpc/demoFinding', {
    missionId: id,
    finding: { kind: 'overengineering', severity: 'high', taskId: 'CT-3', title: 'CT-3 is building a streaming encoder and BOM handling nobody asked for, with two full builds', detail: 'src/lib/csv/streaming-encoder.ts and bom.ts are new; acceptance only needs RFC 4180 escaping. 2× npm run build (~3 min).', action: 'Stop CT-3 hardening, revert the streaming encoder, and prove escaping with npx vitest run src/lib/csv.test.ts only' },
  });
  await sleep(2);
  await stopSub('sa-csv', 'CT-3', 'Harden CSV escaping: commas, quotes, newlines, unicode', 'error', ['src/lib/csv.ts', 'src/lib/csv/streaming-encoder.ts', 'src/lib/csv/bom.ts'], 'Streaming encoder half done; suite failing.', 118000);
  await sleep(1.5);
  await main('postToolUse', { tool_name: 'Read', tool_input: { path: 'src/api/export.ts' }, tool_output: '{}' });
  await sleep(1.5);
  await call('POST', '/api/rpc/ack', { missionId: id, messageId: 'M-1', decision: 'accepted', note: 'Reverting streaming encoder, re-running CT-3 with the targeted test only' });
  await shell(MAIN, 'npx vitest run src/api/export.test.ts', 0, 2900);
  await call('POST', '/api/rpc/completeTask', { missionId: id, taskId: 'CT-1', agent: 'api-agent', summary: 'GET /api/reports/export streams text/csv with a header row; honours the active filters.', evidence: [{ kind: 'test', ref: 'npx vitest run src/api/export.test.ts' }] });
  await sleep(1.5);
  await call('POST', '/api/rpc/completeTask', { missionId: id, taskId: 'CT-2', evidence: [{ kind: 'note', ref: 'looks good' }] });
  await sleep(1.5);
  await main('stop', { status: 'completed', loop_count: 0 });
  await sleep(2);
  await sub('sa-csv2', 'CT-3', 'Revert streaming encoder; prove RFC 4180 escaping with the targeted test');
  await claim('CT-3', 'csv-agent-2');
  await report('CT-3', 'csv-agent-2', 'decision', 'Reverted streaming-encoder.ts and bom.ts per Goal Director; escaping stays in csv.ts.');
  await sleep(1.5);
  await edit('sa-csv2', 'src/lib/csv.ts');
  await shell('sa-csv2', 'npx vitest run src/lib/csv.test.ts', 0, 1800);
  await sleep(1.5);
  await stopSub('sa-csv2', 'CT-3', 'Revert streaming encoder; prove RFC 4180 escaping with the targeted test', 'completed', ['src/lib/csv.ts'], 'Reverted extras; 9 escaping tests pass.', 26000);
  await check('CT-3', 'csv-agent-2', 'npx vitest run src/lib/csv.test.ts', true, 1800, '✓ src/lib/csv.test.ts (9 tests) 88ms');
  await call('POST', '/api/rpc/completeTask', { missionId: id, taskId: 'CT-3', agent: 'csv-agent-2', summary: 'RFC 4180 escaping for commas, quotes, newlines and unicode; extras reverted.', evidence: [{ kind: 'test', ref: 'npx vitest run src/lib/csv.test.ts' }] });
  await call('POST', '/api/rpc/ack', { missionId: id, messageId: 'M-1', decision: 'resolved', note: 'CT-3 proven with targeted test' });
  await sleep(1.5);
  await report('CT-2', 'ui-agent', 'progress', 'Button placed next to the filters; downloads with the active filters.', [{ kind: 'screenshot', ref: shot, label: 'Reports page with Export' }]);
  await shell(MAIN, 'npx playwright test e2e/export.spec.ts', 0, 21000);
  await check('CT-2', 'ui-agent', 'npx playwright test e2e/export.spec.ts', true, 21000, '  ✓ export.spec.ts:4:1 › downloads CSV with filters (3.1s)\n\n  1 passed (21.0s)');
  await call('POST', '/api/rpc/completeTask', { missionId: id, taskId: 'CT-2', agent: 'ui-agent', evidence: [{ kind: 'test', ref: 'npx playwright test e2e/export.spec.ts' }, { kind: 'screenshot', ref: shot }] });
  await sleep(1);
  await sub('sa-prev', 'CT-4', 'Open preview deploy, download CSV as a real user, attach screenshot');
  await claim('CT-4', 'release-agent');
  await report('CT-4', 'release-agent', 'progress', 'Preview deploy is building; will download as the demo account next.');
  console.log('Demo running · CT-4 left in flight so the board stays live.');
}
