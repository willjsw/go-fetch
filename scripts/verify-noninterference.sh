#!/usr/bin/env bash
# verify-noninterference.sh — empirically confirm DI-4 (Task 8 / GF-13):
# a GoFetch-style HTTP hook must NEVER stall a Claude Code turn, even when the
# GoFetch server is down, slow, or returning errors.
#
# What it does: in an isolated temp project, registers a project-local hook
# (`.claude/settings.json`) pointing at each failure mode, runs a trivial
# `claude -p` turn, and checks it completes promptly with exit 0. Compares
# against a no-hook baseline.
#
# Safety: uses a throwaway temp project dir and never edits ~/.claude/settings.json.
# Quit the GoFetch app first so its real hook isn't also firing.
#
# Requirements: `claude` CLI and `python3` (for the slow/5xx mock servers).
# Usage: bash scripts/verify-noninterference.sh
set -u

THRESHOLD_SECS="${THRESHOLD_SECS:-60}"   # a turn must finish within this
PROMPT='Reply with exactly the single word: OK'
PASS=0
FAIL=0

note() { printf '\n=== %s ===\n' "$1"; }
ok()   { printf '  ✓ %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  ✗ %s\n' "$1"; FAIL=$((FAIL + 1)); }

if ! command -v claude >/dev/null 2>&1; then
  echo "SKIP: 'claude' CLI not found — run this on a machine with Claude Code installed."
  exit 0
fi
HAS_PY=0
command -v python3 >/dev/null 2>&1 && HAS_PY=1

WORK="$(mktemp -d "${TMPDIR:-/tmp}/gofetch-di4.XXXXXX")"
trap 'rm -rf "$WORK"; [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null' EXIT
mkdir -p "$WORK/.claude"

# Write a project-local settings.json with an http hook to $1 (or none if empty).
write_hook() {
  local url="$1"
  if [ -z "$url" ]; then
    printf '{}\n' > "$WORK/.claude/settings.json"
  else
    cat > "$WORK/.claude/settings.json" <<JSON
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "http", "url": "$url", "timeout": 5 }] }],
    "Stop":       [{ "hooks": [{ "type": "http", "url": "$url", "timeout": 5 }] }]
  }
}
JSON
  fi
}

# Run one timed turn; assert exit 0 and wall time < threshold.
run_turn() {
  local label="$1"
  local start end elapsed rc
  start=$(date +%s)
  ( cd "$WORK" && claude -p "$PROMPT" >/dev/null 2>&1 ); rc=$?
  end=$(date +%s)
  elapsed=$((end - start))
  if [ "$rc" -eq 0 ] && [ "$elapsed" -lt "$THRESHOLD_SECS" ]; then
    ok "$label — completed in ${elapsed}s (exit $rc)"
  else
    bad "$label — ${elapsed}s, exit $rc (threshold ${THRESHOLD_SECS}s)"
  fi
}

start_mock() {  # $1 = mode: slow | err5xx ; echoes the port
  local mode="$1" port=38080
  MOCK_PID=""
  python3 - "$port" "$mode" >/dev/null 2>&1 <<'PY' &
import sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer
port, mode = int(sys.argv[1]), sys.argv[2]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        if mode == "slow":
            time.sleep(120)          # exceed the hook timeout
        self.send_response(500 if mode == "err5xx" else 200)
        self.end_headers()
HTTPServer(("127.0.0.1", port), H).serve_forever()
PY
  MOCK_PID=$!
  sleep 1
  echo "$port"
}

note "Baseline (no GoFetch hook)"
write_hook ""
run_turn "baseline"

note "Scenario: GoFetch DOWN (connection refused)"
write_hook "http://127.0.0.1:39999/event"   # nothing listening here
run_turn "down"

if [ "$HAS_PY" -eq 1 ]; then
  note "Scenario: GoFetch SLOW (server sleeps past hook timeout)"
  PORT="$(start_mock slow)"
  write_hook "http://127.0.0.1:${PORT}/event"
  run_turn "slow"
  kill "$MOCK_PID" 2>/dev/null; MOCK_PID=""

  note "Scenario: GoFetch returns 5xx"
  PORT="$(start_mock err5xx)"
  write_hook "http://127.0.0.1:${PORT}/event"
  run_turn "err5xx"
  kill "$MOCK_PID" 2>/dev/null; MOCK_PID=""
else
  echo "SKIP slow/5xx scenarios: python3 not found."
fi

note "Result"
printf '  PASS=%d  FAIL=%d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "  DI-4 confirmed: GoFetch failure modes did not stall Claude Code."
