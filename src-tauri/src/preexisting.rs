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

/// Run `claude agents --json` as a child process and return the active sessions.
/// Best-effort: missing CLI, timeout, non-zero exit, or malformed JSON all yield
/// an empty list so the caller degrades to hook-only (DI-4). `stdin` is null so
/// the command can never block on a prompt.
pub async fn poll_active_sessions() -> Vec<AgentEntry> {
    let output = tokio::process::Command::new("claude")
        .args(["agents", "--json"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();
    match tokio::time::timeout(POLL_TIMEOUT, output).await {
        Ok(Ok(out)) if out.status.success() => {
            parse_agents_json(&String::from_utf8_lossy(&out.stdout))
        }
        // Timeout, spawn error (CLI absent), or non-zero exit → degrade silently.
        _ => Vec::new(),
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
