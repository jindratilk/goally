#!/bin/sh
# Installs or updates Goally.
#   runtime:  ~/.goally/app            (the only code path: MCP, hooks and CLI all run from here)
#   harness:  Cursor, Claude Code, Codex (every detected one, or --only cursor,claude,codex)
#   CLI:      ~/.local/bin/goally
# Re-run any time to update. Flags: --only <list>  --no-start  --help
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/plugin/goally"
APP="$HOME/.goally/app"
GOALLY_JS="$APP/bin/goally.mjs"
HOOK="$APP/bin/hook.sh"
PORT="${GOALLY_PORT:-4777}"
CURSOR_DEST="$HOME/.cursor/plugins/local/goally"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"

ONLY=""
START=1
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    --only=*) ONLY="${1#--only=}"; shift ;;
    --no-start) START=0; shift ;;
    -h|--help)
      echo "usage: install.sh [--only cursor,claude,codex] [--no-start]"
      exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 1 ;;
  esac
done

NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "node not found (need Node 20+)"; exit 1; }
NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || { echo "Node $("$NODE" -v) found, need Node 20+"; exit 1; }
command -v rsync >/dev/null 2>&1 || { echo "rsync not found"; exit 1; }

SUMMARY=""
NEXT=""
add_summary() { SUMMARY="$SUMMARY
  $1"; }
add_next() { NEXT="$NEXT
  $1"; }

wanted() {
  if [ -n "$ONLY" ]; then
    case ",$ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac
  fi
  case "$1" in
    cursor) [ -d "$HOME/.cursor" ] || [ -d /Applications/Cursor.app ] ;;
    claude) command -v claude >/dev/null 2>&1 || [ -d "$HOME/.claude" ] ;;
    codex) command -v codex >/dev/null 2>&1 || [ -d "$CODEX_DIR" ] ;;
    *) return 1 ;;
  esac
}

# 1. runtime ---------------------------------------------------------------

echo "› dashboard build"
if [ -d "$ROOT/dashboard" ]; then
  (cd "$ROOT/dashboard" && npm install --no-audit --no-fund --silent && npm run build --silent)
fi
[ -f "$SRC/dashboard/index.html" ] || { echo "dashboard build missing at $SRC/dashboard"; exit 1; }

echo "› runtime → $APP"
mkdir -p "$APP"
chmod 700 "$HOME/.goally"
# node_modules is excluded, so it survives --delete and npm updates it in place
rsync -a --delete --exclude '.git' --exclude 'node_modules' --exclude 'bin/.node-path' --exclude 'hooks/hooks.json' --exclude 'mcp.json' "$SRC/" "$APP/"
(cd "$APP" && npm install --omit=dev --no-audit --no-fund --silent)
printf '%s' "$NODE" > "$APP/bin/.node-path"
chmod +x "$HOOK" "$GOALLY_JS"

# 2. harnesses -------------------------------------------------------------

install_cursor() {
  echo "› Cursor → $CURSOR_DEST"
  rm -rf "$CURSOR_DEST"
  mkdir -p "$CURSOR_DEST/hooks"
  for part in .cursor-plugin skills commands assets; do
    [ -e "$SRC/$part" ] && cp -R "$SRC/$part" "$CURSOR_DEST/"
  done
  # keeps `node ~/.cursor/plugins/local/goally/bin/goally.mjs` working; node resolves it into $APP
  ln -s "$APP/bin" "$CURSOR_DEST/bin"
  cat > "$CURSOR_DEST/hooks/hooks.json" <<EOF
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "$HOOK sessionStart", "timeout": 5 }],
    "beforeSubmitPrompt": [{ "command": "$HOOK beforeSubmitPrompt", "timeout": 5 }],
    "subagentStart": [{ "command": "$HOOK subagentStart", "timeout": 5 }],
    "subagentStop": [{ "command": "$HOOK subagentStop", "timeout": 5 }],
    "postToolUse": [{ "command": "$HOOK postToolUse", "timeout": 5 }],
    "postToolUseFailure": [{ "command": "$HOOK postToolUseFailure", "timeout": 5 }],
    "afterFileEdit": [{ "command": "$HOOK afterFileEdit", "timeout": 5 }],
    "preCompact": [{ "command": "$HOOK preCompact", "timeout": 5 }],
    "stop": [{ "command": "$HOOK stop", "timeout": 8 }]
  }
}
EOF
  cat > "$CURSOR_DEST/mcp.json" <<EOF
{
  "mcpServers": {
    "goally": {
      "type": "stdio",
      "command": "$NODE",
      "args": ["$GOALLY_JS", "mcp"]
    }
  }
}
EOF
  add_summary "Cursor       plugin $CURSOR_DEST · hooks + MCP → $APP"
  add_next "Cursor:      run \"Developer: Reload Window\", then /goally <big task>"
}

install_claude() {
  echo "› Claude Code"
  rm -rf "$HOME/.claude/skills/goally"
  mkdir -p "$HOME/.claude/skills"
  cp -R "$SRC/skills/goally" "$HOME/.claude/skills/goally"
  mcp="~/.claude.json (claude CLI not found)"
  if command -v claude >/dev/null 2>&1; then
    claude mcp remove -s user goally >/dev/null 2>&1 || true
    if claude mcp add -s user goally -- "$NODE" "$GOALLY_JS" mcp >/dev/null 2>&1; then
      mcp="claude mcp add -s user"
    else
      mcp="~/.claude.json (claude mcp add failed)"
    fi
  fi
  if [ "$mcp" != "claude mcp add -s user" ]; then
    "$NODE" -e '
      const fs = require("fs");
      const [file, node, js] = process.argv.slice(1);
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
      cfg.mcpServers = { ...(cfg.mcpServers || {}), goally: { type: "stdio", command: node, args: [js, "mcp"], env: {} } };
      fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    ' "$HOME/.claude.json" "$NODE" "$GOALLY_JS"
  fi
  add_summary "Claude Code  skill ~/.claude/skills/goally · $mcp"
  add_next "Claude Code: start a new session, then /goally <big task>"
}

install_codex() {
  echo "› Codex"
  rm -rf "$CODEX_DIR/skills/goally"
  mkdir -p "$CODEX_DIR/skills"
  cp -R "$SRC/skills/goally" "$CODEX_DIR/skills/goally"
  mcp="config.toml (codex CLI not found)"
  if command -v codex >/dev/null 2>&1; then
    codex mcp remove goally >/dev/null 2>&1 || true
    if codex mcp add goally -- "$NODE" "$GOALLY_JS" mcp >/dev/null 2>&1; then
      mcp="codex mcp add"
    else
      mcp="config.toml (codex mcp add failed)"
    fi
  fi
  if [ "$mcp" != "codex mcp add" ]; then
    # drop any previous [mcp_servers.goally] tables, then append a fresh one
    "$NODE" -e '
      const fs = require("fs");
      const [file, node, js] = process.argv.slice(1);
      let toml = "";
      try { toml = fs.readFileSync(file, "utf8"); } catch {}
      const kept = toml.split(/^(?=\[)/m).filter((b) => !/^\[mcp_servers\.goally(\.[^\]]+)?\]\s*$/.test(b.split("\n")[0]));
      const out = kept.join("").replace(/\s*$/, "");
      fs.writeFileSync(file, `${out ? `${out}\n\n` : ""}[mcp_servers.goally]\ncommand = ${JSON.stringify(node)}\nargs = [${JSON.stringify(js)}, "mcp"]\n`);
    ' "$CODEX_DIR/config.toml" "$NODE" "$GOALLY_JS"
  fi
  # goally_check runs test commands through MCP; Codex's default 60 s tool timeout is too short
  "$NODE" -e '
    const fs = require("fs");
    const file = process.argv[1];
    let toml = "";
    try { toml = fs.readFileSync(file, "utf8"); } catch { process.exit(0); }
    const m = /^\[mcp_servers\.goally\]\s*$/m.exec(toml);
    if (!m) process.exit(0);
    const rest = toml.slice(m.index + m[0].length);
    const end = rest.search(/^\[/m);
    const table = end < 0 ? rest : rest.slice(0, end);
    if (/^tool_timeout_sec\s*=/m.test(table)) process.exit(0);
    fs.writeFileSync(file, toml.slice(0, m.index + m[0].length) + "\ntool_timeout_sec = 900" + rest);
  ' "$CODEX_DIR/config.toml"
  add_summary "Codex        skill $CODEX_DIR/skills/goally · $mcp"
  add_next "Codex:       start a new session, then \$goally <big task>"
}

for h in cursor claude codex; do
  case "$h" in cursor) name="Cursor" ;; claude) name="Claude Code" ;; codex) name="Codex" ;; esac
  if wanted "$h"; then
    "install_$h"
  elif [ -n "$ONLY" ]; then
    add_summary "$(printf '%-12s' "$name") skipped (--only $ONLY)"
  else
    add_summary "$(printf '%-12s' "$name") skipped (not detected)"
  fi
done

# 3. CLI -------------------------------------------------------------------

mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/goally" <<EOF
#!/bin/sh
exec "$NODE" "$GOALLY_JS" "\$@"
EOF
chmod +x "$HOME/.local/bin/goally"

# 4. daemon ----------------------------------------------------------------

if [ "$START" = 1 ]; then
  echo "› daemon restart"
  "$NODE" "$GOALLY_JS" stop >/dev/null 2>&1 || true
  i=0
  while [ $i -lt 20 ] && curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null; do
    sleep 0.25
    i=$((i + 1))
  done
  "$NODE" "$GOALLY_JS" start
fi

echo ""
echo "✓ Goally installed · runtime $APP"
echo "$SUMMARY"
echo "  CLI          $HOME/.local/bin/goally"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "               (add ~/.local/bin to PATH)" ;; esac
echo ""
echo "Next:$NEXT"
echo "  Then check:  goally doctor"
