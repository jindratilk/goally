# Install Goally (instructions for agents)

You are installing Goally for the operator on macOS or Linux. Goally wires itself into every harness it finds: Cursor, Claude Code and Codex. Run each step in the terminal, check its output, and do not skip ahead. The installer is idempotent, so re-running it is always safe (it is also how Goally updates).

## 1. Check prerequisites

```sh
node -v    # use v20.19+, v22.12+ or v24+ to build the dashboard
git --version
```

The dashboard build requires Node 20.19+ or 22.12+ (Node 24+ is recommended). If no compatible version is installed, ask the operator to install Node 24+ (for example `brew install node`). The daemon itself supports Node 20+.

Optional, ask the operator before installing:

- **Goal Director CLI:** Settings → Goal Director → Provider supports **Grok Build**, **Claude** and **Codex**. Reuse whichever the operator already has installed and signed in. Grok Build remains the default; its installer is `curl -fsSL https://x.ai/cli/install.sh | bash`. Ask the operator to sign in with `grok login`, `claude auth login` or `codex login` as appropriate; do not run interactive sign-in for them. A CLI found in Settings still needs a valid sign-in before its first check.
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
- A Goal Director CLI / sign-in (HOLD): expected if the operator skipped the reviewer. Select an installed provider in Settings, and ask them to sign in with its CLI if a check reports an authentication error. `Grok sign-in` is checked only when Grok is selected.
- `N/A` lines are harnesses that are not installed on this machine. That is fine.
- `HOLD` lines are optional. Mention them to the operator; do not block on them.

If `~/.local/bin` is not on `PATH`, tell the operator to add `export PATH="$HOME/.local/bin:$PATH"` to their shell profile.

## 5. Tell the operator what is left

You cannot reload the harness you are running in. Tell the operator exactly this, for each harness the installer wired:

- **Cursor:** run **Developer: Reload Window** from the command palette. Optional: if Cursor Settings → Beta shows **Allow CLI to access desktop agents** (Cursor enables it per account, so it is often missing), enable it and restart Cursor so the Goal Director can write into the chat immediately. Without it, Goally's Cursor hooks still deliver them: on the manager's next tool call, with the operator's next prompt, or as a new chat turn when the manager stops.
- **Claude Code:** start a new session (`claude`) so the skill and the `goally` MCP server load. `/mcp` should list `goally` as connected.
- **Codex:** start a new session (`codex`) so the skill and the `goally` MCP server load. `/mcp` should list `goally`.
- Select the preferred Goal Director in Settings and sign in to its CLI if needed.
- Settings → Appearance offers System, Light and Dark. This preference is local to each browser/device.

## 6. How to start a mission

- **Cursor:** `/goally <big task>`
- **Claude Code:** `/goally <big task>`, or ask: "use the goally skill for: <big task>"
- **Codex:** `$goally <big task>`, or ask: "use the goally skill for: <big task>"

The board is at http://127.0.0.1:4777. `goally demo 4` plays a simulated mission on it.
