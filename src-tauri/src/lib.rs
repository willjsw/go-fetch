// GoFetch — ambient monitor for Claude Code sessions.
//
// v1 scaffold (Task 2 / GF-2): brings up a small, frameless, always-on-top
// widget window that renders an empty state. Task 3 (GF-8) adds the
// localhost-only HTTP receive server that ingests Claude Code hook events.
// Later tasks add the session state machine (Task 4) and the character/state
// visualization (Task 5).

pub mod server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            // Run the localhost hook receiver on Tauri's async runtime. It is
            // fully detached: any failure is logged inside `server::run` and
            // never affects the widget or the host Claude Code session (DI-4).
            tauri::async_runtime::spawn(async {
                server::run().await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
