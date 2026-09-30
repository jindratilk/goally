# Goally

Mission control for big agent tasks in Cursor. You hand the agent a large task; it audits it into tasks, launches parallel subagents within your limit, and a live board shows what is really happening. A task only counts as done when a passing check was observed after the last edit (GO/NO-GO poll). Grok Build runs in the background as the Goal Director, catches over-engineering, stuck agents, full builds and missing proof, and writes corrections straight into the manager chat.

## Install

Goally installs into Cursor, Claude Code and Codex (every one it finds). Paste this into any of them:

> Install Goally for me. Follow the steps in https://github.com/jindratilk/goally/blob/main/INSTALL.md exactly, then run `goally doctor` and tell me what's left for me to do.

Or by hand, which is also how you update:

```sh
git clone https://github.com/jindratilk/goally ~/.goally/src   # or: git -C ~/.goally/src pull
sh ~/.goally/src/scripts/install.sh    # --only cursor,claude,codex · --no-start
goally doctor
```

The runtime lives in `~/.goally/app`. Then reload Cursor (Developer: Reload Window), or start a new Claude Code / Codex session. See [INSTALL.md](INSTALL.md) for the optional Grok Build sign-in and Desktop Bridge.

## Use

Cursor and Claude Code: `/goally <big task>`. Codex: `$goally <big task>`. The board opens at http://127.0.0.1:4777.

- `goally demo 4` plays a simulated mission on the board.
- `goally tunnel start` opens a free Cloudflare Quick Tunnel and prints a QR code with a private, read-only phone link (also in the sidebar under Phone access, hover for the QR code).
- `goally send "<text>"` messages the manager from the terminal.

## How it fits together

| Part | Where | Role |
| --- | --- | --- |
| Skill | `plugin/goally/skills/goally` | Mission protocol for the manager agent |
| MCP | `goally.mjs mcp` | `goally_start_run`, `goally_complete_task` (proof check), `goally_ack`, `goally_status`, … |
| Hooks | `hooks/hooks.json` → `bin/hook.sh` | Record subagents, tools, tests, builds, edits; enforce the parallel limit; deliver messages |
| Daemon | `127.0.0.1:4777` | Event log per mission in `~/.goally/missions`, API, dashboard, Goal Director, tunnel |
| Dashboard | `dashboard/` (Vite, React, Tailwind v4, shadcn, Motion, Recharts) | Board, poll, fleet, director inbox, charts, telemetry, settings |

Security: the daemon listens on loopback only, hooks and MCP use a local 0600 token, dashboard writes are local only, and the tunnel view is read-only behind a rotating private key.
