---
name: tower-setup
description: Preflight Control Tower (daemon, hooks, MCP, Grok Build, Desktop Bridge, phone tunnel) and fix what is missing.
---

# Control Tower setup

Run the preflight and walk the operator through anything that is not GO. Do each step, then re-run the preflight.

1. Run `node ~/.cursor/plugins/local/control-tower/bin/tower.mjs doctor` in the terminal and show the result.
2. Grok Build (Flight Director):
   - If the CLI is missing: `curl -fsSL https://x.ai/cli/install.sh | bash`.
   - If sign-in is missing: run `grok login` (browser, uses the operator's SuperGrok / X Premium+ subscription) or ask for `XAI_API_KEY`.
3. Desktop Bridge (lets the Flight Director write into this chat at any time): ask the operator to open Cursor Settings → Beta → enable "Allow CLI to access desktop agents" and restart Cursor. If the toggle is missing, hooks still deliver messages when the manager acts.
4. Phone access: open the board (`tower open`), Settings → Remote access → Start. It creates a free Cloudflare Quick Tunnel and shows a QR code with a private read-only link.
5. Parallel limit, Flight Director interval and intervention strength live in the board Settings panel.
6. Finish with `tower doctor` again and report which stations are GO.
