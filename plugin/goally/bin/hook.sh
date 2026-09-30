#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(cat "$DIR/.node-path" 2>/dev/null)"
[ -x "$NODE" ] || NODE="$(command -v node)"
[ -x "$NODE" ] || for p in /opt/homebrew/bin/node /usr/local/bin/node; do [ -x "$p" ] && NODE="$p" && break; done
if [ ! -x "$NODE" ]; then
  case "$1" in
    preToolUse|subagentStart|beforeShellExecution|beforeMCPExecution|beforeReadFile) echo '{"permission":"allow"}' ;;
    beforeSubmitPrompt) echo '{"continue":true}' ;;
    *) echo '{}' ;;
  esac
  exit 0
fi
exec "$NODE" "$DIR/goally.mjs" hook "$1"
