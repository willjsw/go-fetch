#!/usr/bin/env bash
# mock-events.sh — send mock Claude Code hook events to GoFetch's local server
# (Task 9 / GF-14), so the widget + state machine can be exercised without a
# real Claude Code session.
#
# Payloads follow the verified schema (docs/HOOK_SPEC_VERIFIED.md §5):
# `session_id` + `hook_event_name` + event-specific fields.
#
# Usage:
#   bash scripts/mock-events.sh [scenario] [port]
#   scenario: all (default) | states | single | multi
#   port:     default 31337
#
# Run GoFetch (`npm run tauri dev`) or the server example
# (`cargo run --example serve`) first, then run this in another shell.
set -u

SCENARIO="${1:-all}"
PORT="${2:-31337}"
BASE="http://127.0.0.1:${PORT}"

# POST one event. $1 = human label, $2 = JSON body.
post() {
  local label="$1" body="$2" code
  code=$(curl -s -o /dev/null -w '%{http_code}' -XPOST "$BASE/event" \
    -H 'content-type: application/json' -d "$body")
  printf '  %-44s -> %s\n' "$label" "$code"
}

wait_for_server() {
  printf 'Waiting for GoFetch server on %s ...\n' "$BASE"
  if ! curl --retry 30 --retry-connrefused --retry-delay 1 -s -o /dev/null "$BASE/health"; then
    echo "ERROR: server not reachable at $BASE. Start GoFetch or 'cargo run --example serve' first." >&2
    exit 1
  fi
}

# One event per GoFetch state (Working/Waiting/Error/Done), distinct sessions.
scenario_states() {
  echo "[states] one event per state"
  post "Working (PreToolUse Bash)" '{"session_id":"st-working","hook_event_name":"PreToolUse","cwd":"/Users/dev/alpha","tool_name":"Bash","tool_input":{"command":"npm test"}}'
  post "Waiting (permission_prompt)" '{"session_id":"st-perm","hook_event_name":"Notification","notification_type":"permission_prompt","message":"Allow Bash?","cwd":"/Users/dev/beta"}'
  post "Waiting (idle_prompt)" '{"session_id":"st-idle","hook_event_name":"Notification","notification_type":"idle_prompt","cwd":"/Users/dev/gamma"}'
  post "Error (StopFailure rate_limit)" '{"session_id":"st-error","hook_event_name":"StopFailure","error_type":"rate_limit","error_message":"429","cwd":"/Users/dev/delta"}'
  post "Done (Stop)" '{"session_id":"st-done","hook_event_name":"Stop","cwd":"/Users/dev/epsilon"}'
}

# One session walking through a full lifecycle.
scenario_single() {
  echo "[single] one session full lifecycle"
  local s='{"session_id":"life-1","cwd":"/Users/dev/my-project"'
  post "1. Working (Read)"       "$s"',"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"README.md"}}'
  post "2. Working (Edit)"       "$s"',"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"src/main.rs"}}'
  post "3. Waiting (permission)" "$s"',"hook_event_name":"Notification","notification_type":"permission_prompt","message":"Allow Bash?"}'
  post "4. Working (Bash)"       "$s"',"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"cargo build"}}'
  post "5. Done (Stop)"          "$s"',"hook_event_name":"Stop"}'
  post "6. Waiting (idle_prompt)" "$s"',"hook_event_name":"Notification","notification_type":"idle_prompt"}'
}

# Several sessions active at once, in different states.
scenario_multi() {
  echo "[multi] concurrent sessions in different states"
  post "api-server  -> Working" '{"session_id":"multi-api","hook_event_name":"PostToolUse","cwd":"/Users/dev/api-server","tool_name":"Edit","tool_input":{"file_path":"src/routes.rs"}}'
  post "web-client  -> Waiting" '{"session_id":"multi-web","hook_event_name":"Notification","notification_type":"permission_prompt","cwd":"/Users/dev/web-client"}'
  post "data-job    -> Error"   '{"session_id":"multi-job","hook_event_name":"StopFailure","error_type":"overloaded","cwd":"/Users/dev/data-job"}'
  post "docs        -> Done"    '{"session_id":"multi-docs","hook_event_name":"Stop","cwd":"/Users/dev/docs-site"}'
}

wait_for_server
case "$SCENARIO" in
  states) scenario_states ;;
  single) scenario_single ;;
  multi)  scenario_multi ;;
  all)    scenario_states; echo; scenario_single; echo; scenario_multi ;;
  *) echo "Unknown scenario '$SCENARIO' (use: all | states | single | multi)" >&2; exit 2 ;;
esac
echo
echo "Done. Each line should show -> 200. Check the GoFetch widget for state changes."
