import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { call, ensureDaemon } from './client.mjs';
import { loadConfig } from './config.mjs';
import { workspaceFingerprint } from './fingerprint.mjs';

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });

function runCommand(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn('/bin/sh', ['-c', command], { cwd, env: { ...process.env, CI: process.env.CI || '1', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const keep = (d) => {
      out += d;
      if (out.length > 200_000) out = out.slice(-100_000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, output: e.message, durationMs: Date.now() - started, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? 124 : code ?? -1, output: out, durationMs: Date.now() - started, timedOut });
    });
  });
}

export async function runMcp() {
  const server = new McpServer({ name: 'goally', version: '0.2.0' });
  let rootsCache = null;

  async function workspace(given) {
    if (given) return given;
    if (process.env.GOALLY_WORKSPACE) return process.env.GOALLY_WORKSPACE;
    try {
      if (!rootsCache) {
        const r = await server.server.listRoots();
        rootsCache = r.roots?.map((x) => (x.uri.startsWith('file://') ? fileURLToPath(x.uri) : x.uri)) || [];
      }
      if (rootsCache[0]) return rootsCache[0];
    } catch {}
    return process.cwd();
  }

  async function rpc(method, body, timeoutMs = 10000) {
    if (!(await ensureDaemon())) throw new Error('Goally daemon did not start. Run `goally doctor`.');
    return call('POST', `/api/rpc/${method}`, { workspace: await workspace(), ...body }, { timeoutMs });
  }

  /** Every result carries pending Goal Director / operator messages, so they reach the agent in any harness. */
  const wrap = (fn) => async (args) => {
    let result;
    try {
      result = await fn(args);
    } catch (e) {
      result = fail(`Goally: ${e.message}`);
    }
    try {
      const inbox = await rpc('inbox', { taskId: args?.taskId });
      if (inbox.text) result.content.push({ type: 'text', text: `\n${inbox.text}` });
    } catch {}
    return result;
  };

  const Task = z.object({
    title: z.string().describe('The outcome, imperative, e.g. "Export endpoint returns CSV"'),
    description: z.string().optional().describe('What to do and where, enough for a subagent that has not seen the chat'),
    acceptance: z.string().describe('Observable condition that makes this task done'),
    verify: z.string().describe('The smallest targeted check that proves it: an exact test command, a URL, or "manual: <what to look at>"'),
    depends: z.array(z.string()).optional().describe('IDs of tasks whose output this one needs, e.g. ["CT-1"]'),
    lane: z.string().optional().describe('One of the mission lanes, e.g. backend, ui, qa, release'),
  });
  const agent = z.string().describe('Your agent name as the operator should see it on the board, e.g. "ui-agent" or "manager"');

  server.registerTool(
    'goally_start_run',
    {
      title: 'Start mission',
      description:
        'Start a Goally mission for a large request, after you have looked at the repo enough to plan. Opens the live board, registers the lanes and the tasks (IDs CT-1..n in the given order) and wakes the Goal Director, which reviews the mission on a schedule. Call once per mission, before delegating.',
      inputSchema: {
        title: z.string().describe('Mission name, max ~8 words'),
        goal: z.string().describe("The operator's request, verbatim or faithfully summarized, including constraints and definition of done"),
        lanes: z.array(z.string()).min(1).max(8).describe('Board lanes that group the work the way this repo splits it, in display order, e.g. ["backend", "ui", "qa", "release"]'),
        tasks: z.array(Task).min(1).max(60),
        workspace: z.string().optional().describe('Absolute workspace root; defaults to the MCP root or cwd'),
      },
    },
    wrap(async (a) => {
      const ws = await workspace(a.workspace);
      const harness = server.server.getClientVersion()?.name || null;
      const r = await rpc('startRun', { title: a.title, goal: a.goal, lanes: a.lanes, tasks: a.tasks, workspace: ws, harness });
      const cfg = loadConfig();
      const lines = [
        `Mission ${r.missionId} is live. Board: ${r.url}${r.remoteUrl ? ` · phone: ${r.remoteUrl}` : ''}`,
        'Give the operator the board URL now (in Cursor, open it in the built-in browser).',
        '',
        `Lanes: ${r.lanes.join(', ')}`,
        ...r.tasks.map((t) => `- [${t.id}]${t.lane ? ` (${t.lane})` : ''} ${t.title}${t.depends?.length ? ` · after ${t.depends.join(', ')}` : ''}`),
        '',
        `Hand ready tasks to your subagents, at most ${r.maxParallelAgents} in progress at once. A subagent needs only this line in its brief, plus anything from this chat it can't find itself:`,
        '  "You are on Goally task CT-n. Call goally_claim_task with taskId CT-n and your agent name, then follow what it returns."',
        'Small tasks you can do yourself the same way (claim, check, complete).',
        cfg.supervisor.enabled
          ? `The Goal Director reviews the mission every ${cfg.supervisor.intervalMin} min and its messages reach you here; answer each with goally_ack.`
          : 'The Goal Director is off in settings.',
      ];
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'goally_claim_task',
    {
      title: 'Claim task',
      description:
        'Take ownership of a task before working on it. Moves it to In progress under your name and returns everything you need: the goal, the task, its acceptance and verify check, and results from the tasks it depends on. Refused if another agent owns it, its dependencies are not done, or the parallel limit is reached.',
      inputSchema: {
        taskId: z.string(),
        agent,
        takeover: z.boolean().optional().describe('Take over a task whose previous owner is gone'),
      },
    },
    wrap(async (a) => {
      const r = await rpc('claimTask', a);
      const t = r.task;
      const lines = [
        `You own ${t.id} · ${t.title}${t.lane ? ` (${t.lane})` : ''}.`,
        '',
        `Mission goal: ${r.goal}`,
        '',
        ...(t.description ? [`Task: ${t.description}`] : []),
        `Acceptance: ${t.acceptance || '—'}`,
        `Verify: ${t.verify || '—'}`,
        ...r.inputs.map((i) => `Input from ${i.id} (${i.title}): ${i.result || 'no summary'}${i.evidence.length ? ` · ${i.evidence.join(', ')}` : ''}`),
        ...(r.history.filter((n) => n.text && n.kind !== 'claim').length ? ['', 'Earlier on this task:', ...r.history.filter((n) => n.text && n.kind !== 'claim').map((n) => `- ${n.kind}${n.by ? ` (${n.by})` : ''}: ${n.text}`)] : []),
        '',
        'The operator follows this task on the board. Use goally_report for what they would want to know: a decision, a blocker, a screenshot of anything visible. When it works, prove it with goally_check, then close it with goally_complete_task and a short summary. Stay inside this task; anything else belongs in your answer to the manager.',
      ];
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'goally_report',
    {
      title: 'Report on task',
      description:
        "Add an entry to a task's history on the board: progress, a decision and why, a blocker (moves the task to blocked until you or the manager update it), or a result. Attach screenshots of UI work, files, URLs or logs. Short and concrete; the operator reads these.",
      inputSchema: {
        taskId: z.string(),
        agent,
        kind: z.enum(['progress', 'decision', 'blocker', 'result']),
        text: z.string(),
        attachments: z
          .array(z.object({ kind: z.enum(['screenshot', 'file', 'url', 'log']), ref: z.string().describe('Path (absolute or workspace-relative) or URL'), label: z.string().optional() }))
          .optional(),
      },
    },
    wrap(async (a) => {
      const r = await rpc('report', a);
      return text(`${a.taskId.toUpperCase()} ${a.kind} recorded${r.status ? ` · status ${r.status}` : ''}.`);
    }),
  );

  server.registerTool(
    'goally_check',
    {
      title: 'Run check',
      description:
        "Run a task's verification command in the workspace and record the result on the board. A passing check is what proves a `test` for goally_complete_task, as long as the listed files don't change afterwards. Use the smallest targeted command (a test file, not the whole suite or a full build).",
      inputSchema: {
        taskId: z.string(),
        agent,
        command: z.string().optional().describe("Shell command; defaults to the task's verify command"),
        files: z.array(z.string()).optional().describe('Files this task changed. Only these must stay unchanged until you complete, so edits by parallel agents elsewhere do not void your proof'),
        cwd: z.string().optional().describe('Absolute directory to run in, if you work in a separate worktree'),
        timeoutSec: z.number().int().min(5).max(1800).optional().describe('Default 600'),
      },
    },
    wrap(async (a) => {
      let command = a.command?.trim();
      if (!command) {
        const st = await rpc('status', {});
        const verify = st.tasks?.find((t) => t.id === a.taskId.toUpperCase())?.verify || '';
        if (!verify || /^manual/i.test(verify)) return fail(`${a.taskId} has no runnable verify command${verify ? ` (${verify})` : ''}. Pass command, or complete with a screenshot/url/note as its verify says.`);
        command = verify;
      }
      const cwd = a.cwd || (await workspace());
      const r = await runCommand(command, cwd, (a.timeoutSec || 600) * 1000);
      const ok = r.exitCode === 0;
      const files = (a.files || []).map((f) => path.resolve(cwd, f));
      await rpc('recordCheck', {
        taskId: a.taskId, agent: a.agent, command, ok, exitCode: r.exitCode, durationMs: r.durationMs,
        output: r.output.slice(-4000), fingerprint: workspaceFingerprint(cwd, files), files, cwd,
      });
      const tail = r.output.trim().split('\n').slice(-25).join('\n');
      const head = ok
        ? `PASS · ${command} (${Math.round(r.durationMs / 1000)}s). Complete ${a.taskId.toUpperCase()} with evidence kind "test" before changing ${files.length ? 'those files' : 'anything'} again.`
        : `FAIL · exit ${r.exitCode}${r.timedOut ? ' (timed out)' : ''} · ${command} (${Math.round(r.durationMs / 1000)}s)`;
      return (ok ? text : fail)(tail ? `${head}\n\n${tail}` : head);
    }),
  );

  server.registerTool(
    'goally_complete_task',
    {
      title: 'Complete task with proof',
      description:
        'Close a task with evidence; the board shows it as Launched only if the proof holds. `test` counts when goally_check passed for this task and its files have not changed since. `commit`, `url`, `deploy` and `screenshot` (png/jpg path, shown on the board) are taken as given; `note` only when the task verify is manual. If it returns NO-GO, the reason is the next thing to fix.',
      inputSchema: {
        taskId: z.string(),
        agent: agent.optional(),
        summary: z.string().optional().describe('What was done and anything the manager must integrate, one short paragraph'),
        evidence: z
          .array(z.object({ kind: z.enum(['test', 'commit', 'url', 'deploy', 'screenshot', 'note']), ref: z.string().describe('Command, hash, URL or path'), note: z.string().optional() }))
          .min(1),
      },
    },
    wrap(async (a) => {
      const r = await rpc('completeTask', a);
      return r.accepted
        ? text(`${a.taskId.toUpperCase()} GO · ${r.reason}. Mission ${r.mission.done}/${r.mission.total} proven${r.mission.go ? ' · MISSION GO' : ''}.`)
        : fail(`${a.taskId.toUpperCase()} NO-GO · ${r.reason}`);
    }),
  );

  server.registerTool(
    'goally_update_task',
    {
      title: 'Update task',
      description:
        'Change a task: status (todo, running, review, blocked, failed), lane, title, description, acceptance, verify or dependencies, optionally with a note for the board. Done is only reachable through goally_complete_task.',
      inputSchema: {
        taskId: z.string(),
        agent: agent.optional(),
        status: z.enum(['todo', 'running', 'review', 'blocked', 'failed']).optional(),
        note: z.string().optional(),
        lane: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        acceptance: z.string().optional(),
        verify: z.string().optional(),
        depends: z.array(z.string()).optional(),
      },
    },
    wrap(async (a) => {
      const r = await rpc('updateTask', a);
      return text(`Updated ${r.task.id}.`);
    }),
  );

  server.registerTool(
    'goally_add_task',
    {
      title: 'Add task',
      description: 'Add a task discovered during the mission. Only work the goal requires; the operator sees it appear on the board.',
      inputSchema: Task.shape,
    },
    wrap(async (a) => {
      const r = await rpc('addTask', a);
      return text(`Added ${r.taskId}. A subagent claims it with goally_claim_task.`);
    }),
  );

  server.registerTool(
    'goally_set_lanes',
    {
      title: 'Set lanes',
      description: 'Replace the board lanes and their order. Lanes used by tasks are kept.',
      inputSchema: { lanes: z.array(z.string()).min(1).max(8) },
    },
    wrap(async (a) => text(`Lanes: ${(await rpc('setLanes', a)).lanes.join(', ')}`)),
  );

  server.registerTool(
    'goally_status',
    {
      title: 'Mission status',
      description: 'The board as text: every task with owner and status, the GO/NO-GO verdict, blockers and unanswered messages. Read it before reporting progress or saying anything is done.',
      inputSchema: {},
    },
    wrap(async () => text((await rpc('status', {})).text)),
  );

  server.registerTool(
    'goally_resume',
    {
      title: 'Resume mission',
      description: 'Continuation brief after a crash, compaction or new chat: what is proven, what remains, recent errors and open findings.',
      inputSchema: {},
    },
    wrap(async () => text((await rpc('resume', {})).text)),
  );

  server.registerTool(
    'goally_ack',
    {
      title: 'Acknowledge message',
      description: 'Answer a [GOAL DIRECTOR] or [OPERATOR] message: accepted (you will do it), resolved (done or already true), rejected (say why in the note; the operator reads it).',
      inputSchema: {
        messageId: z.string(),
        decision: z.enum(['accepted', 'rejected', 'resolved']),
        note: z.string().optional(),
      },
    },
    wrap(async (a) => {
      await rpc('ack', a);
      return text(`${a.messageId.toUpperCase()} ${a.decision}.`);
    }),
  );

  server.registerTool(
    'goally_finish',
    {
      title: 'Finish mission',
      description: 'Close the mission. Succeeds only when every task is proven and every message answered; otherwise returns what is missing.',
      inputSchema: {},
    },
    wrap(async () => {
      const r = await rpc('finish', {});
      return r.ok ? text('Mission complete · every task proven.') : fail(`Mission is NO-GO:\n${r.blockers.map((b) => `- ${b}`).join('\n')}`);
    }),
  );

  await server.connect(new StdioServerTransport());
}
