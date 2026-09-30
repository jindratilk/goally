import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { call, ensureDaemon } from './client.mjs';
import { LOCAL_URL, paths } from './paths.mjs';

const MAIN = `demo-main-${crypto.randomBytes(3).toString('hex')}`;

export async function runDemo({ speed = 1 } = {}) {
  if (!(await ensureDaemon())) throw new Error('daemon not running');
  const ws = path.join(paths.home, 'demo-workspace');
  fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
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

  const r = await call('POST', '/api/rpc/startRun', {
    workspace: ws,
    title: 'CSV export for reports',
    goal: 'Add CSV export to the reports page: backend endpoint, UI button, tests, and verify the real flow on the preview deploy. Do not touch billing. Done means a user can download a correct CSV on preview.',
    tasks: [
      { title: 'Export endpoint GET /api/reports/export', acceptance: 'Returns text/csv with header row and escaped fields', verify: 'npx vitest run src/api/export.test.ts', lane: 'backend' },
      { title: 'Export button on reports page', acceptance: 'Button downloads the file with the active filters', verify: 'npx playwright test e2e/export.spec.ts', lane: 'ui' },
      { title: 'CSV escaping edge cases', acceptance: 'Commas, quotes, newlines and unicode are escaped per RFC 4180', verify: 'npx vitest run src/lib/csv.test.ts', lane: 'qa' },
      { title: 'Verify real flow on preview', acceptance: 'Download works on the preview URL with a real account', verify: 'manual: preview URL + screenshot', depends: ['CT-1', 'CT-2', 'CT-3'], lane: 'release' },
    ],
  });
  const id = r.missionId;
  console.log(`Demo mission ${id} · ${LOCAL_URL}/#/m/${id}`);

  await main('postToolUse', { tool_name: 'MCP:tower_start_run', tool_input: {}, tool_output: '{}' });
  await sleep(2);
  await sub('sa-api', 'CT-1', 'Build GET /api/reports/export returning text/csv');
  await sleep(1.2);
  await sub('sa-ui', 'CT-2', 'Add Export button to ReportsPage wired to the endpoint');
  await sleep(1.2);
  await sub('sa-csv', 'CT-3', 'Harden CSV escaping: commas, quotes, newlines, unicode');
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
  await shell('sa-api', 'npx vitest run src/api/export.test.ts', 0, 3200);
  await sleep(2);
  await shell('sa-csv', 'npm run build', 0, 91000);
  await shell('sa-csv', 'npx vitest run', 1, 48000);
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
  await call('POST', '/api/rpc/completeTask', { missionId: id, taskId: 'CT-1', evidence: [{ kind: 'test', ref: 'npx vitest run src/api/export.test.ts' }] });
  await sleep(1.5);
  await call('POST', '/api/rpc/completeTask', { missionId: id, taskId: 'CT-2', evidence: [{ kind: 'note', ref: 'looks good' }] });
  await sleep(1.5);
  await main('stop', { status: 'completed', loop_count: 0 });
  await sleep(2);
  await sub('sa-csv2', 'CT-3', 'Revert streaming encoder; prove RFC 4180 escaping with the targeted test');
  await sleep(1.5);
  await edit('sa-csv2', 'src/lib/csv.ts');
  await shell('sa-csv2', 'npx vitest run src/lib/csv.test.ts', 0, 1800);
  await sleep(1.5);
  await stopSub('sa-csv2', 'CT-3', 'Revert streaming encoder; prove RFC 4180 escaping with the targeted test', 'completed', ['src/lib/csv.ts'], 'Reverted extras; 9 escaping tests pass.', 26000);
  await call('POST', '/api/rpc/completeTask', { missionId: id, taskId: 'CT-3', evidence: [{ kind: 'test', ref: 'npx vitest run src/lib/csv.test.ts' }] });
  await call('POST', '/api/rpc/ack', { missionId: id, messageId: 'M-1', decision: 'resolved', note: 'CT-3 proven with targeted test' });
  await sleep(1.5);
  await shell(MAIN, 'npx playwright test e2e/export.spec.ts', 0, 21000);
  await call('POST', '/api/rpc/completeTask', { missionId: id, taskId: 'CT-2', evidence: [{ kind: 'test', ref: 'npx playwright test e2e/export.spec.ts' }] });
  await sleep(1);
  await sub('sa-prev', 'CT-4', 'Open preview deploy, download CSV as a real user, attach screenshot');
  console.log('Demo running · CT-4 left in flight so the board stays live.');
}
