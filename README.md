# Goally

Mission control for big agent tasks in Cursor. You hand the agent a large task; it audits it into tasks, launches parallel subagents within your limit, and a live board shows what is really happening. A task only counts as done when a passing check was observed after the last edit (GO/NO-GO poll). Grok Build runs in the background as the Flight Director, catches over-engineering, stuck agents, full builds and missing proof, and writes corrections straight into the manager chat.

## Install

```sh
./scripts/install.sh      # builds the board, installs to ~/.cursor/plugins/local/goally
```

Then reload Cursor (Developer: Reload Window) and run `/goally-setup` in a chat, or `goally doctor` in a terminal.

Optional:

- `grok login` so the Flight Director can run on your Grok subscription.
- Cursor Settings → Beta → "Allow CLI to access desktop agents", then restart Cursor. With Desktop Bridge on, the director's messages land in the manager chat immediately; otherwise they arrive on the manager's next tool call or stop.

## Use

In a Cursor chat: `/goally <big task>`. The board opens at http://127.0.0.1:4777.

- `goally demo 4` plays a simulated mission on the board.
- `goally tunnel start` opens a free Cloudflare Quick Tunnel and prints a QR code with a private, read-only phone link (also in Settings → Remote access).
- `goally send "<text>"` messages the manager from the terminal.

## How it fits together

| Part | Where | Role |
| --- | --- | --- |
| Skill | `plugin/goally/skills/goally` | Mission protocol for the manager agent |
| MCP | `goally.mjs mcp` | `goally_start_run`, `goally_complete_task` (proof check), `goally_ack`, `goally_status`, … |
| Hooks | `hooks/hooks.json` → `bin/hook.sh` | Record subagents, tools, tests, builds, edits; enforce the parallel limit and full-build policy; deliver messages |
| Daemon | `127.0.0.1:4777` | Event log per mission in `~/.goally/missions`, API, dashboard, Flight Director, tunnel |
| Dashboard | `dashboard/` (Vite, React, Tailwind v4, shadcn, Motion, Recharts) | Board, poll, fleet, director inbox, charts, telemetry, settings |

Security: the daemon listens on loopback only, hooks and MCP use a local 0600 token, dashboard writes are local only, and the tunnel view is read-only behind a rotating private key.
