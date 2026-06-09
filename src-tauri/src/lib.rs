// GoFetch — ambient monitor for Claude Code sessions.
//
// v1 scaffold (Task 2 / GF-2): brings up a small, frameless, always-on-top
// widget window that renders an empty state. Later tasks add the localhost
// HTTP receive server (Task 3), the session state machine (Task 4), and the
// character/state visualization (Task 5).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
