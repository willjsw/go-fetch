//! Pre-existing session detection (SL-4 / GF-86).
//!
//! GoFetch normally only learns about a session once one of its hook events
//! fires. A session that was already running before GoFetch started — and
//! especially one stalled waiting for input, which emits no further events —
//! would stay invisible until its next event. To surface it, we poll the
//! official `claude agents --json` command, which lists currently active
//! sessions, and seed any we don't already track.
//!
//! Constraints honored:
//! - **DI-4 (non-blocking):** runs as a separate child process with a hard
//!   timeout; any failure (missing CLI, timeout, non-zero exit, malformed JSON)
//!   is swallowed and we degrade to hook-only. Never run on the hook/UI path.
//! - **PC-1 / PC-2 (local only):** local CLI invocation + local parsing only;
//!   nothing leaves the machine.
//! - **Read-only:** only `agents --json` (a query). Never attach/stop/respawn.
//! - **Hook-first (SL-5):** seeding never overwrites a hook-tracked session, and
//!   seeded sessions stay `pending` until a real hook event confirms their state.
//!
//! `claude agents` is a research-preview interface (PRD Sprint2 §2.2 F7) whose
//! schema varies by version (F9), so the parser is deliberately lenient: every
//! field optional, unknown fields ignored, malformed output → empty list.

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde::Deserialize;

/// How long to wait for `claude agents --json` before giving up (DI-4). The
/// command has a cold-start cost (~3s observed); we never block the host on it.
const POLL_TIMEOUT: Duration = Duration::from_secs(10);

/// One active session as reported by `claude agents --json`. All fields optional
/// and unknown fields ignored — the interface is research-preview and varies by
/// version (F7/F9).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct AgentEntry {
    #[serde(default, rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub pid: Option<u32>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    /// Present mainly on background sessions; interactive sessions usually omit
    /// it (F8) — which is exactly why polling alone can't determine the precise
    /// state, and seeded sessions stay `pending` until a hook arrives.
    #[serde(default)]
    pub state: Option<String>,
}

/// Parse the JSON array printed by `claude agents --json`. Keeps only entries
/// that carry a non-empty `sessionId`. Malformed output yields an empty list so
/// callers degrade gracefully.
pub fn parse_agents_json(out: &str) -> Vec<AgentEntry> {
    serde_json::from_str::<Vec<AgentEntry>>(out)
        .unwrap_or_default()
        .into_iter()
        .filter(|e| e.session_id.as_deref().is_some_and(|s| !s.is_empty()))
        .collect()
}

/// Resolve the `claude` executable. Under `npm` / `tauri dev` (and GUI launches
/// from Finder/Dock) the inherited PATH often omits Homebrew and user bin dirs
/// — e.g. `/opt/homebrew/bin` is absent, so a bare `Command::new("claude")`
/// fails to spawn and pre-existing detection silently does nothing (GF-100).
/// Probe the common absolute install locations first; fall back to a PATH lookup.
fn claude_command() -> PathBuf {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/claude"), // Homebrew (Apple silicon)
        PathBuf::from("/usr/local/bin/claude"),    // Homebrew (Intel) / manual
    ];
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        candidates.push(home.join(".claude/local/claude"));
        candidates.push(home.join(".local/bin/claude"));
        candidates.push(home.join("bin/claude"));
    }
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .unwrap_or_else(|| PathBuf::from("claude")) // last resort: rely on PATH
}

/// Poll `claude agents --json` for the currently-active sessions.
///
/// Returns `Some(sessions)` on a clean run (possibly empty), or `None` if the
/// command could not be run / failed — letting the caller distinguish "no
/// sessions" from "couldn't check" (so a failed poll never evicts everything).
///
/// Runs the command **synchronously on a blocking thread** (`spawn_blocking` +
/// `std::process`) rather than `tokio::process`: under Tauri's async runtime the
/// child spawned but its output was never received and the `await` only resolved
/// on timeout, so nothing was ever seeded (GF-101). A hard timeout still guards
/// against a hung CLI (DI-4). `stdin` is null so it can't block on a prompt, and
/// the child PATH is augmented with the common bin dirs (GF-100).
pub async fn poll_active_sessions() -> Option<Vec<AgentEntry>> {
    match tokio::time::timeout(POLL_TIMEOUT, tokio::task::spawn_blocking(run_claude_agents)).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            eprintln!("[gofetch] pre-existing poll task panicked");
            None
        }
        Err(_) => {
            eprintln!("[gofetch] `claude agents --json` timed out; pre-existing detection skipped");
            None
        }
    }
}

/// Blocking invocation of `claude agents --json`. `Some` on a clean exit, `None`
/// on spawn error or non-zero exit (logged for diagnosability).
fn run_claude_agents() -> Option<Vec<AgentEntry>> {
    let bin = claude_command();
    let path = std::env::var("PATH").unwrap_or_default();
    let result = std::process::Command::new(&bin)
        .args(["agents", "--json"])
        .env("PATH", format!("{path}:/opt/homebrew/bin:/usr/local/bin"))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();
    match result {
        Ok(out) if out.status.success() => {
            Some(parse_agents_json(&String::from_utf8_lossy(&out.stdout)))
        }
        Ok(out) => {
            eprintln!(
                "[gofetch] `claude agents --json` exited with {:?}; pre-existing detection skipped",
                out.status.code()
            );
            None
        }
        Err(e) => {
            eprintln!(
                "[gofetch] could not run `{}`: {e}; pre-existing detection disabled",
                bin.display()
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_agents_json_array() {
        let json = r#"[
            {"sessionId":"0db96401","cwd":"/Users/x/go-fetch","pid":51117,"kind":"interactive","status":"idle"},
            {"sessionId":"abc","cwd":"/Users/x/api","pid":222,"kind":"background","status":"running","state":"working"}
        ]"#;
        let v = parse_agents_json(json);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].session_id.as_deref(), Some("0db96401"));
        assert_eq!(v[0].cwd.as_deref(), Some("/Users/x/go-fetch"));
        assert_eq!(v[0].pid, Some(51117));
        // interactive session has no `state` (F8).
        assert!(v[0].state.is_none());
        assert_eq!(v[1].state.as_deref(), Some("working"));
    }

    #[test]
    fn ignores_unknown_fields_and_entries_without_sessionid() {
        // Defensive against research-preview schema drift (F9).
        let json = r#"[
            {"sessionId":"a","futureField":123,"kind":"bg"},
            {"cwd":"/x"},
            {"sessionId":""}
        ]"#;
        let v = parse_agents_json(json);
        assert_eq!(v.len(), 1, "drop entries with missing/empty sessionId; tolerate unknown fields");
        assert_eq!(v[0].session_id.as_deref(), Some("a"));
    }

    #[test]
    fn malformed_or_empty_output_degrades_to_empty() {
        assert!(parse_agents_json("not json at all").is_empty());
        assert!(parse_agents_json("").is_empty());
        assert!(parse_agents_json("{}").is_empty(), "object (not array) → empty");
    }
}
