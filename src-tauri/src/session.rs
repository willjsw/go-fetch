//! Per-session state machine (Task 4 / GF-9).
//!
//! Converts verified Claude Code hook events into GoFetch's five-state model and
//! tracks one [`Session`] per `session_id` (DI-3). The event → state mapping
//! follows `docs/HOOK_SPEC_VERIFIED.md` §3 — in particular the de-risk
//! corrections:
//!   - `Stop` fires on **every** response turn, so it maps to `Done` but the
//!     notification layer (Task 7) debounces it (FIX-1).
//!   - `Notification` is split by `notification_type`: `permission_prompt` and
//!     `idle_prompt` are the precise "waiting for you" signals (A4).
//!   - `UserPromptSubmit` means the user replied, so the session goes back to
//!     active (FIX-4).
//!
//! The manager is `Clone` (cheap `Arc` clone) and thread-safe so it can be
//! shared as axum state and read by the widget UI (Task 5).

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::server::HookEvent;

/// Default time after a `Done` turn with no further activity before a session is
/// considered idle (ST-3). The idle state is widget-side, not a hook event.
const DEFAULT_IDLE_AFTER: Duration = Duration::from_secs(60);

/// The five monitored session states, ordered by monitoring priority.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    /// Actively progressing — calling tools (`PreToolUse`/`PostToolUse`).
    Working,
    /// Stopped, waiting for permission approval or the next prompt
    /// (`Notification` permission_prompt/idle_prompt). Highest priority (ST-2).
    Waiting,
    /// Turn ended abnormally via an API error (`StopFailure`).
    Error,
    /// Claude finished responding (`Stop`). Note: fires every turn (FIX-1).
    Done,
    /// Untouched for a while after `Done` — widget-side timer (ST-3).
    Idle,
}

impl SessionState {
    /// Monitoring priority for simultaneous signals / UI ordering
    /// (1 = highest). Waiting(1) > Error(2) > Done(3) > Working(4) > Idle(5).
    pub fn priority(self) -> u8 {
        match self {
            SessionState::Waiting => 1,
            SessionState::Error => 2,
            SessionState::Done => 3,
            SessionState::Working => 4,
            SessionState::Idle => 5,
        }
    }

    /// Whether this state warrants an OS notification (NT-1). Used by Task 7.
    pub fn is_notifiable(self) -> bool {
        matches!(
            self,
            SessionState::Waiting | SessionState::Error | SessionState::Done
        )
    }
}

/// A single monitored Claude Code session.
#[derive(Clone, Debug, Serialize)]
pub struct Session {
    /// `session_id` from the hook payload (DI-3).
    pub id: String,
    /// Working directory of the session, if known.
    pub cwd: Option<String>,
    /// Project label derived from `cwd` (WC-4).
    pub project_name: String,
    /// Current state.
    pub state: SessionState,
    /// Last tool name seen in a `Working` event (for the one-line summary, DV-2).
    pub last_tool: Option<String>,
    /// Last tool input seen (for the one-line summary, DV-2).
    pub last_tool_input: Option<serde_json::Value>,
    /// For `Waiting`: which notification (`permission_prompt`/`idle_prompt`).
    pub waiting_kind: Option<String>,
    /// For `Error`: the `error_type` (e.g. `rate_limit`).
    pub error_type: Option<String>,
    /// Seconds elapsed since the last activity (computed at snapshot time, ST-3).
    pub idle_seconds: u64,
    /// One-line task summary generated locally from `tool_name`/`tool_input`
    /// (DV-2), filled at snapshot time. Generated and shown locally only; never
    /// transmitted anywhere (PC-1/PC-2).
    pub summary: String,
    /// Instant of the last event for this session. Not serialized.
    #[serde(skip)]
    pub last_activity: Instant,
}

impl Session {
    fn new(id: &str, cwd: Option<String>, now: Instant) -> Self {
        let project_name = cwd
            .as_deref()
            .map(project_name_from_cwd)
            .unwrap_or_else(|| id.to_string());
        Session {
            id: id.to_string(),
            cwd,
            project_name,
            state: SessionState::Working,
            last_tool: None,
            last_tool_input: None,
            waiting_kind: None,
            error_type: None,
            idle_seconds: 0,
            summary: String::new(),
            last_activity: now,
        }
    }

    /// Build the one-line current-task summary (DV-2). Pure, local string
    /// generation from already-captured fields — does no I/O and sends nothing.
    pub fn generate_summary(&self) -> String {
        match self.state {
            SessionState::Working => match (self.last_tool.as_deref(), self.last_tool_input.as_ref()) {
                (Some(tool), Some(input)) => summarize_tool(tool, input),
                (Some(tool), None) => format!("using {tool}"),
                _ => "working".to_string(),
            },
            SessionState::Waiting => match self.waiting_kind.as_deref() {
                Some("permission_prompt") => "waiting for permission".to_string(),
                Some("idle_prompt") => "waiting for your next prompt".to_string(),
                _ => "waiting".to_string(),
            },
            SessionState::Error => match self.error_type.as_deref() {
                Some(kind) => format!("error: {kind}"),
                None => "stalled".to_string(),
            },
            SessionState::Done => "task complete".to_string(),
            SessionState::Idle => "idle".to_string(),
        }
    }
}

/// Summarize a tool call from its name and input (DV-2).
fn summarize_tool(tool: &str, input: &serde_json::Value) -> String {
    let field = |key: &str| input.get(key).and_then(|v| v.as_str());
    match tool {
        "Edit" | "Write" | "MultiEdit" | "NotebookEdit" => match field("file_path") {
            Some(path) => format!("editing {}", last_path_component(path)),
            None => format!("using {tool}"),
        },
        "Read" => match field("file_path") {
            Some(path) => format!("reading {}", last_path_component(path)),
            None => "reading a file".to_string(),
        },
        "Bash" => match field("command") {
            Some(cmd) => format!("running {}", truncate_chars(cmd, 48)),
            None => "running a command".to_string(),
        },
        "Grep" | "Glob" => match field("pattern") {
            Some(pat) => format!("searching {}", truncate_chars(pat, 32)),
            None => format!("using {tool}"),
        },
        other => format!("using {other}"),
    }
}

/// Last path component, e.g. `src/auth.ts` → `auth.ts`.
fn last_path_component(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| path.to_string())
}

/// Truncate to at most `max` chars, appending `…` if cut.
fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

/// Derive a human-friendly project label from a working directory path.
/// `/Users/dev/my-project` → `my-project`. Falls back to the raw path.
pub fn project_name_from_cwd(cwd: &str) -> String {
    std::path::Path::new(cwd)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| cwd.to_string())
}

/// Map a hook event to the state it implies, or `None` if the event does not
/// affect the monitored state (e.g. `auth_success`, unknown events).
fn map_event_to_state(event: &HookEvent) -> Option<SessionState> {
    match event.hook_event_name.as_str() {
        "PreToolUse" | "PostToolUse" => Some(SessionState::Working),
        "Notification" => match event.notification_type.as_deref() {
            Some("permission_prompt") | Some("idle_prompt") => Some(SessionState::Waiting),
            _ => None,
        },
        "StopFailure" => Some(SessionState::Error),
        "Stop" => Some(SessionState::Done),
        // The user replied, so the session is active again (FIX-4).
        "UserPromptSubmit" => Some(SessionState::Working),
        _ => None,
    }
}

/// Thread-safe manager of all monitored sessions.
#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    idle_after: Duration,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self::with_idle_after(DEFAULT_IDLE_AFTER)
    }

    pub fn with_idle_after(idle_after: Duration) -> Self {
        SessionManager {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            idle_after,
        }
    }

    /// Ingest a hook event and update the corresponding session. Returns the new
    /// state if the event changed/affected it, or `None` if the event is not
    /// state-affecting. Uses a monotonic clock injected as `now` for testability.
    pub fn handle_event_at(&self, event: &HookEvent, now: Instant) -> Option<SessionState> {
        let mapped = map_event_to_state(event)?;
        let mut sessions = self.sessions.write().expect("session lock poisoned");
        let session = sessions
            .entry(event.session_id.clone())
            .or_insert_with(|| Session::new(&event.session_id, event.cwd.clone(), now));

        session.last_activity = now;
        if let Some(cwd) = &event.cwd {
            session.cwd = Some(cwd.clone());
            session.project_name = project_name_from_cwd(cwd);
        }

        match mapped {
            SessionState::Working => {
                if event.tool_name.is_some() {
                    session.last_tool = event.tool_name.clone();
                    session.last_tool_input = event.tool_input.clone();
                }
                session.waiting_kind = None;
            }
            SessionState::Waiting => {
                session.waiting_kind = event.notification_type.clone();
            }
            SessionState::Error => {
                session.error_type = event.error_type.clone();
            }
            _ => {}
        }
        session.state = mapped;
        Some(mapped)
    }

    /// Convenience wrapper using the current instant.
    pub fn handle_event(&self, event: &HookEvent) -> Option<SessionState> {
        self.handle_event_at(event, Instant::now())
    }

    /// Transition any `Done` session that has been quiet for longer than
    /// `idle_after` into `Idle`. Returns the ids that changed. Intended to be
    /// called periodically by a timer (ST-3).
    pub fn tick_idle_at(&self, now: Instant) -> Vec<String> {
        let mut changed = Vec::new();
        let mut sessions = self.sessions.write().expect("session lock poisoned");
        for session in sessions.values_mut() {
            let elapsed = now.saturating_duration_since(session.last_activity);
            if session.state == SessionState::Done && elapsed >= self.idle_after {
                session.state = SessionState::Idle;
                changed.push(session.id.clone());
            }
        }
        changed
    }

    pub fn tick_idle(&self) -> Vec<String> {
        self.tick_idle_at(Instant::now())
    }

    /// Snapshot of all sessions, sorted by monitoring priority then project
    /// name, with `idle_seconds` filled in. Used by the widget UI (Task 5).
    pub fn snapshot(&self) -> Vec<Session> {
        let now = Instant::now();
        let sessions = self.sessions.read().expect("session lock poisoned");
        let mut out: Vec<Session> = sessions
            .values()
            .cloned()
            .map(|mut s| {
                s.idle_seconds = now.saturating_duration_since(s.last_activity).as_secs();
                s.summary = s.generate_summary();
                s
            })
            .collect();
        out.sort_by(|a, b| {
            a.state
                .priority()
                .cmp(&b.state.priority())
                .then_with(|| a.project_name.cmp(&b.project_name))
        });
        out
    }

    /// Number of tracked sessions.
    pub fn len(&self) -> usize {
        self.sessions.read().expect("session lock poisoned").len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(session_id: &str, name: &str) -> HookEvent {
        // Build via JSON so we exercise the real Deserialize path.
        serde_json::from_value(serde_json::json!({
            "session_id": session_id,
            "hook_event_name": name,
        }))
        .unwrap()
    }

    fn event_json(value: serde_json::Value) -> HookEvent {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn maps_each_event_to_expected_state() {
        let m = SessionManager::new();
        assert_eq!(m.handle_event(&event("s", "PreToolUse")), Some(SessionState::Working));
        assert_eq!(m.handle_event(&event("s", "PostToolUse")), Some(SessionState::Working));
        assert_eq!(m.handle_event(&event("s", "StopFailure")), Some(SessionState::Error));
        assert_eq!(m.handle_event(&event("s", "Stop")), Some(SessionState::Done));
        assert_eq!(m.handle_event(&event("s", "UserPromptSubmit")), Some(SessionState::Working));
    }

    #[test]
    fn notification_split_by_type() {
        let m = SessionManager::new();
        let perm = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "Notification",
            "notification_type": "permission_prompt"
        }));
        assert_eq!(m.handle_event(&perm), Some(SessionState::Waiting));

        let idle = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "Notification",
            "notification_type": "idle_prompt"
        }));
        assert_eq!(m.handle_event(&idle), Some(SessionState::Waiting));

        // Non-monitored notification types do not change state.
        let auth = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "Notification",
            "notification_type": "auth_success"
        }));
        assert_eq!(m.handle_event(&auth), None);
    }

    #[test]
    fn unknown_events_are_ignored() {
        let m = SessionManager::new();
        assert_eq!(m.handle_event(&event("s", "SessionStart")), None);
        assert_eq!(m.handle_event(&event("s", "FileChanged")), None);
        assert!(m.is_empty(), "ignored events must not create sessions");
    }

    #[test]
    fn sessions_are_tracked_independently() {
        let m = SessionManager::new();
        m.handle_event(&event("a", "PreToolUse"));
        m.handle_event(&event("b", "Stop"));
        assert_eq!(m.len(), 2);
        let snap = m.snapshot();
        let a = snap.iter().find(|s| s.id == "a").unwrap();
        let b = snap.iter().find(|s| s.id == "b").unwrap();
        assert_eq!(a.state, SessionState::Working);
        assert_eq!(b.state, SessionState::Done);
    }

    #[test]
    fn project_name_derived_from_cwd() {
        let m = SessionManager::new();
        let ev = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "PreToolUse",
            "cwd": "/Users/dev/my-project", "tool_name": "Edit",
            "tool_input": {"file_path": "src/main.rs"}
        }));
        m.handle_event(&ev);
        let snap = m.snapshot();
        assert_eq!(snap[0].project_name, "my-project");
        assert_eq!(snap[0].last_tool.as_deref(), Some("Edit"));
    }

    #[test]
    fn done_transitions_to_idle_after_timeout() {
        let m = SessionManager::with_idle_after(Duration::from_secs(30));
        let t0 = Instant::now();
        m.handle_event_at(&event("s", "Stop"), t0);
        // Not yet idle right after Done.
        assert!(m.tick_idle_at(t0).is_empty());
        // After the timeout, it flips to Idle.
        let later = t0 + Duration::from_secs(31);
        assert_eq!(m.tick_idle_at(later), vec!["s".to_string()]);
        assert_eq!(m.snapshot()[0].state, SessionState::Idle);
    }

    #[test]
    fn snapshot_sorted_by_priority() {
        let m = SessionManager::new();
        m.handle_event(&event("done", "Stop"));
        m.handle_event(&event("working", "PreToolUse"));
        let waiting = event_json(serde_json::json!({
            "session_id": "waiting", "hook_event_name": "Notification",
            "notification_type": "permission_prompt"
        }));
        m.handle_event(&waiting);
        let snap = m.snapshot();
        // Waiting (priority 1) first, then Done (3), then Working (4).
        assert_eq!(snap[0].id, "waiting");
        assert_eq!(snap[1].id, "done");
        assert_eq!(snap[2].id, "working");
    }

    #[test]
    fn generates_one_line_summary_from_tool_input() {
        let m = SessionManager::new();
        let edit = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "PreToolUse",
            "tool_name": "Edit", "tool_input": {"file_path": "src/auth/login.ts"}
        }));
        m.handle_event(&edit);
        assert_eq!(m.snapshot()[0].summary, "editing login.ts");

        let bash = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "PreToolUse",
            "tool_name": "Bash", "tool_input": {"command": "npm test"}
        }));
        m.handle_event(&bash);
        assert_eq!(m.snapshot()[0].summary, "running npm test");
    }

    #[test]
    fn summary_covers_waiting_error_done() {
        let perm = SessionManager::new();
        perm.handle_event(&event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "Notification", "notification_type": "permission_prompt"
        })));
        assert_eq!(perm.snapshot()[0].summary, "waiting for permission");

        let err = SessionManager::new();
        err.handle_event(&event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "StopFailure", "error_type": "rate_limit"
        })));
        assert_eq!(err.snapshot()[0].summary, "error: rate_limit");

        let done = SessionManager::new();
        done.handle_event(&event("s", "Stop"));
        assert_eq!(done.snapshot()[0].summary, "task complete");
    }

    #[test]
    fn long_bash_command_is_truncated() {
        let m = SessionManager::new();
        let long = "x".repeat(100);
        m.handle_event(&event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "PreToolUse",
            "tool_name": "Bash", "tool_input": {"command": long}
        })));
        let summary = m.snapshot().remove(0).summary;
        assert!(summary.ends_with('…'));
        assert!(summary.chars().count() <= "running ".chars().count() + 49);
    }

    #[test]
    fn priority_and_notifiable() {
        assert!(SessionState::Waiting.priority() < SessionState::Working.priority());
        assert!(SessionState::Waiting.is_notifiable());
        assert!(!SessionState::Working.is_notifiable());
        assert!(!SessionState::Idle.is_notifiable());
    }
}
