import { classifyCommand, isFullBuild, parseExitCode, taskTag } from './classify.mjs';
import { redact } from './redact.mjs';
import { verdict } from './views.mjs';

const PERMISSION_HOOKS = new Set(['preToolUse', 'subagentStart', 'beforeShellExecution', 'beforeMCPExecution', 'beforeReadFile']);
const QUIET_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'ReadFile', 'SemanticSearch', 'Search']);

export function defaultResponse(event) {
  if (PERMISSION_HOOKS.has(event)) return { permission: 'allow' };
  if (event === 'beforeSubmitPrompt') return { continue: true };
  return {};
}

function agentOf(state, conversationId) {
  if (!conversationId) return 'main';
  if (!state.conversationId || conversationId === state.conversationId) return 'main';
  if (state.agents[conversationId]) return conversationId;
  return conversationId;
}

function isGoallyTool(name, tool) {
  return new RegExp(`(^|[:_.-])${tool}$`).test(String(name || ''));
}

export class HookHandler {
  constructor({ registry, delivery, supervisor, getConfig }) {
    this.registry = registry;
    this.delivery = delivery;
    this.supervisor = supervisor;
    this.getConfig = getConfig;
  }

  handle(event, payload, env = {}) {
    const conversationId = payload.conversation_id || payload.session_id || payload.parent_conversation_id;
    const workspace = payload.workspace_roots?.[0] || env.projectDir;
    const lookupConv = event === 'subagentStart' ? payload.parent_conversation_id || conversationId : conversationId;
    const mission = this.registry.resolve({ conversationId: lookupConv, workspace });
    const out = defaultResponse(event);
    if (!mission || !['active', 'paused'].includes(mission.state.status)) return out;
    const cfg = this.getConfig();
    const fn = this[`on_${event}`];
    if (!fn) return out;
    return fn.call(this, { mission, payload, conversationId, cfg, out }) || out;
  }

  maybeBind(mission, conversationId, payload) {
    if (!mission.state.conversationId && conversationId) {
      mission.append('mission.bind', { conversationId, transcriptPath: payload.transcript_path || null });
      this.registry.writeActive();
      this.delivery.flush(mission).catch(() => {});
    }
  }

  inject(mission, agent, out) {
    if (agent !== 'main') return out;
    const msg = this.delivery.nextForHook(mission);
    if (msg) out.additional_context = msg;
    return out;
  }

  on_sessionStart({ mission, payload, out }) {
    const s = mission.state;
    if (payload.session_id && payload.session_id === s.conversationId) return out;
    const v = verdict(s);
    out.additional_context = [
      `[GOALLY] Workspace has a live mission "${s.title}" (${s.id}) · ${v.done}/${v.total} tasks proven · status ${s.status}.`,
      'If you are continuing this mission, call the MCP tool goally_resume first and follow the brief. Otherwise ignore this note.',
    ].join(' ');
    return out;
  }

  on_beforeSubmitPrompt({ mission, conversationId }) {
    if (agentOf(mission.state, conversationId) === 'main' && mission.state.conversationId) mission.append('main.prompt', {});
    return { continue: true };
  }

  on_subagentStart({ mission, payload, cfg, out }) {
    const s = mission.state;
    const running = Object.values(s.agents).filter((a) => a.status === 'running').length;
    const tag = taskTag(payload.task) || taskTag(payload.description);
    if (s.status === 'paused') {
      mission.append('blocked', { what: 'subagent', reason: 'Mission paused', agent: 'main' });
      return { permission: 'deny', user_message: 'Goally: mission is paused. Resume it on the board to launch agents.' };
    }
    if (running >= cfg.maxParallelAgents) {
      mission.append('blocked', { what: 'subagent', reason: `Parallel limit ${cfg.maxParallelAgents} reached${tag ? ` (${tag})` : ''}`, agent: 'main' });
      return {
        permission: 'deny',
        user_message: `Goally: ${running} agents are running (limit ${cfg.maxParallelAgents}). Wait for one to finish, then launch ${tag || 'this task'} again.`,
      };
    }
    const held = cfg.intervention === 'block' && tag && s.findings.find((f) => f.status === 'open' && f.severity === 'high' && f.taskId === tag);
    if (held) {
      mission.append('blocked', { what: 'subagent', reason: `${tag} held by ${held.id}`, agent: 'main' });
      return {
        permission: 'deny',
        user_message: `Goally: ${tag} is on hold until Flight Director finding ${held.id} is handled: ${held.action || held.title}`,
      };
    }
    mission.append('agent.start', {
      agentId: payload.subagent_id || `sa-${Date.now().toString(36)}`,
      subagentType: payload.subagent_type,
      task: redact(payload.task, 2000),
      taskId: tag,
      model: payload.subagent_model,
      parallel: payload.is_parallel_worker,
      branch: payload.git_branch,
    });
    return { permission: 'allow' };
  }

  on_subagentStop({ mission, payload, out }) {
    const s = mission.state;
    const running = Object.values(s.agents).filter((a) => a.status === 'running');
    const tag = taskTag(payload.task) || taskTag(payload.description);
    const agent =
      (payload.subagent_id && s.agents[payload.subagent_id]) ||
      running.find((a) => a.task && payload.task && a.task === redact(payload.task, 2000)) ||
      running.find((a) => tag && a.taskId === tag) ||
      running.sort((a, b) => a.startedAt - b.startedAt)[0];
    if (!agent) return out;
    mission.append('agent.stop', {
      agentId: agent.id,
      status: payload.status,
      summary: redact(payload.summary, 3000),
      durationMs: payload.duration_ms,
      messageCount: payload.message_count,
      toolCallCount: payload.tool_call_count,
      modifiedFiles: (payload.modified_files || []).slice(0, 200),
      transcript: payload.agent_transcript_path || null,
    });
    this.supervisor.trigger(mission, 'agent-stop');
    return out;
  }

  on_beforeShellExecution({ mission, payload, conversationId, cfg, out }) {
    const cmd = payload.command || '';
    if (!isFullBuild(cmd, cfg.fullBuild.patterns)) return { permission: 'allow' };
    const flagged = mission.state.findings.some((f) => f.status === 'open' && f.kind === 'full-build');
    const block = cfg.fullBuild.policy === 'block' || (cfg.intervention === 'block' && flagged);
    if (!block) return { permission: 'allow' };
    mission.append('blocked', { what: 'full build', reason: redact(cmd, 200), agent: agentOf(mission.state, conversationId) });
    return {
      permission: 'deny',
      user_message: `Goally blocked a full build: ${cmd.slice(0, 120)}`,
      agent_message:
        '[GOALLY] Full builds are blocked for this mission. Run only the targeted test or check from the task card (verify field) for the code you changed. If the card truly needs a full build, explain why with goally_update_task and ask the user.',
    };
  }

  recordTool({ mission, payload, conversationId, cfg, ok }) {
    const agent = agentOf(mission.state, conversationId);
    const tool = payload.tool_name || 'tool';
    if (isGoallyTool(tool, 'goally_start_run')) this.maybeBind(mission, conversationId, payload);
    if (tool === 'Task' || /^MCP:/.test(tool) && /goally_/.test(tool)) return agent;
    const command = tool === 'Shell' ? payload.tool_input?.command : null;
    const cls = command ? classifyCommand(command, cfg.fullBuild.patterns) : { kind: QUIET_TOOLS.has(tool) ? 'read' : 'other' };
    const exitCode = ok ? parseExitCode(payload.tool_output) : null;
    const success = ok && (exitCode == null || exitCode === 0);
    mission.append('tool', {
      agent,
      tool,
      kind: cls.kind,
      targeted: cls.targeted,
      full: cls.full,
      command: command ? redact(command, 400) : null,
      exitCode,
      ok: success,
      durationMs: payload.duration ?? null,
      error: ok ? (success ? null : `exit ${exitCode}`) : redact(payload.error_message, 300),
    });
    return { agent, cls, command };
  }

  on_postToolUse(ctx) {
    const r = this.recordTool({ ...ctx, ok: true });
    const agent = typeof r === 'string' ? r : r.agent;
    const out = this.inject(ctx.mission, agent, {});
    if (r.cls?.kind === 'build' && r.cls.full && ctx.cfg.fullBuild.policy === 'warn' && agent === 'main') {
      const warn = '[GOALLY] That was a full build. Prefer the targeted test from the task card; full builds are slow and rarely prove the specific change.';
      out.additional_context = out.additional_context ? `${out.additional_context}\n\n${warn}` : warn;
    }
    return out;
  }

  on_postToolUseFailure(ctx) {
    if (ctx.payload.is_interrupt) return {};
    const r = this.recordTool({ ...ctx, ok: false });
    const agent = typeof r === 'string' ? r : r.agent;
    return this.inject(ctx.mission, agent, {});
  }

  on_afterFileEdit({ mission, payload, conversationId, out }) {
    if (!payload.file_path) return out;
    mission.append('file.edit', { agent: agentOf(mission.state, conversationId), path: payload.file_path });
    return out;
  }

  on_preCompact({ mission, payload, out }) {
    mission.append('compact', { usage: payload.context_usage_percent, tokens: payload.context_tokens });
    return out;
  }

  on_stop({ mission, payload, conversationId, cfg, out }) {
    const s = mission.state;
    if (agentOf(s, conversationId) !== 'main') return out;
    const loop = payload.loop_count ?? 0;
    let followup = '';
    if (s.status === 'active' && payload.status === 'completed' && loop < cfg.stopLoopLimit) {
      const parts = [];
      const msg = this.delivery.nextForHook(mission, { all: true });
      if (msg) parts.push(msg);
      const v = verdict(s);
      const actionable = v.stations.filter((x) => !x.go && x.status !== 'blocked');
      if (!v.go && actionable.length) {
        parts.push(
          [
            `[GOALLY] Mission "${s.title}" is NO-GO (${v.done}/${v.total} proven). You ended your turn with open work:`,
            ...v.blockers.slice(0, 8).map((b) => `- ${b}`),
            'Continue with the next open task. If you need the user, mark the card with goally_update_task status "blocked" and a note explaining the question; blocked cards do not trigger auto-continue.',
          ].join('\n'),
        );
      }
      followup = parts.join('\n\n');
    }
    mission.append('main.stop', { status: payload.status, loopCount: loop, followup: Boolean(followup) });
    this.supervisor.trigger(mission, 'main-stop');
    if (followup) out.followup_message = followup;
    return out;
  }
}
