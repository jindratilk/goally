# Install Goally (instructions for agents)

You are installing Goally for the operator on macOS or Linux. Goally wires itself into every harness it finds: Cursor, Claude Code and Codex. Run each step in the terminal, check its output, and do not skip ahead. The installer is idempotent, so re-running it is always safe (it is also how Goally updates).

## 1. Check prerequisites

```sh
node -v    # must be v20 or newer
git --version
```

If Node is missing or older than 20, stop and ask the operator to install Node 20+ (for example `brew install node`). Do not continue without it.

Optional, ask the operator before installing:

- **Grok Build CLI** runs the Goal Director, the background reviewer that steers the manager chat. Install it with `curl -fsSL https://x.ai/cli/install.sh | bash`. The operator must then run `grok login` themselves, because it opens a browser. Do not run `grok login` for them.
- **cloudflared** gives read-only phone access to the board: `brew install cloudflared`.

## 2. Get the source

```sh
if [ -d ~/.goally/src/.git ]; then git -C ~/.goally/src pull --ff-only; else git clone https://github.com/jindratilk/goally ~/.goally/src; fi
```

## 3. Run the installer

```sh
sh ~/.goally/src/scripts/install.sh
```

The installer:

- builds the dashboard and copies the runtime to `~/.goally/app`;
- wires every detected harness (skill + MCP server `goally`, plus hooks in Cursor);
- writes the CLI to `~/.local/bin/goally`;
- restarts the local daemon on `http://127.0.0.1:4777`.

To wire only some harnesses, add `--only cursor,claude,codex`. The installer ends with a per-harness summary; keep it for step 5.

## 4. Verify

```sh
goally doctor    # if "command not found": ~/.local/bin/goally doctor
```

Fix every `NO-GO` line that the operator has not opted out of, then run `goally doctor` again:

- `Harness` or a harness `MCP` / `skill` line: re-run step 3 and read its output for errors.
- `Daemon`: run `goally logs` and fix what it shows.
- `Grok Build CLI` / `Grok sign-in` (HOLD): expected if the operator skipped Grok. Otherwise install it (step 1) and ask them to run `grok login`.
- `N/A` lines are harnesses that are not installed on this machine. That is fine.
- `HOLD` lines are optional. Mention them to the operator; do not block on them.

If `~/.local/bin` is not on `PATH`, tell the operator to add `export PATH="$HOME/.local/bin:$PATH"` to their shell profile.

## 5. Tell the operator what is left

You cannot reload the harness you are running in. Tell the operator exactly this, for each harness the installer wired:

- **Cursor:** run **Developer: Reload Window** from the command palette. Optional: enable Cursor Settings → Beta → **Allow CLI to access desktop agents** and restart Cursor, so the Goal Director can write into the chat immediately (without it, its messages arrive on the manager's next tool call).
- **Claude Code:** start a new session (`claude`) so the skill and the `goally` MCP server load. `/mcp` should list `goally` as connected.
- **Codex:** start a new session (`codex`) so the skill and the `goally` MCP server load. `/mcp` should list `goally`.
- If Grok is installed but not signed in: run `grok login`.

## 6. How to start a mission

- **Cursor:** `/goally <big task>`
- **Claude Code:** `/goally <big task>`, or ask: "use the goally skill for: <big task>"
- **Codex:** `$goally <big task>`, or ask: "use the goally skill for: <big task>"

The board is at http://127.0.0.1:4777. `goally demo 4` plays a simulated mission on it.
