#!/bin/sh
# Installs the Goally plugin into ~/.cursor/plugins/local/goally
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/plugin/goally"
DEST="${GOALLY_PLUGIN_DEST:-$HOME/.cursor/plugins/local/goally}"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "node not found (need Node 20+)"; exit 1; }

echo "› dashboard build"
if [ -d "$ROOT/dashboard" ]; then (cd "$ROOT/dashboard" && npm install --no-audit --no-fund --silent && npm run build --silent); fi

echo "› plugin deps"
(cd "$SRC" && npm install --omit=dev --no-audit --no-fund --silent)

echo "› copy to $DEST"
mkdir -p "$DEST"
rsync -a --delete --exclude '.git' "$SRC/" "$DEST/"
printf '%s' "$NODE" > "$DEST/bin/.node-path"
chmod +x "$DEST/bin/hook.sh" "$DEST/bin/goally.mjs"

HOOK="$DEST/bin/hook.sh"
cat > "$DEST/hooks/hooks.json" <<EOF
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

cat > "$DEST/mcp.json" <<EOF
{
  "mcpServers": {
    "goally": {
      "type": "stdio",
      "command": "$NODE",
      "args": ["$DEST/bin/goally.mjs", "mcp"]
    }
  }
}
EOF

mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/goally" <<EOF
#!/bin/sh
exec "$NODE" "$DEST/bin/goally.mjs" "\$@"
EOF
chmod +x "$HOME/.local/bin/goally"

# restart daemon so it serves the new build
"$NODE" "$DEST/bin/goally.mjs" stop >/dev/null 2>&1 || true
sleep 0.5
"$NODE" "$DEST/bin/goally.mjs" start

echo "✓ installed · reload Cursor (Developer: Reload Window) to load the plugin"
echo "  CLI: ~/.local/bin/goally (add ~/.local/bin to PATH)"
