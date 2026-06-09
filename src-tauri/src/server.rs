//! Localhost-only HTTP receive server (Task 3 / GF-8).
//!
//! Claude Code forwards lifecycle events to GoFetch via an `http`-type hook
//! that POSTs the event JSON to `http://localhost:<PORT>/event`
//! (see `docs/HOOK_SPEC_VERIFIED.md` — the `http` hook type and non-blocking
//! semantics are verified there).
//!
//! Design constraints:
//! - **PC-1 / PC-2 / DI-2:** bind to `127.0.0.1` only. Never expose externally.
//! - **Read-only / DI-4:** this server NEVER returns a blocking decision. It
//!   replies `200 OK` with an empty body so it cannot stall a Claude Code turn,
//!   even for blockable events (`Stop`, `PreToolUse`).
//!
//! Event → state conversion lives in the session state machine (Task 4); this
//! module only receives, parses, validates, and hands off the normalized event.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{rejection::JsonRejection, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::session::SessionManager;

/// Invoked after each state-affecting event (and idle transition) so the widget
/// UI can refresh. `lib.rs` supplies a closure that emits the session snapshot
/// over Tauri IPC; tests pass a no-op. Keeping the server Tauri-agnostic this
/// way lets the router be unit-tested without an `AppHandle`.
pub type UpdateNotifier = Arc<dyn Fn(&str) + Send + Sync>;

/// Shared axum state: the session state machine plus the UI update notifier.
#[derive(Clone)]
struct AppState {
    manager: SessionManager,
    notify: UpdateNotifier,
}

/// Default port GoFetch listens on for Claude Code hook events.
pub const DEFAULT_PORT: u16 = 31_337;

/// How many sequential ports to try if the default one is already in use.
const PORT_FALLBACK_RANGE: u16 = 16;

/// Normalized hook event payload.
///
/// Field names follow the **verified** Claude Code schema
/// (`docs/HOOK_SPEC_VERIFIED.md` §5): every event carries `session_id` and
/// `hook_event_name`; event-specific fields are optional. Unknown fields (e.g.
/// `effort`, `agent_id`, `permission_mode` on events that omit it) are ignored
/// by serde, so future Claude Code versions won't break parsing (spec §5.4).
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)] // fields consumed by the state machine in Task 4
pub struct HookEvent {
    /// Unique session identifier — distinguishes concurrent sessions (DI-3).
    pub session_id: String,
    /// Name of the event that fired, e.g. `Notification`, `Stop`, `StopFailure`,
    /// `PreToolUse`, `PostToolUse`.
    pub hook_event_name: String,

    /// Working directory — used to label which project the session belongs to.
    #[serde(default)]
    pub cwd: Option<String>,
    /// Path to the conversation-log JSON (deeper context, DI-5).
    #[serde(default)]
    pub transcript_path: Option<String>,

    // --- PreToolUse / PostToolUse ---
    #[serde(default)]
    pub tool_name: Option<String>,
    #[serde(default)]
    pub tool_input: Option<serde_json::Value>,
    #[serde(default)]
    pub tool_output: Option<serde_json::Value>,

    // --- Notification (matcher: permission_prompt / idle_prompt / ...) ---
    #[serde(default)]
    pub notification_type: Option<String>,
    #[serde(default)]
    pub message: Option<String>,

    // --- StopFailure ---
    #[serde(default)]
    pub error_type: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
}

/// `GET /health` — liveness probe used by the mock test harness (Task 9) and the
/// non-interference checks (Task 8).
async fn health() -> StatusCode {
    StatusCode::OK
}

/// `POST /event` — receive a single Claude Code hook event.
///
/// Returns `200 OK` (empty body) for a well-formed payload and `400 Bad Request`
/// for malformed JSON. Both are non-blocking on the hook side (verified: non-2xx
/// is a non-blocking error), so neither can stall the Claude Code session.
async fn handle_event(
    State(state): State<AppState>,
    payload: Result<Json<HookEvent>, JsonRejection>,
) -> StatusCode {
    match payload {
        Ok(Json(event)) => {
            // Feed the session state machine (Task 4) and refresh the UI (Task 5).
            let new_state = state.manager.handle_event(&event);
            if new_state.is_some() {
                (state.notify)(&event.session_id);
            }
            eprintln!(
                "[gofetch] event session_id={} hook_event_name={} -> state={:?}",
                event.session_id, event.hook_event_name, new_state
            );
            StatusCode::OK
        }
        Err(rejection) => {
            eprintln!("[gofetch] rejected malformed hook payload: {rejection}");
            StatusCode::BAD_REQUEST
        }
    }
}

/// Build the localhost router, wired to the shared session manager. Public so
/// integration tests and the `serve` example can exercise it without opening
/// the Tauri window.
pub fn router(manager: SessionManager, notify: UpdateNotifier) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/event", post(handle_event))
        .with_state(AppState { manager, notify })
}

/// Bind a TCP listener on `127.0.0.1`, trying [`DEFAULT_PORT`] first and then a
/// small range of fallback ports, finally an OS-assigned port. Returns the
/// listener and the port actually bound.
async fn bind_localhost() -> std::io::Result<(tokio::net::TcpListener, u16)> {
    for offset in 0..PORT_FALLBACK_RANGE {
        let port = DEFAULT_PORT.wrapping_add(offset);
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
            return Ok((listener, port));
        }
    }
    // Last resort: let the OS pick a free port.
    let addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let port = listener.local_addr()?.port();
    Ok((listener, port))
}

/// Start the localhost hook server. Runs until the process exits. Errors are
/// logged but never propagated, so a server failure can never affect the host.
pub async fn run<F>(manager: SessionManager, notify: UpdateNotifier, on_bound: F)
where
    F: FnOnce(u16) + Send + 'static,
{
    match bind_localhost().await {
        Ok((listener, port)) => {
            eprintln!("[gofetch] local hook server listening on 127.0.0.1:{port}");
            // Report the actual bound port so hooks register with the right URL.
            on_bound(port);
            if let Err(err) = axum::serve(listener, router(manager, notify)).await {
                eprintln!("[gofetch] local hook server stopped: {err}");
            }
        }
        Err(err) => {
            eprintln!("[gofetch] failed to bind local hook server: {err}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt; // brings `oneshot`

    /// Router backed by a fresh manager and a no-op UI notifier.
    fn test_router() -> Router {
        router(SessionManager::new(), Arc::new(|_: &str| {}))
    }

    /// `/health` returns 200.
    #[tokio::test]
    async fn health_returns_ok() {
        let response = test_router()
            .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    /// A well-formed event (verified schema: session_id + hook_event_name +
    /// event-specific fields) is accepted with 200.
    #[tokio::test]
    async fn valid_event_returns_ok() {
        let body = r#"{
            "session_id": "sess-1",
            "hook_event_name": "PreToolUse",
            "cwd": "/Users/dev/my-project",
            "tool_name": "Edit",
            "tool_input": { "file_path": "src/main.rs" }
        }"#;
        let request = Request::builder()
            .method("POST")
            .uri("/event")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let response = test_router().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    /// Unknown extra fields (e.g. `effort`, `permission_mode`) must not break
    /// parsing — future Claude Code versions add fields (spec §5.4).
    #[tokio::test]
    async fn unknown_fields_are_ignored() {
        let body = r#"{
            "session_id": "sess-2",
            "hook_event_name": "Notification",
            "notification_type": "permission_prompt",
            "message": "Allow Bash?",
            "permission_mode": "default",
            "effort": { "level": "high" },
            "some_future_field": 123
        }"#;
        let request = Request::builder()
            .method("POST")
            .uri("/event")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let response = test_router().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    /// Malformed JSON gets a non-blocking 400 (never a blocking decision).
    #[tokio::test]
    async fn malformed_payload_returns_bad_request() {
        let request = Request::builder()
            .method("POST")
            .uri("/event")
            .header("content-type", "application/json")
            .body(Body::from("this is not json"))
            .unwrap();
        let response = test_router().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    /// Missing the required `session_id` is rejected (still non-blocking 400).
    #[tokio::test]
    async fn missing_required_field_returns_bad_request() {
        let body = r#"{ "hook_event_name": "Stop" }"#;
        let request = Request::builder()
            .method("POST")
            .uri("/event")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let response = test_router().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}
