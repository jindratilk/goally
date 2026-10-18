import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const PROVIDERS = {
  grok: { label: 'Grok Build', command: 'grok', setup: 'Install Grok Build, then run grok login.' },
  claude: { label: 'Claude', command: 'claude', setup: 'Install Claude Code, then run claude auth login.' },
  codex: { label: 'Codex', command: 'codex', setup: 'Install Codex CLI, then run codex login.' },
};

const executableChecks = new Map();
function runnable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    const cached = executableChecks.get(file);
    if (cached?.mtime === stat.mtimeMs && Date.now() - cached.at < 60000) return cached.ok;
    let ok = false;
    try {
      execFileSync(file, ['--version'], { timeout: 2000, stdio: 'ignore', env: { ...process.env, GROK_DISABLE_AUTOUPDATER: '1' } });
      ok = true;
    } catch { /* Skip broken launchers and try the next installed CLI. */ }
    executableChecks.set(file, { at: Date.now(), mtime: stat.mtimeMs, ok });
    return ok;
  } catch { return false; }
}

export function providerStatus(provider) {
  const info = PROVIDERS[provider];
  if (!info) throw new Error(`Unknown Goal Director provider: ${provider}`);
  const candidates = [
    process.env[`GOALLY_${provider.toUpperCase()}_BIN`],
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, info.command)),
    path.join(os.homedir(), `.${info.command}`, 'bin', info.command),
    path.join(os.homedir(), '.local', 'bin', info.command),
    '/opt/homebrew/bin/' + info.command,
    '/usr/local/bin/' + info.command,
    ...(provider === 'codex' && process.platform === 'darwin' ? [
      '/Applications/Codex.app/Contents/Resources/codex',
      '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
      path.join(os.homedir(), 'Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'),
    ] : []),
  ].filter(Boolean);
  const bin = [...new Set(candidates)].find(runnable) || null;
  return { provider, ...info, bin, available: Boolean(bin) };
}

/** Every backend reviews the workspace without tools that can edit it. */
export function directorArgs(provider, { prompt, workspace, model, effort, maxTurns, sessionId }) {
  if (provider === 'codex') {
    return [
      'exec', '--sandbox', 'read-only', '--ephemeral', '--json', '--skip-git-repo-check', '-C', workspace,
      '-c', 'approval_policy="never"',
      '-c', 'mcp_servers={}', '-c', 'features.multi_agent=false',
      ...(model ? ['--model', model] : []),
      ...(effort ? ['-c', `model_reasoning_effort=${JSON.stringify(effort)}`] : []),
      prompt,
    ];
  }
  const args = ['-p', prompt, '--output-format', 'json'];
  if (provider === 'claude') {
    args.push('--tools', 'Read,Grep,Glob', '--allowedTools', 'Read,Grep,Glob', '--permission-mode', 'dontAsk',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--settings', '{"disableAllHooks":true}', '--max-turns', String(maxTurns));
  } else if (provider === 'grok') {
    args.push('--tools', 'read_file,grep,list_dir', '--disallowed-tools', 'Agent',
      '--max-turns', String(maxTurns), '--cwd', workspace, '--no-auto-update');
  } else {
    throw new Error(`Unknown Goal Director provider: ${provider}`);
  }
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  if (sessionId) args.push('--resume', sessionId);
  return args;
}

/** Normalize the single JSON envelope (Grok/Claude) and Codex's JSONL event stream. */
export function directorOutput(provider, result) {
  const raw = result.stdout.trim();
  let out;
  if (provider === 'codex') {
    const events = raw.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    const terminal = events.findLast((e) => e.type === 'turn.failed' || e.type === 'turn.completed');
    const message = events.findLast((e) => e.type === 'item.completed' && e.item?.type === 'agent_message');
    const failed = terminal?.type === 'turn.failed' ? terminal : !message ? events.findLast((e) => e.type === 'error') : null;
    out = { text: message?.item.text || '', error: failed?.error?.message || failed?.message };
  } else {
    try { out = JSON.parse(raw); } catch {
      try { out = JSON.parse(raw.split('\n').filter(Boolean).at(-1)); } catch { out = null; }
    }
    if (out) out = {
      text: typeof out.result === 'string' ? out.result : out.text || (out.structured_output ? JSON.stringify(out.structured_output) : ''),
      thought: out.thought,
      sessionId: out.session_id || out.sessionId || null,
      costUsd: Number(out.total_cost_usd || 0),
      error: out.is_error || out.type === 'error' || out.error ? out.message || out.error?.message || out.error || out.result || out.errors?.join(' ') || 'CLI reported an error' : null,
    };
  }
  if (!out || out.error || result.code !== 0 || !out.text) {
    const detail = result.timedOut ? 'Check timed out. Try again or increase supervisor.timeoutSec.' : out?.error || result.stderr || result.stdout || `exited ${result.code}`;
    if (provider === 'grok' && /(?:http_status["']?\s*:\s*402|HTTP\s+402)/i.test(String(detail))) {
      throw new Error('Grok Build: Account rejected the check (HTTP 402). Check your credits or billing.');
    }
    throw new Error(`${PROVIDERS[provider].label}: ${String(detail).trim().split('\n').slice(-2).join(' ').slice(0, 300)}`);
  }
  return out;
}
