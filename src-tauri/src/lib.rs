// GoFetch — ambient monitor for Claude Code sessions.
//
// v1 wiring:
//   - Task 2 (GF-2): frameless, always-on-top widget window + empty state.
//   - Task 3 (GF-8): localhost-only HTTP receive server for hook events.
//   - Task 4 (GF-9): per-session state machine + idle timer.
//   - Task 5 (GF-10): push session snapshots to the widget over Tauri IPC.
//   - Task 6 (GF-11): auto-register hooks in settings.json on launch, clean up
//     on exit (SE-3).

pub mod hook_installer;
pub mod server;
pub mod session;

use std::sync::Arc;
use std::time::Duration;

use tauri::{Emitter, Manager};

/// How often the idle ticker checks for `Done` sessions to demote to `Idle`.
const IDLE_TICK: Duration = Duration::from_secs(5);

/// Event the widget frontend listens on for session snapshots.
const SESSIONS_UPDATE_EVENT: &str = "sessions-update";

/// Tauri command: pull the current session snapshot. Used by the frontend for
/// the initial render (and as a refresh fallback).
#[tauri::command]
fn get_sessions(manager: tauri::State<session::SessionManager>) -> Vec<session::Session> {
    manager.snapshot()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Shared, thread-safe session state machine (Task 4).
    let manager = session::SessionManager::new();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Expose the manager to `#[tauri::command]`s (e.g. get_sessions).
        .manage(manager.clone())
        .invoke_handler(tauri::generate_handler![get_sessions])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // UI update notifier: emit the latest snapshot to the widget (Task 5).
            let notify_manager = manager.clone();
            let notify: server::UpdateNotifier = Arc::new(move || {
                let _ = app_handle.emit(SESSIONS_UPDATE_EVENT, notify_manager.snapshot());
            });

            // Localhost hook receiver (Task 3), fully detached: any failure is
            // logged inside `server::run` and never affects the host (DI-4).
            // Once it binds, register the hooks in settings.json with the actual
            // port (Task 6 / SE-3).
            let server_manager = manager.clone();
            let server_notify = notify.clone();
            tauri::async_runtime::spawn(async move {
                server::run(server_manager, server_notify, |port| {
                    hook_installer::register(port);
                })
                .await;
            });

            // Idle ticker (ST-3): demote quiet `Done` sessions to `Idle` and
            // refresh the UI only when something actually changed.
            let idle_manager = manager.clone();
            let idle_notify = notify.clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(IDLE_TICK);
                loop {
                    ticker.tick().await;
                    if !idle_manager.tick_idle().is_empty() {
                        (idle_notify)();
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Clean up GoFetch's hooks from settings.json when the app exits (SE-3).
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            hook_installer::unregister();
        }
    });
}
