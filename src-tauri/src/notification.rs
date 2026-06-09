//! OS-native notifications for retention-critical state changes (Task 7 / GF-12).
//!
//! Fires for `Waiting` / `Error` / `Done` only (NT-1), includes the project name
//! (NT-2), and suppresses duplicate same-state notifications per session (NT-4).
//!
//! De-spam note (HOOK_SPEC_VERIFIED §3 / FIX-1): `Stop` maps to `Done` and fires
//! every turn. Because `last_notified_state` is updated **only when we actually
//! notify** and is left untouched on non-notifiable states (Working/Idle), a
//! run of `Working → Done → Working → Done` notifies "Done" once, not per turn.
//! The precise "come back" signal is `idle_prompt` (→ Waiting), which still
//! fires after a `Done` because it is a different state.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::session::{Session, SessionState};
use crate::settings::NotificationSettings;

/// Tracks the last state we notified about, per session, for de-duplication.
#[derive(Default)]
pub struct NotificationManager {
    last_notified: Mutex<HashMap<String, SessionState>>,
}

impl NotificationManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Decide whether to notify for the session's current state. Returns the
    /// `(title, body)` to show, or `None` to stay silent. Honors the per-type
    /// toggles (NT-3) and updates the dedup record only when it returns `Some`.
    pub fn should_notify(
        &self,
        session: &Session,
        settings: &NotificationSettings,
    ) -> Option<(String, String)> {
        if !session.state.is_notifiable() {
            return None;
        }
        if !settings.enabled_for(session.state) {
            return None; // NT-3: this notification type is turned off.
        }
        let mut last = self.last_notified.lock().expect("notify lock poisoned");
        if last.get(&session.id) == Some(&session.state) {
            return None; // NT-4: same state already announced.
        }
        last.insert(session.id.clone(), session.state);
        Some(message_for(session))
    }
}

/// Build the notification `(title, body)` for a notifiable session state.
/// Always includes the project name (NT-2).
fn message_for(session: &Session) -> (String, String) {
    let project = session.project_name.as_str();
    match session.state {
        SessionState::Waiting => {
            let title = match session.waiting_kind.as_deref() {
                Some("permission_prompt") => "Waiting for permission",
                _ => "Waiting for your input",
            };
            (title.to_string(), format!("{project}"))
        }
        SessionState::Error => (
            "Session error".to_string(),
            match session.error_type.as_deref() {
                Some(kind) => format!("{project} — {kind}"),
                None => project.to_string(),
            },
        ),
        SessionState::Done => ("Task complete".to_string(), project.to_string()),
        // Non-notifiable states are filtered out before this is called.
        SessionState::Working | SessionState::Idle => (String::new(), String::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn session(id: &str, body: serde_json::Value) -> Session {
        // Round-trip through the state machine to build a realistic Session.
        let mgr = crate::session::SessionManager::new();
        let event: crate::server::HookEvent = serde_json::from_value(body).unwrap();
        mgr.handle_event(&event);
        mgr.snapshot().into_iter().find(|s| s.id == id).unwrap()
    }

    const ALL_ON: NotificationSettings = NotificationSettings { waiting: true, error: true, done: true };

    #[test]
    fn notifies_waiting_error_done_with_project() {
        let nm = NotificationManager::new();

        let waiting = session(
            "a",
            json!({"session_id":"a","hook_event_name":"Notification","notification_type":"permission_prompt","cwd":"/x/api-server"}),
        );
        let (title, body) = nm.should_notify(&waiting, &ALL_ON).expect("waiting notifies");
        assert_eq!(title, "Waiting for permission");
        assert!(body.contains("api-server"), "body must carry project name (NT-2): {body}");

        let err = session(
            "b",
            json!({"session_id":"b","hook_event_name":"StopFailure","error_type":"rate_limit","cwd":"/x/web"}),
        );
        let (title, body) = nm.should_notify(&err, &ALL_ON).unwrap();
        assert_eq!(title, "Session error");
        assert!(body.contains("rate_limit") && body.contains("web"));

        let done = session("c", json!({"session_id":"c","hook_event_name":"Stop","cwd":"/x/cli"}));
        assert_eq!(nm.should_notify(&done, &ALL_ON).unwrap().0, "Task complete");
    }

    #[test]
    fn does_not_notify_working_or_idle() {
        let nm = NotificationManager::new();
        let working = session(
            "w",
            json!({"session_id":"w","hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"/x/p"}),
        );
        assert!(nm.should_notify(&working, &ALL_ON).is_none(), "Working must not notify (NT-1)");
    }

    #[test]
    fn suppresses_duplicate_same_state() {
        let nm = NotificationManager::new();
        let make = || {
            session(
                "d",
                json!({"session_id":"d","hook_event_name":"Notification","notification_type":"idle_prompt","cwd":"/x/p"}),
            )
        };
        assert!(nm.should_notify(&make(), &ALL_ON).is_some(), "first waiting notifies");
        assert!(nm.should_notify(&make(), &ALL_ON).is_none(), "second identical waiting suppressed (NT-4)");
    }

    #[test]
    fn re_notifies_after_state_changes_away_and_back() {
        let nm = NotificationManager::new();
        let waiting = session(
            "e",
            json!({"session_id":"e","hook_event_name":"Notification","notification_type":"permission_prompt","cwd":"/x/p"}),
        );
        let done = session("e", json!({"session_id":"e","hook_event_name":"Stop","cwd":"/x/p"}));

        assert!(nm.should_notify(&waiting, &ALL_ON).is_some());
        assert!(nm.should_notify(&done, &ALL_ON).is_some(), "different state notifies");
        assert!(nm.should_notify(&waiting, &ALL_ON).is_some(), "back to waiting notifies again");
    }

    #[test]
    fn disabled_type_is_not_notified() {
        let nm = NotificationManager::new();
        let waiting_off = NotificationSettings { waiting: false, error: true, done: true };
        let waiting = session(
            "f",
            json!({"session_id":"f","hook_event_name":"Notification","notification_type":"permission_prompt","cwd":"/x/p"}),
        );
        assert!(nm.should_notify(&waiting, &waiting_off).is_none(), "waiting disabled → no notify (NT-3)");

        // Other types still fire.
        let done = session("g", json!({"session_id":"g","hook_event_name":"Stop","cwd":"/x/p"}));
        assert!(nm.should_notify(&done, &waiting_off).is_some());
    }
}
