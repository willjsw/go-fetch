//! Per-session state machine (Task 4 / GF-9).
//!
//! Converts verified Claude Code hook events into GoFetch's five-state model and
//! tracks one [`Session`] per `session_id` (DI-3). The event → state mapping
//! follows `docs/HOOK_SPEC_VERIFIED.md` §3 — in particular the de-risk
//! corrections:
//!   - `Stop` fires on **every** response turn, so it maps to `Done` but the
//!     notification layer (Task 7) debounces it (FIX-1).
//!   - `Notification` is subscribed only for the `permission_prompt` /
//!     `idle_prompt` matchers (the precise "waiting for you" signals, A4). The
//!     matcher filters which notifications fire; the **body does not carry the
//!     type** (only `message`), so any `Notification` we receive is a waiting
//!     signal regardless of whether a `notification_type` field is present.
//!   - `UserPromptSubmit` means the user replied, so the session goes back to
//!     active (FIX-4).
//!
//! The manager is `Clone` (cheap `Arc` clone) and thread-safe so it can be
//! shared as axum state and read by the widget UI (Task 5).

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::server::HookEvent;

/// Default time after a `Done` turn with no further activity before a session is
/// considered idle (ST-3). The idle state is widget-side, not a hook event.
const DEFAULT_IDLE_AFTER: Duration = Duration::from_secs(60);

/// Default time after a session was **last seen alive** before it is evicted
/// (SL-3). "Last seen" is refreshed both by hook events and by the pre-existing
/// poll spotting the session in `claude agents --json` (SL-4), so a still-alive
/// session is never dropped — only one whose process is actually gone (and which
/// emitted no `SessionEnd`: Ctrl+C / force-close / SIGKILL / crash, PRD §2.1 F3)
/// disappears, ~5 minutes after it dies.
const DEFAULT_STALE_AFTER: Duration = Duration::from_secs(5 * 60);

/// How long a `Working` session may emit no hook event before GoFetch flags it
/// `inactive` — a **visual-only** "may need you" hint for the interrupt /
/// IDE-permission blind spots (Claude Code fires no hook on user interrupt, and
/// the VS Code extension fires no permission `Notification` — see README "Known
/// limitations"). Two thresholds: a shorter one between tool calls (180s), and a
/// longer one while a tool is in flight (280s), since a slow build/test
/// legitimately emits nothing while it runs. Both stay under [`DEFAULT_STALE_AFTER`]
/// (300s) so a flagged session is still tracked — it is flagged inactive before it
/// could be stale-evicted, even when the pre-existing poll isn't refreshing
/// `last_seen`. Heuristic: this can never *confirm* an interrupt, so it never
/// changes state and never notifies.
const WORKING_INACTIVE_AFTER: Duration = Duration::from_secs(180);
const WORKING_INACTIVE_AFTER_MID_TOOL: Duration = Duration::from_secs(280);

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
    /// Whether the session's current activity state is still **unconfirmed**
    /// (SL-1/SL-5). Set when we know the session exists — via `SessionStart`, or
    /// later via pre-existing detection (SL-4) — but no real activity event has
    /// arrived yet to pin down its state. While `pending`, the widget shows a
    /// neutral "detected" expression and **no notification fires**; the first
    /// real hook event clears it. The five-state engine is unchanged: `pending`
    /// is a display-layer flag layered on a non-notifiable underlying state.
    pub pending: bool,
    /// Visual-only soft flag: a `Working` session that has emitted no hook event
    /// for a while. Because Claude Code fires no hook on user interrupt, and the
    /// VS Code extension fires no permission `Notification`, such a session would
    /// otherwise sit at a misleading `Working` until stale-evicted. We cannot
    /// *confirm* an interrupt (there is no signal), so this is a heuristic "no
    /// activity — may need you" hint: `state` stays `Working` (priority unchanged)
    /// and **no notification fires**. Set by [`SessionManager::tick_stale_working`],
    /// cleared by any fresh hook event. The widget dims/annotates the card.
    #[serde(default)]
    pub inactive: bool,
    /// Whether a tool is currently in flight (`PreToolUse` seen, no `PostToolUse`
    /// yet). A long-running tool legitimately emits nothing while it runs, so the
    /// inactivity threshold is longer while mid-tool — avoids flagging a slow
    /// build/test as inactive. Internal heuristic input; not serialized.
    #[serde(skip)]
    pub mid_tool: bool,
    /// Layer 2 (GF-108): for a sub-agent node, the `session_id` of its parent
    /// session. Sub-agents share the parent's `session_id`, so they are tracked
    /// in a separate map and carry this link for the widget to nest them.
    /// `None` for a top-level session.
    #[serde(default)]
    pub parent_session_id: Option<String>,
    /// Layer 2: the sub-agent's `agent_id` (present only for sub-agent nodes).
    #[serde(default)]
    pub agent_id: Option<String>,
    /// Instant of the last hook event for this session — drives the Done→Idle
    /// neglect timer (ST-3) and `idle_seconds`. Not serialized.
    #[serde(skip)]
    pub last_activity: Instant,
    /// Instant the session was last confirmed alive — by a hook event **or** by
    /// the pre-existing poll seeing it in `claude agents --json` (SL-4). Drives
    /// eviction (SL-3), kept separate from `last_activity` so the poll keeping a
    /// session alive doesn't reset its neglect timer. Not serialized.
    #[serde(skip)]
    pub last_seen: Instant,
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
            pending: false,
            inactive: false,
            mid_tool: false,
            parent_session_id: None,
            agent_id: None,
            last_activity: now,
            last_seen: now,
        }
    }

    /// Build the one-line current-task summary (DV-2). Pure, local string
    /// generation from already-captured fields — does no I/O and sends nothing.
    pub fn generate_summary(&self) -> String {
        if self.pending {
            // State not yet confirmed (just started / pre-existing) — SL-5.
            return "detected — awaiting activity".to_string();
        }
        match self.state {
            // A `Working` session flagged inactive (no hook events for a while)
            // shows the heuristic hint instead of the last tool — it may have been
            // interrupted or be waiting on an IDE permission prompt we never saw.
            SessionState::Working if self.inactive => {
                format!("no activity for {} — may need you", fmt_elapsed(self.idle_seconds))
            }
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

/// Compact elapsed-time label for summaries, e.g. `45s` / `3m`.
fn fmt_elapsed(secs: u64) -> String {
    if secs >= 60 {
        format!("{}m", secs / 60)
    } else {
        format!("{secs}s")
    }
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

/// Composite id for a sub-agent node (Layer 2 / GF-108). Sub-agents share their
/// parent's `session_id`, so the display id combines it with the `agent_id`.
/// The separator is unlikely to appear in either id.
pub fn subagent_id(session_id: &str, agent_id: &str) -> String {
    format!("{session_id}\u{1}agent\u{1}{agent_id}")
}

/// Map a hook event to the state it implies, or `None` if the event does not
/// affect the monitored state (e.g. `auth_success`, unknown events).
fn map_event_to_state(event: &HookEvent) -> Option<SessionState> {
    match event.hook_event_name.as_str() {
        "PreToolUse" | "PostToolUse" => Some(SessionState::Working),
        "Notification" => match event.notification_type.as_deref() {
            // Explicitly-typed waiting notifications — kept for forward-compat in
            // case a future Claude Code version echoes the type into the body.
            Some("permission_prompt") | Some("idle_prompt") => Some(SessionState::Waiting),
            // The real Claude Code `Notification` body carries only `message`;
            // there is NO `notification_type` field — the type is matched by the
            // hook `matcher` (verified: code.claude.com/docs/en/hooks). We only
            // ever subscribe to the `permission_prompt` / `idle_prompt` matchers
            // (hook_installer.rs), so any `Notification` that reaches us is a
            // "waiting for you" signal → Waiting. Without this, the field was
            // always `None` and the session never entered Waiting.
            None => Some(SessionState::Waiting),
            // A different, explicitly-typed notification we did not subscribe to
            // (e.g. `auth_success`) — leave the state unchanged.
            Some(_) => None,
        },
        "StopFailure" => Some(SessionState::Error),
        "Stop" => Some(SessionState::Done),
        // The user replied, so the session is active again (FIX-4).
        "UserPromptSubmit" => Some(SessionState::Working),
        _ => None,
    }
}

/// Outcome of ingesting one hook event. Distinguishes a state change/creation
/// from a session **removal** (so the UI refreshes when a card disappears) and
/// from a no-op (so we don't churn the widget on irrelevant events).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventOutcome {
    /// The session was created or its state changed; carries the new state.
    Changed(SessionState),
    /// The session ended and was removed (`SessionEnd`).
    Removed,
    /// The event did not affect any tracked session.
    Ignored,
}

/// Thread-safe manager of all monitored sessions.
#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    /// Layer 2 (GF-108): sub-agent nodes, keyed by `subagent_id(session_id,
    /// agent_id)`. Kept **separate** from `sessions` so the verified five-state
    /// engine, notifications, sorting, and eviction for top-level sessions stay
    /// exactly as they were — sub-agents are display-only and never notify.
    subagents: Arc<RwLock<HashMap<String, Session>>>,
    /// Sessions the user explicitly dismissed (Stop monitoring). The
    /// pre-existing poll won't re-seed these, so a manually-removed session
    /// stays gone even while its process is still alive — until a real hook
    /// event for it arrives, which un-dismisses it (it's active again, GF-106).
    /// Persisted to disk (GF-107) so a dismissal survives a restart: otherwise
    /// a fresh run would lose this set and the poll would re-seed the still-alive
    /// session, making the dismissed card reappear.
    dismissed: Arc<RwLock<HashSet<String>>>,
    /// Where `dismissed` is persisted. `None` (the default / test path) keeps the
    /// set purely in-memory — no I/O — so tests stay pure (GF-107).
    dismissed_path: Option<PathBuf>,
    idle_after: Duration,
    stale_after: Duration,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self::with_timeouts(DEFAULT_IDLE_AFTER, DEFAULT_STALE_AFTER)
    }

    pub fn with_idle_after(idle_after: Duration) -> Self {
        Self::with_timeouts(idle_after, DEFAULT_STALE_AFTER)
    }

    pub fn with_timeouts(idle_after: Duration, stale_after: Duration) -> Self {
        SessionManager {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            subagents: Arc::new(RwLock::new(HashMap::new())),
            dismissed: Arc::new(RwLock::new(HashSet::new())),
            dismissed_path: None,
            idle_after,
            stale_after,
        }
    }

    /// Production constructor (GF-107): like [`Self::new`] but loads the set of
    /// previously-dismissed session ids from `path` and persists future changes
    /// there. `None` degrades to in-memory only (e.g. no resolvable home dir).
    /// Set the path before any clone so all clones share it.
    pub fn with_persistence(path: Option<PathBuf>) -> Self {
        let mut manager = Self::new();
        if let Some(path) = path {
            if let Some(loaded) = read_dismissed(&path) {
                *manager.dismissed.write().expect("dismissed lock poisoned") = loaded;
            }
            manager.dismissed_path = Some(path);
        }
        manager
    }

    /// Persist the dismissed set (best-effort). Holds the write lock across the
    /// file write so concurrent savers — the hook thread un-dismissing vs. the
    /// poll thread pruning — can't interleave and tear the file. Dismissals are
    /// rare and the set is tiny, so holding the lock briefly is cheap. A no-op
    /// when there is no path (tests / in-memory mode).
    fn save_dismissed(&self) {
        let Some(path) = self.dismissed_path.as_ref() else {
            return;
        };
        let set = self.dismissed.write().expect("dismissed lock poisoned");
        let mut ids: Vec<String> = set.iter().cloned().collect();
        ids.sort(); // deterministic file, avoids needless churn
        if let Err(e) = write_dismissed(path, &ids) {
            eprintln!(
                "[gofetch] failed to save dismissed sessions to {}: {e}",
                path.display()
            );
        }
    }

    /// Ingest a hook event and update the corresponding session. Lifecycle
    /// events are handled specially: `SessionStart` creates the session in a
    /// neutral `pending` state (SL-1), `SessionEnd` removes it (SL-2). All other
    /// events map to one of the five states as before. Uses a monotonic clock
    /// injected as `now` for testability.
    pub fn handle_event_at(&self, event: &HookEvent, now: Instant) -> EventOutcome {
        // Any real hook activity un-dismisses a user-dismissed session, so a
        // session the user removed reappears once it becomes active again
        // (GF-106). GoFetch only receives the hooks it registered, all of which
        // are genuine activity, so this is safe to do for every event. Persist
        // only when something actually changed (GF-107) — un-dismissal is rare,
        // so this never writes the file on routine PreToolUse/PostToolUse churn.
        let was_dismissed = self
            .dismissed
            .write()
            .expect("dismissed lock poisoned")
            .remove(&event.session_id);
        if was_dismissed {
            self.save_dismissed();
        }

        // Layer 2 (GF-108): an event carrying `agent_id` comes from a sub-agent.
        // Route it to the separate sub-agent map so it never overwrites the
        // parent session (which shares the same `session_id`) and never fires a
        // notification. This activates only when the payload actually includes
        // `agent_id` (runtime-verified via the GF-114 probe) — otherwise nothing
        // here runs and behavior is identical to Layer 1.
        if event.agent_id.is_some() {
            return self.handle_subagent_event_at(event, now);
        }

        match event.hook_event_name.as_str() {
            "SessionStart" => {
                let mut sessions = self.sessions.write().expect("session lock poisoned");
                let is_new = !sessions.contains_key(&event.session_id);
                let session = sessions
                    .entry(event.session_id.clone())
                    .or_insert_with(|| Session::new(&event.session_id, event.cwd.clone(), now));
                session.last_activity = now;
                session.last_seen = now;
                if let Some(cwd) = &event.cwd {
                    session.cwd = Some(cwd.clone());
                    session.project_name = project_name_from_cwd(cwd);
                }
                // Only a brand-new session starts unconfirmed; a SessionStart for
                // a session we already track (resume/clear/compact) keeps its
                // state so we don't flicker an active session back to neutral.
                if is_new {
                    session.pending = true;
                    session.state = SessionState::Idle; // non-notifiable neutral
                }
                return EventOutcome::Changed(session.state);
            }
            "SessionEnd" => {
                let removed = self
                    .sessions
                    .write()
                    .expect("session lock poisoned")
                    .remove(&event.session_id)
                    .is_some();
                // Layer 2: a parent ending takes its sub-agents with it.
                self.remove_subagents_of(&event.session_id);
                return if removed {
                    EventOutcome::Removed
                } else {
                    EventOutcome::Ignored
                };
            }
            _ => {}
        }

        let Some(mapped) = map_event_to_state(event) else {
            return EventOutcome::Ignored;
        };
        let mut sessions = self.sessions.write().expect("session lock poisoned");
        let session = sessions
            .entry(event.session_id.clone())
            .or_insert_with(|| Session::new(&event.session_id, event.cwd.clone(), now));

        session.last_activity = now;
        session.last_seen = now;
        // A real activity event confirms the session's state (clears SL-5 pending)
        // and clears the inactivity hint — there was activity after all.
        session.pending = false;
        session.inactive = false;
        // Reset mid-tool by default; the Working arm re-arms it for `PreToolUse`.
        session.mid_tool = false;
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
                // A tool is "in flight" only between its `PreToolUse` and the
                // matching `PostToolUse`; used to lengthen the inactivity
                // threshold so a slow tool isn't mistaken for an interrupt.
                session.mid_tool = event.hook_event_name == "PreToolUse";
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
        EventOutcome::Changed(mapped)
    }

    /// Convenience wrapper using the current instant.
    pub fn handle_event(&self, event: &HookEvent) -> EventOutcome {
        self.handle_event_at(event, Instant::now())
    }

    /// Layer 2 (GF-108): ingest a sub-agent event into the separate sub-agent
    /// map. Sub-agents are **display-only** — shown as `Working` while active and
    /// removed on `SubagentStop` (or stale eviction). They never touch the parent
    /// session's state and never notify. The returned id-to-notify is the
    /// composite sub-agent id so the notifier resolves to this (non-notifiable)
    /// node, never the parent.
    fn handle_subagent_event_at(&self, event: &HookEvent, now: Instant) -> EventOutcome {
        let Some(agent_id) = event.agent_id.as_deref() else {
            return EventOutcome::Ignored;
        };
        let parent_id = event.session_id.clone();
        let key = subagent_id(&parent_id, agent_id);

        // Keep the parent alive while a child works (without resetting its
        // neglect timer) — a busy sub-agent implies the session is still running.
        if let Some(parent) = self
            .sessions
            .write()
            .expect("session lock poisoned")
            .get_mut(&parent_id)
        {
            parent.last_seen = now;
        }

        // SubagentStop ends the child node.
        if event.hook_event_name == "SubagentStop" {
            let removed = self
                .subagents
                .write()
                .expect("subagent lock poisoned")
                .remove(&key)
                .is_some();
            return if removed {
                EventOutcome::Removed
            } else {
                EventOutcome::Ignored
            };
        }

        // SubagentStart, or a tool event fired inside the sub-agent → show/update
        // the child as Working.
        let mut subs = self.subagents.write().expect("subagent lock poisoned");
        let sub = subs
            .entry(key.clone())
            .or_insert_with(|| Session::new(&key, event.cwd.clone(), now));
        sub.last_activity = now;
        sub.last_seen = now;
        sub.pending = false;
        sub.parent_session_id = Some(parent_id);
        sub.agent_id = Some(agent_id.to_string());
        // Label the node by its agent type (e.g. "Explore"), else "subagent".
        sub.project_name = event
            .agent_type
            .clone()
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "subagent".to_string());
        if event.tool_name.is_some() {
            sub.last_tool = event.tool_name.clone();
            sub.last_tool_input = event.tool_input.clone();
        }
        sub.state = SessionState::Working;
        EventOutcome::Changed(SessionState::Working)
    }

    /// Remove all sub-agent nodes belonging to `parent_id` (Layer 2 cleanup).
    fn remove_subagents_of(&self, parent_id: &str) {
        self.subagents
            .write()
            .expect("subagent lock poisoned")
            .retain(|_, s| s.parent_session_id.as_deref() != Some(parent_id));
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

    /// Flag any `Working` session that has emitted no hook event for longer than
    /// the inactivity threshold as `inactive` — a **visual-only** "may need you"
    /// hint for the interrupt / IDE-permission blind spots. Never changes `state`
    /// and never notifies: the session stays `Working` (a non-notifiable state),
    /// only the flag flips, so the widget can dim/annotate the card without firing
    /// an OS notification. A longer threshold applies while a tool is in flight so
    /// a slow build/test isn't mistaken for inactivity. Returns the ids that
    /// **newly** flipped to inactive (so the caller can refresh the widget); an
    /// already-inactive session is not reported again. Heuristic — it cannot
    /// *confirm* an interrupt, only that no events have arrived. Called by the
    /// idle ticker (lib.rs). `pending` sessions are skipped (state unconfirmed).
    pub fn tick_stale_working_at(&self, now: Instant) -> Vec<String> {
        let mut changed = Vec::new();
        let mut sessions = self.sessions.write().expect("session lock poisoned");
        for session in sessions.values_mut() {
            if session.state != SessionState::Working || session.pending || session.inactive {
                continue;
            }
            let threshold = if session.mid_tool {
                WORKING_INACTIVE_AFTER_MID_TOOL
            } else {
                WORKING_INACTIVE_AFTER
            };
            if now.saturating_duration_since(session.last_activity) >= threshold {
                session.inactive = true;
                changed.push(session.id.clone());
            }
        }
        changed
    }

    pub fn tick_stale_working(&self) -> Vec<String> {
        self.tick_stale_working_at(Instant::now())
    }

    /// Evict sessions with no event for longer than `stale_after` (SL-3 safety
    /// net for a missed `SessionEnd`). Returns the evicted ids so the caller can
    /// refresh the widget and clear notification dedup. Time-based only — this
    /// is the layer that works with hooks alone; PID-based liveness (SL-4) adds
    /// faster eviction when the polling layer is present.
    pub fn tick_evict_at(&self, now: Instant) -> Vec<String> {
        let mut dead: Vec<String> = {
            let mut sessions = self.sessions.write().expect("session lock poisoned");
            let dead: Vec<String> = sessions
                .values()
                .filter(|s| now.saturating_duration_since(s.last_seen) >= self.stale_after)
                .map(|s| s.id.clone())
                .collect();
            for id in &dead {
                sessions.remove(id);
            }
            dead
        };
        // Layer 2: evict stale sub-agents and orphans whose parent is now gone,
        // so a missed SubagentStop (or a parent eviction) can't leave a dangling
        // child node behind.
        let alive_parents: HashSet<String> = self
            .sessions
            .read()
            .expect("session lock poisoned")
            .keys()
            .cloned()
            .collect();
        let mut subs = self.subagents.write().expect("subagent lock poisoned");
        let dead_subs: Vec<String> = subs
            .values()
            .filter(|s| {
                now.saturating_duration_since(s.last_seen) >= self.stale_after
                    || s.parent_session_id
                        .as_deref()
                        .map(|p| !alive_parents.contains(p))
                        .unwrap_or(true)
            })
            .map(|s| s.id.clone())
            .collect();
        for id in &dead_subs {
            subs.remove(id);
        }
        dead.extend(dead_subs);
        dead
    }

    pub fn tick_evict(&self) -> Vec<String> {
        self.tick_evict_at(Instant::now())
    }

    /// Seed a pre-existing session discovered by polling (SL-4) — but only if we
    /// don't already track it (**hook-first**, SL-5). The seeded session is
    /// `pending` (state unconfirmed) and non-notifiable; a later real hook event
    /// confirms its state and clears `pending`. Returns `true` if newly seeded.
    pub fn seed_pending(&self, session_id: &str, cwd: Option<String>, now: Instant) -> bool {
        if self
            .dismissed
            .read()
            .expect("dismissed lock poisoned")
            .contains(session_id)
        {
            return false; // user dismissed this session — don't re-seed it (GF-106)
        }
        let mut sessions = self.sessions.write().expect("session lock poisoned");
        if sessions.contains_key(session_id) {
            return false; // hook-tracked (or already seeded) session wins
        }
        let mut session = Session::new(session_id, cwd, now);
        session.pending = true;
        session.state = SessionState::Idle; // neutral, non-notifiable
        sessions.insert(session_id.to_string(), session);
        true
    }

    /// Refresh a tracked session's liveness timestamp because the pre-existing
    /// poll just saw it alive (SL-4). Returns `true` if it was tracked. Touches
    /// only `last_seen` — never `state` or `last_activity` — so keeping a session
    /// alive via polling does not reset its Done→Idle neglect timer (SL-3).
    pub fn touch_seen(&self, session_id: &str, now: Instant) -> bool {
        let mut sessions = self.sessions.write().expect("session lock poisoned");
        if let Some(session) = sessions.get_mut(session_id) {
            session.last_seen = now;
            true
        } else {
            false
        }
    }

    /// Remove a session entirely. Returns `true` if it was present. Unlike
    /// `tick_idle` (which only demotes to `Idle`), this drops the entry so the
    /// widget card disappears — used on `SessionEnd` (SL-2) and liveness
    /// eviction (SL-3). This is the first eviction path in the manager; before
    /// Sprint 2 a session could only ever reach `Idle` and lingered forever.
    pub fn remove(&self, session_id: &str) -> bool {
        self.sessions
            .write()
            .expect("session lock poisoned")
            .remove(session_id)
            .is_some()
    }

    /// User-initiated removal ("Stop monitoring", GF-106). Removes the session
    /// AND remembers its id so the pre-existing poll won't immediately re-seed
    /// it (unlike `remove`, used for SessionEnd/eviction). The session reappears
    /// only if a real hook event for it arrives later (handled in
    /// `handle_event_at`, which un-dismisses). Returns whether it was present.
    pub fn dismiss(&self, session_id: &str) -> bool {
        self.dismissed
            .write()
            .expect("dismissed lock poisoned")
            .insert(session_id.to_string());
        self.save_dismissed(); // remember across restart (GF-107)
        self.remove_subagents_of(session_id); // Layer 2: drop its children too
        self.remove(session_id)
    }

    /// Drop dismissed ids whose sessions are no longer alive, given the set of
    /// currently-alive session ids from the pre-existing poll (GF-107). Keeps
    /// the persisted set bounded to live-but-dismissed sessions: once a dismissed
    /// session's process is gone (absent from `claude agents --json`), there is
    /// nothing left to re-seed, so its id is just dead weight in the file. Only
    /// call with an authoritative poll snapshot (the same basis the seed/touch
    /// loop already trusts); skips persistence when nothing changed. Returns
    /// whether the set changed.
    pub fn prune_dismissed(&self, alive: &HashSet<String>) -> bool {
        let changed = {
            let mut set = self.dismissed.write().expect("dismissed lock poisoned");
            let before = set.len();
            set.retain(|id| alive.contains(id));
            set.len() != before
        };
        if changed {
            self.save_dismissed();
        }
        changed
    }

    /// Snapshot of all sessions, sorted by monitoring priority then project
    /// name, with `idle_seconds` filled in. Used by the widget UI (Task 5).
    pub fn snapshot(&self) -> Vec<Session> {
        let now = Instant::now();
        let fill = |mut s: Session| {
            s.idle_seconds = now.saturating_duration_since(s.last_activity).as_secs();
            s.summary = s.generate_summary();
            s
        };
        let sessions = self.sessions.read().expect("session lock poisoned");
        let mut out: Vec<Session> = sessions.values().cloned().map(fill).collect();
        // Layer 2: include sub-agent nodes (display-only); the widget nests them
        // under their parent via `parent_session_id`. Cards mode filters them out.
        let subs = self.subagents.read().expect("subagent lock poisoned");
        out.extend(subs.values().cloned().map(fill));
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

    /// Whether any session warrants keeping the widget visible (auto-hide, WC-5).
    /// A session counts as active if it is in any non-`Idle` state **or** is
    /// `pending` (detected but unconfirmed, SL-5). A freshly-detected session is
    /// not "idle/neglected", so it must keep the widget shown — otherwise
    /// auto-hide would hide the widget while pre-existing sessions still read
    /// "Detecting…", re-hiding it right after the tray re-opens it (GF-102).
    pub fn has_active(&self) -> bool {
        self.sessions
            .read()
            .expect("session lock poisoned")
            .values()
            .any(|s| s.state != SessionState::Idle || s.pending)
            // Layer 2: an active sub-agent keeps the widget shown too.
            || !self
                .subagents
                .read()
                .expect("subagent lock poisoned")
                .is_empty()
    }
}

/// Resolve the file that persists user-dismissed session ids (GF-107). Sibling
/// of `settings.json` under `~/.gofetch`. `GOFETCH_DISMISSED_PATH` overrides it
/// (tests / manual runs). `None` when no home dir is resolvable, which degrades
/// the manager to in-memory dismissals.
pub fn dismissed_path() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("GOFETCH_DISMISSED_PATH") {
        return Some(PathBuf::from(p));
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| PathBuf::from(h).join(".gofetch").join("dismissed.json"))
}

/// Read the persisted dismissed-id set. `None` if the file is missing or invalid
/// (degrade to an empty set — a corrupt file must never block startup).
fn read_dismissed(path: &PathBuf) -> Option<HashSet<String>> {
    let text = std::fs::read_to_string(path).ok()?;
    let ids: Vec<String> = serde_json::from_str(&text).ok()?;
    Some(ids.into_iter().collect())
}

/// Persist the dismissed-id set atomically (write temp + rename) so a concurrent
/// reader/saver never sees a half-written file.
fn write_dismissed(path: &PathBuf, ids: &[String]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(ids).unwrap_or_else(|_| "[]".to_string());
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text + "\n")?;
    std::fs::rename(&tmp, path)
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
        use EventOutcome::Changed;
        let m = SessionManager::new();
        assert_eq!(m.handle_event(&event("s", "PreToolUse")), Changed(SessionState::Working));
        assert_eq!(m.handle_event(&event("s", "PostToolUse")), Changed(SessionState::Working));
        assert_eq!(m.handle_event(&event("s", "StopFailure")), Changed(SessionState::Error));
        assert_eq!(m.handle_event(&event("s", "Stop")), Changed(SessionState::Done));
        assert_eq!(m.handle_event(&event("s", "UserPromptSubmit")), Changed(SessionState::Working));
    }

    #[test]
    fn notification_split_by_type() {
        let m = SessionManager::new();
        let perm = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "Notification",
            "notification_type": "permission_prompt"
        }));
        assert_eq!(m.handle_event(&perm), EventOutcome::Changed(SessionState::Waiting));

        let idle = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "Notification",
            "notification_type": "idle_prompt"
        }));
        assert_eq!(m.handle_event(&idle), EventOutcome::Changed(SessionState::Waiting));

        // Non-monitored notification types do not change state.
        let auth = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "Notification",
            "notification_type": "auth_success"
        }));
        assert_eq!(m.handle_event(&auth), EventOutcome::Ignored);
    }

    /// Regression: the real Claude Code `Notification` body has NO
    /// `notification_type` field — only `message` — and the waiting type is
    /// matched by the hook `matcher`, not echoed into the payload. Since GoFetch
    /// only subscribes to the `permission_prompt`/`idle_prompt` matchers, such a
    /// (type-less) Notification must still transition the session to Waiting.
    /// Previously this fell through to `Ignored`, so the widget never showed
    /// "waiting for permission".
    #[test]
    fn notification_without_type_field_is_waiting() {
        let m = SessionManager::new();
        let perm = event_json(serde_json::json!({
            "session_id": "s",
            "hook_event_name": "Notification",
            "cwd": "/x/proj",
            "message": "Claude needs your permission to use Bash"
        }));
        assert_eq!(
            m.handle_event(&perm),
            EventOutcome::Changed(SessionState::Waiting),
            "a Notification with no notification_type must still be Waiting"
        );
        let snap = m.snapshot();
        assert_eq!(snap[0].state, SessionState::Waiting);
        // No type field → generic waiting summary (best-effort), never a crash.
        assert_eq!(snap[0].summary, "waiting");
    }

    #[test]
    fn unknown_events_are_ignored() {
        let m = SessionManager::new();
        // Genuinely unmapped lifecycle/other events create nothing.
        assert_eq!(m.handle_event(&event("s", "FileChanged")), EventOutcome::Ignored);
        assert_eq!(m.handle_event(&event("s", "CwdChanged")), EventOutcome::Ignored);
        assert!(m.is_empty(), "ignored events must not create sessions");
    }

    /// Layer 2 (GF-108): an event carrying `agent_id` becomes a separate
    /// sub-agent node and must NOT overwrite the parent session (they share a
    /// `session_id`). The node links back via `parent_session_id`.
    #[test]
    fn subagent_events_route_to_separate_nodes() {
        let m = SessionManager::new();
        // Parent session is Working on Bash.
        m.handle_event(&event_json(serde_json::json!({
            "session_id": "parent", "hook_event_name": "PreToolUse",
            "tool_name": "Bash", "tool_input": {"command": "ls"}, "cwd": "/x/proj"
        })));
        // A sub-agent tool event: same session_id, carries agent_id + agent_type.
        let out = m.handle_event(&event_json(serde_json::json!({
            "session_id": "parent", "hook_event_name": "PreToolUse",
            "tool_name": "Read", "tool_input": {"file_path": "a.rs"},
            "agent_id": "a1", "agent_type": "Explore"
        })));
        assert_eq!(out, EventOutcome::Changed(SessionState::Working));

        let snap = m.snapshot();
        let parent = snap.iter().find(|s| s.id == "parent").expect("parent present");
        assert_eq!(
            parent.last_tool.as_deref(),
            Some("Bash"),
            "parent must NOT be overwritten by the sub-agent's tool"
        );
        assert!(parent.parent_session_id.is_none());

        let sub = snap
            .iter()
            .find(|s| s.parent_session_id.as_deref() == Some("parent"))
            .expect("a separate sub-agent node exists");
        assert_eq!(sub.agent_id.as_deref(), Some("a1"));
        assert_eq!(sub.project_name, "Explore");
        assert_eq!(sub.state, SessionState::Working);
        assert_eq!(sub.summary, "reading a.rs");
        assert_eq!(m.len(), 1, "len() counts only top-level sessions");
    }

    /// SubagentStop removes only its node; SessionEnd of the parent clears all
    /// of its remaining sub-agents (Layer 2 cleanup).
    #[test]
    fn subagent_stop_and_parent_end_clear_children() {
        let m = SessionManager::new();
        let subcount = |m: &SessionManager| {
            m.snapshot().iter().filter(|s| s.parent_session_id.is_some()).count()
        };
        m.handle_event(&event_json(serde_json::json!({
            "session_id": "p", "hook_event_name": "PreToolUse",
            "tool_name": "Bash", "agent_id": "a1", "agent_type": "Explore"
        })));
        m.handle_event(&event_json(serde_json::json!({
            "session_id": "p", "hook_event_name": "PreToolUse",
            "tool_name": "Edit", "agent_id": "a2", "agent_type": "Plan"
        })));
        assert_eq!(subcount(&m), 2);

        // SubagentStop for a1 drops only that child.
        let out = m.handle_event(&event_json(serde_json::json!({
            "session_id": "p", "hook_event_name": "SubagentStop", "agent_id": "a1"
        })));
        assert_eq!(out, EventOutcome::Removed);
        assert_eq!(subcount(&m), 1);

        // Create the top-level parent, then end it — its remaining child clears.
        m.handle_event(&event_json(serde_json::json!({
            "session_id": "p", "hook_event_name": "PreToolUse", "tool_name": "Bash"
        })));
        m.handle_event(&event_json(serde_json::json!({
            "session_id": "p", "hook_event_name": "SessionEnd", "reason": "clear"
        })));
        assert_eq!(subcount(&m), 0, "SessionEnd clears the parent's sub-agents");
    }

    #[test]
    fn session_start_creates_pending_session() {
        let m = SessionManager::new();
        let ev = event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "SessionStart",
            "source": "startup", "cwd": "/x/proj"
        }));
        assert!(matches!(m.handle_event(&ev), EventOutcome::Changed(_)));
        let snap = m.snapshot();
        assert_eq!(snap.len(), 1);
        assert!(snap[0].pending, "a freshly started session is unconfirmed (SL-1)");
        assert_eq!(snap[0].project_name, "proj");
        assert!(!snap[0].state.is_notifiable(), "pending session must never notify");
        assert_eq!(snap[0].summary, "detected — awaiting activity");
    }

    #[test]
    fn real_event_clears_pending() {
        let m = SessionManager::new();
        m.handle_event(&event("s", "SessionStart"));
        assert!(m.snapshot()[0].pending);
        m.handle_event(&event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "PreToolUse",
            "tool_name": "Bash", "tool_input": {"command": "ls"}
        })));
        let snap = m.snapshot();
        assert!(!snap[0].pending, "a real activity event confirms the state (SL-5)");
        assert_eq!(snap[0].state, SessionState::Working);
    }

    #[test]
    fn polling_seed_then_hook_confirms_state() {
        // SL-5 full flow: poll seeds a pending session → a real hook arrives →
        // state is confirmed and `pending` cleared (hook always wins).
        let m = SessionManager::new();
        assert!(m.seed_pending("s", Some("/x/proj".into()), Instant::now()));
        assert!(m.snapshot()[0].pending, "seeded session starts unconfirmed");
        m.handle_event(&event_json(serde_json::json!({
            "session_id": "s", "hook_event_name": "Notification",
            "notification_type": "permission_prompt"
        })));
        let snap = m.snapshot();
        assert!(!snap[0].pending, "the real hook confirms and clears pending");
        assert_eq!(snap[0].state, SessionState::Waiting);
    }

    #[test]
    fn session_end_removes_session() {
        let m = SessionManager::new();
        m.handle_event(&event("s", "Stop"));
        assert_eq!(m.len(), 1);
        assert_eq!(m.handle_event(&event("s", "SessionEnd")), EventOutcome::Removed);
        assert!(m.is_empty(), "SessionEnd removes the session entirely (SL-2)");
        assert_eq!(
            m.handle_event(&event("s", "SessionEnd")),
            EventOutcome::Ignored,
            "ending an unknown session is a no-op"
        );
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
    fn working_flips_to_inactive_after_silence() {
        // A Working session silent past the between-tools threshold (180s) is
        // flagged inactive — visual-only: state stays Working, no notification.
        let m = SessionManager::new();
        let t0 = Instant::now();
        m.handle_event_at(&event("s", "PostToolUse"), t0); // Working, not mid-tool
        assert!(m.tick_stale_working_at(t0).is_empty(), "fresh Working is not inactive");
        assert!(
            m.tick_stale_working_at(t0 + Duration::from_secs(120)).is_empty(),
            "still active below the 180s threshold"
        );
        let later = t0 + Duration::from_secs(181);
        assert_eq!(m.tick_stale_working_at(later), vec!["s".to_string()]);
        let s = &m.snapshot()[0];
        assert!(s.inactive, "flagged inactive");
        assert_eq!(s.state, SessionState::Working, "state unchanged (visual-only)");
        assert!(!s.state.is_notifiable(), "still non-notifiable → no OS notification");
        assert!(s.summary.contains("no activity"), "summary reflects inactivity: {}", s.summary);
    }

    #[test]
    fn mid_tool_uses_longer_threshold() {
        // A tool in flight (PreToolUse, no PostToolUse) gets the longer 240s
        // threshold so a slow build/test isn't mistaken for an interrupt.
        let m = SessionManager::new();
        let t0 = Instant::now();
        m.handle_event_at(&event("s", "PreToolUse"), t0); // Working, mid-tool
        assert!(
            m.tick_stale_working_at(t0 + Duration::from_secs(181)).is_empty(),
            "mid-tool ignores the short (180s) threshold — a slow tool is still running"
        );
        assert_eq!(
            m.tick_stale_working_at(t0 + Duration::from_secs(281)),
            vec!["s".to_string()],
            "mid-tool flips only after the long (280s) threshold"
        );
    }

    #[test]
    fn fresh_event_clears_inactive_and_does_not_refire() {
        let m = SessionManager::new();
        let t0 = Instant::now();
        m.handle_event_at(&event("s", "PostToolUse"), t0);
        let later = t0 + Duration::from_secs(181);
        assert_eq!(m.tick_stale_working_at(later), vec!["s".to_string()]);
        // Already-inactive session is not reported again (no churn).
        assert!(m.tick_stale_working_at(later).is_empty(), "inactive does not re-fire");
        // A fresh hook event clears the flag — there was activity after all.
        m.handle_event_at(&event("s", "PostToolUse"), later);
        assert!(!m.snapshot()[0].inactive, "fresh event clears inactive");
    }

    #[test]
    fn non_working_sessions_are_never_flagged_inactive() {
        let m = SessionManager::new();
        let t0 = Instant::now();
        m.handle_event_at(&event("s", "Stop"), t0); // Done, not Working
        assert!(
            m.tick_stale_working_at(t0 + Duration::from_secs(1000)).is_empty(),
            "only Working sessions are flagged inactive"
        );
    }

    #[test]
    fn seed_pending_is_hook_first() {
        let m = SessionManager::new();
        // Seeds a brand-new pre-existing session as pending (SL-4).
        assert!(m.seed_pending("s", Some("/x/proj".into()), Instant::now()));
        let snap = m.snapshot();
        assert!(snap[0].pending, "seeded session is unconfirmed");
        assert_eq!(snap[0].project_name, "proj");
        assert!(!snap[0].state.is_notifiable(), "seeded session must not notify (SL-5)");
        // Re-seeding the same id is a no-op (already tracked).
        assert!(!m.seed_pending("s", None, Instant::now()));

        // A hook-tracked session is never overwritten by seeding (hook-first).
        m.handle_event(&event("h", "PreToolUse"));
        assert!(!m.seed_pending("h", None, Instant::now()));
        let h = m.snapshot().into_iter().find(|x| x.id == "h").unwrap();
        assert!(!h.pending, "hook-tracked session stays confirmed");
        assert_eq!(h.state, SessionState::Working);
    }

    #[test]
    fn touch_seen_keeps_polled_session_alive() {
        // stale_after 100s. A session the poll keeps seeing alive is never evicted.
        let m = SessionManager::with_timeouts(Duration::from_secs(30), Duration::from_secs(100));
        let t0 = Instant::now();
        m.seed_pending("s", None, t0);
        // Poll touches it just before the stale threshold → liveness refreshed.
        assert!(m.touch_seen("s", t0 + Duration::from_secs(90)));
        assert!(
            m.tick_evict_at(t0 + Duration::from_secs(150)).is_empty(),
            "a polled-alive session must not be evicted (SL-4)"
        );
        // Once polling stops (session died), it evicts ~stale_after after last seen.
        assert_eq!(
            m.tick_evict_at(t0 + Duration::from_secs(190)),
            vec!["s".to_string()]
        );
        assert!(!m.touch_seen("absent", t0), "touch on an unknown session is false");
    }

    #[test]
    fn stale_session_is_evicted_after_timeout() {
        // idle_after 30s, stale_after 100s.
        let m = SessionManager::with_timeouts(Duration::from_secs(30), Duration::from_secs(100));
        let t0 = Instant::now();
        m.handle_event_at(&event("s", "PreToolUse"), t0);
        assert!(m.tick_evict_at(t0).is_empty(), "fresh session is not evicted");
        // Just before the stale threshold: still alive.
        assert!(m.tick_evict_at(t0 + Duration::from_secs(99)).is_empty());
        // Past the stale threshold (no events since): evicted (SL-3).
        assert_eq!(
            m.tick_evict_at(t0 + Duration::from_secs(101)),
            vec!["s".to_string()]
        );
        assert!(m.is_empty(), "evicted session is removed entirely");
    }

    #[test]
    fn activity_resets_stale_timer() {
        let m = SessionManager::with_timeouts(Duration::from_secs(30), Duration::from_secs(100));
        let t0 = Instant::now();
        m.handle_event_at(&event("s", "PreToolUse"), t0);
        // A later event refreshes last_activity, so it is not stale yet.
        m.handle_event_at(&event("s", "PostToolUse"), t0 + Duration::from_secs(90));
        assert!(
            m.tick_evict_at(t0 + Duration::from_secs(150)).is_empty(),
            "recent activity must keep the session alive"
        );
        assert_eq!(m.tick_evict_at(t0 + Duration::from_secs(200)), vec!["s".to_string()]);
    }

    #[test]
    fn dismiss_blocks_reseed_until_real_hook() {
        let m = SessionManager::new();
        m.seed_pending("s", None, Instant::now());
        assert_eq!(m.len(), 1);

        // User dismisses it → removed and remembered.
        assert!(m.dismiss("s"));
        assert!(m.is_empty());
        // The poll must NOT re-seed a dismissed session (GF-106).
        assert!(!m.seed_pending("s", None, Instant::now()));
        assert!(m.is_empty(), "dismissed session stays gone against polling");

        // A real hook event un-dismisses it (it's active again).
        m.handle_event(&event("s", "PreToolUse"));
        assert_eq!(m.len(), 1, "new activity un-dismisses and re-tracks");
        // After un-dismiss, polling could seed it again too.
        m.remove("s");
        assert!(m.seed_pending("s", None, Instant::now()), "no longer dismissed → seedable");
    }

    #[test]
    fn dismissal_persists_across_restart() {
        // GF-107: a dismissal must survive an app restart, otherwise the poll
        // re-seeds the still-alive session and the removed card reappears.
        let dir = std::env::temp_dir().join(format!("gofetch-dismiss-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("dismissed.json");

        // First "run": dismiss a live session → persisted to disk.
        let m1 = SessionManager::with_persistence(Some(path.clone()));
        m1.seed_pending("alive", None, Instant::now());
        assert!(m1.dismiss("alive"));

        // Second "run" (fresh manager, same file): the dismissal is remembered,
        // so the pre-existing poll must NOT re-seed the still-alive session.
        let m2 = SessionManager::with_persistence(Some(path.clone()));
        assert!(
            !m2.seed_pending("alive", None, Instant::now()),
            "a persisted dismissal keeps the session hidden after restart"
        );
        assert!(m2.is_empty());

        // A real hook event un-dismisses it and persists the removal.
        m2.handle_event(&event("alive", "PreToolUse"));
        let m3 = SessionManager::with_persistence(Some(path.clone()));
        assert!(
            m3.seed_pending("alive", None, Instant::now()),
            "un-dismissal persists too → seedable again on the next restart"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn prune_dismissed_drops_dead_ids() {
        // GF-107: a dismissed session whose process has ended (absent from the
        // poll) is pruned from the persisted set so the file can't grow forever.
        let dir = std::env::temp_dir().join(format!("gofetch-prune-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("dismissed.json");

        let m = SessionManager::with_persistence(Some(path.clone()));
        m.seed_pending("a", None, Instant::now());
        m.seed_pending("b", None, Instant::now());
        assert!(m.dismiss("a"));
        assert!(m.dismiss("b"));

        // Poll now sees only "a" alive; "b"'s process is gone.
        let alive: HashSet<String> = ["a".to_string()].into_iter().collect();
        assert!(m.prune_dismissed(&alive), "pruning a dead dismissed id reports a change");
        // Idempotent: nothing more to drop.
        assert!(!m.prune_dismissed(&alive));

        // "a" is still alive+dismissed → stays hidden; "b" was pruned → seedable.
        assert!(!m.seed_pending("a", None, Instant::now()), "still-alive dismissal stays hidden");
        assert!(m.seed_pending("b", None, Instant::now()), "pruned dead id is seedable again");

        // The prune was persisted: a fresh run no longer suppresses "b".
        m.remove("b");
        let m2 = SessionManager::with_persistence(Some(path.clone()));
        assert!(m2.seed_pending("b", None, Instant::now()), "prune persisted across restart");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn remove_drops_session_entirely() {
        let m = SessionManager::new();
        m.handle_event(&event("s", "PreToolUse"));
        assert_eq!(m.len(), 1);
        // remove drops it completely (not just demote to Idle like tick_idle).
        assert!(m.remove("s"), "remove returns true when present");
        assert!(m.is_empty(), "removed session must not linger");
        assert!(!m.remove("s"), "removing an absent session returns false");
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
    fn has_active_counts_pending_but_not_idle() {
        let m = SessionManager::with_idle_after(Duration::from_secs(0));
        assert!(!m.has_active(), "no sessions → not active");

        // A pending (Detecting) session keeps the widget shown, even though its
        // underlying placeholder state is Idle (GF-102).
        m.seed_pending("p", None, Instant::now());
        assert!(m.has_active(), "a pending session must count as active");

        // A session driven to a real Idle state (Done → idle) is NOT active.
        let only_idle = SessionManager::with_idle_after(Duration::from_secs(0));
        only_idle.handle_event(&event("d", "Stop"));
        only_idle.tick_idle(); // idle_after = 0 → Done becomes Idle immediately
        assert!(!only_idle.has_active(), "a purely Idle session is not active");
    }

    #[test]
    fn priority_and_notifiable() {
        assert!(SessionState::Waiting.priority() < SessionState::Working.priority());
        assert!(SessionState::Waiting.is_notifiable());
        assert!(!SessionState::Working.is_notifiable());
        assert!(!SessionState::Idle.is_notifiable());
    }
}
