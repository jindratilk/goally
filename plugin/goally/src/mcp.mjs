import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { call, ensureDaemon } from './client.mjs';

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });

export async function runMcp() {
  const server = new McpServer({ name: 'goally', version: '0.1.0' });
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

  async function rpc(method, body) {
    if (!(await ensureDaemon())) throw new Error('Goally daemon did not start. Run `goally doctor`.');
    return call('POST', `/api/rpc/${method}`, body, { timeoutMs: 10000 });
  }

  const wrap = (fn) => async (args) => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(`Goally: ${e.message}`);
    }
  };

  const Task = z.object({
    title: z.string().describe('Short card title, imperative'),
    description: z.string().optional().describe('What exactly to do and where'),
    acceptance: z.string().describe('Observable condition that makes this task done'),
    verify: z.string().describe('The smallest targeted check that proves it (exact test command, URL, or "manual: ...")'),
    depends: z.array(z.string()).optional().describe('IDs of tasks this one waits for, e.g. ["CT-1"]'),
    lane: z.string().optional().describe('Optional lane label, e.g. backend, ui, qa'),
  });

  server.registerTool(
    'goally_start_run',
    {
      title: 'Start mission',
      description:
        'Start a Goally mission after auditing a large request. Registers the task board (IDs CT-1..n in the given order), returns the live dashboard URL and binds this chat as the mission manager. Call once per mission, before launching subagents.',
      inputSchema: {
        title: z.string().describe('Mission name, max ~8 words'),
        goal: z.string().describe("The operator's request, verbatim or faithfully summarized, including constraints and definition of done"),
        tasks: z.array(Task).min(1).max(60),
        workspace: z.string().optional().describe('Absolute workspace root; defaults to the first MCP root'),
      },
    },
    wrap(async (a) => {
      const ws = await workspace(a.workspace);
      const r = await rpc('startRun', { title: a.title, goal: a.goal, tasks: a.tasks, workspace: ws });
      const lines = [
        `Mission ${r.missionId} is live. Board: ${r.url}${r.remoteUrl ? ` · phone: ${r.remoteUrl}` : ''}`,
        'Open the board for the operator in the Cursor built-in browser (browser tool), never with the system `open` command.',
        `Parallel agent limit: ${r.maxParallelAgents}.`,
        '',
        'Cards:',
        ...r.tasks.map((t) => `- [${t.id}] ${t.title}${t.depends?.length ? ` (after ${t.depends.join(', ')})` : ''}`),
        '',
        'Rules: start every subagent task text with its tag, e.g. "[CT-2] ...". Finish each card with goally_complete_task and evidence. Acknowledge every [FLIGHT DIRECTOR] or [OPERATOR] message with goally_ack.',
        'Tell the operator the board URL now.',
      ];
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'goally_update_task',
    {
      title: 'Update task card',
      description: 'Change a card status (todo, running, review, blocked, failed) or add a progress note. Use status "blocked" with a note when you need the operator. Use goally_complete_task to finish a card.',
      inputSchema: {
        taskId: z.string(),
        status: z.enum(['todo', 'running', 'review', 'blocked', 'failed']).optional(),
        note: z.string().optional(),
      },
    },
    wrap(async (a) => {
      await rpc('updateTask', { ...a, workspace: await workspace() });
      return text(`Updated ${a.taskId}.`);
    }),
  );

  server.registerTool(
    'goally_add_task',
    {
      title: 'Add task card',
      description: 'Add a card discovered during the mission. Keep scope tight: only add work required by the goal.',
      inputSchema: Task.shape,
    },
    wrap(async (a) => {
      const r = await rpc('addTask', { ...a, workspace: await workspace() });
      return text(`Added ${r.taskId}. Tag its subagent with [${r.taskId}].`);
    }),
  );

  server.registerTool(
    'goally_complete_task',
    {
      title: 'Complete task with proof',
      description:
        'Mark a card done. Requires evidence. A test counts only if the hooks saw it pass after the last file edit, so run the targeted test first. Other evidence: commit hash, URL, screenshot path.',
      inputSchema: {
        taskId: z.string(),
        evidence: z
          .array(
            z.object({
              kind: z.enum(['test', 'commit', 'url', 'deploy', 'screenshot', 'note']),
              ref: z.string().describe('Command, hash, URL or path'),
              note: z.string().optional(),
            }),
          )
          .min(1),
      },
    },
    wrap(async (a) => {
      const r = await rpc('completeTask', { ...a, workspace: await workspace() });
      return r.accepted
        ? text(`${a.taskId} GO. ${r.reason}. Mission ${r.mission.done}/${r.mission.total} proven${r.mission.go ? ' · MISSION GO' : ''}.`)
        : fail(`${a.taskId} NO-GO: ${r.reason}`);
    }),
  );

  server.registerTool(
    'goally_status',
    {
      title: 'Mission status',
      description: 'Board summary: every card, GO/NO-GO verdict, blockers and unacknowledged messages. Call before reporting progress or claiming completion.',
      inputSchema: {},
    },
    wrap(async () => text((await rpc('status', { workspace: await workspace() })).text)),
  );

  server.registerTool(
    'goally_resume',
    {
      title: 'Resume mission',
      description: 'Continuation brief for a mission after a crash, compaction or new chat. Returns what is proven, what remains and recent errors.',
      inputSchema: {},
    },
    wrap(async () => text((await rpc('resume', { workspace: await workspace() })).text)),
  );

  server.registerTool(
    'goally_ack',
    {
      title: 'Acknowledge message',
      description: 'Acknowledge a [FLIGHT DIRECTOR] or [OPERATOR] message: accepted (will do), rejected (explain why in note), resolved (done).',
      inputSchema: {
        messageId: z.string(),
        decision: z.enum(['accepted', 'rejected', 'resolved']),
        note: z.string().optional(),
      },
    },
    wrap(async (a) => {
      await rpc('ack', { ...a, workspace: await workspace() });
      return text(`${a.messageId} ${a.decision}.`);
    }),
  );

  server.registerTool(
    'goally_finish',
    {
      title: 'Finish mission',
      description: 'Close the mission. Succeeds only when the GO/NO-GO poll is all GO; otherwise returns the blockers.',
      inputSchema: {},
    },
    wrap(async () => {
      const r = await rpc('finish', { workspace: await workspace() });
      return r.ok ? text('Mission complete · all stations GO.') : fail(`Mission is NO-GO:\n${r.blockers.map((b) => `- ${b}`).join('\n')}`);
    }),
  );

  await server.connect(new StdioServerTransport());
}
