---
name: goally-setup
description: Preflight Goally (daemon, hooks, MCP, Grok Build, Desktop Bridge, phone tunnel) and fix what is missing.
---

# Goally setup

Run the preflight and walk the operator through anything that is not GO. Do each step, then re-run the preflight.

1. Run `goally doctor` in the terminal (or `node ~/.goally/app/bin/goally.mjs doctor` if `~/.local/bin` is not on PATH) and show the result.
2. Grok Build (Goal Director):
   - If the CLI is missing: `curl -fsSL https://x.ai/cli/install.sh | bash`.
   - If sign-in is missing: run `grok login` (browser, uses the operator's SuperGrok / X Premium+ subscription) or ask for `XAI_API_KEY`.
3. Desktop Bridge (lets the Goal Director write into this chat at any time): optional. Cursor rolls it out per account, so the switch may not exist. If Cursor Settings → Beta shows "Allow CLI to access desktop agents", the operator can enable it and restart Cursor. Without it, messages still arrive with the next Goally tool result, so never block on it.
4. Phone access: open the board at http://127.0.0.1:4777 in the Cursor built-in browser (browser tool), then hover "Phone access" in the sidebar and press Start. It creates a free Cloudflare Quick Tunnel and shows a QR code with a private read-only link.
5. Parallel limit, Goal Director interval and the Intervention switch live in the board Settings panel.
6. Finish with `goally doctor` again and report which stations are GO.
