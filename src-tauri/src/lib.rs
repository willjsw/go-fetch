// GoFetch — ambient monitor for Claude Code sessions.
//
// v1 wiring:
//   - Task 2 (GF-2): frameless, always-on-top widget window + empty state.
//   - Task 3 (GF-8): localhost-only HTTP receive server for hook events.
//   - Task 4 (GF-9): per-session state machine + idle timer.
// Task 5 adds the character/state visualization over Tauri IPC.

pub mod server;
pub mod session;

use std::time::Duration;

/// How often the idle ticker checks for `Done` sessions to demote to `Idle`.
const IDLE_TICK: Duration = Duration::from_secs(5);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Shared, thread-safe session state machine (Task 4).
    let manager = session::SessionManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |_app| {
            // Localhost hook receiver (Task 3), fully detached: any failure is
            // logged inside `server::run` and never affects the host (DI-4).
            let server_manager = manager.clone();
            tauri::async_runtime::spawn(async move {
                server::run(server_manager).await;
            });

            // Idle ticker (ST-3): periodically demote quiet `Done` sessions to
            // `Idle`. UI emission of these changes is wired up in Task 5.
            let idle_manager = manager.clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(IDLE_TICK);
                loop {
                    ticker.tick().await;
                    idle_manager.tick_idle();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
