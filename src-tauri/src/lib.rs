// GoFetch — ambient monitor for Claude Code sessions.
//
// v1 wiring:
//   - Task 2 (GF-2): frameless, always-on-top widget window + empty state.
//   - Task 3 (GF-8): localhost-only HTTP receive server for hook events.
//   - Task 4 (GF-9): per-session state machine + idle timer.
//   - Task 5 (GF-10): push session snapshots to the widget over Tauri IPC.
//   - Task 6 (GF-11): auto-register hooks in settings.json, clean up on exit.
//   - Task 7 (GF-12): OS-native notifications for waiting/error/done.
//   - Task 12 (GF-17): per-type notification toggles.
//   - Task 13 (GF-18): launch-at-startup option.
//   - Task 14 (GF-19): always-on-top + auto-hide + tray toggle.

pub mod hook_installer;
pub mod notification;
pub mod preexisting;
pub mod server;
pub mod session;
pub mod settings;

use std::sync::Arc;
use std::time::Duration;

use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

/// How often the idle ticker checks for `Done` sessions to demote to `Idle`.
const IDLE_TICK: Duration = Duration::from_secs(5);

/// How often to poll `claude agents --json` for pre-existing sessions (SL-4 /
/// D9). The first tick fires immediately (poll once at startup), then every 10s.
/// Polling pauses while the widget is hidden to save battery (D9).
const PREEXISTING_POLL_INTERVAL: Duration = Duration::from_secs(10);

/// Event the widget frontend listens on for session snapshots.
const SESSIONS_UPDATE_EVENT: &str = "sessions-update";

/// Apply widget display preferences to the main window (Task 14 / WC-5):
/// always-on-top, and auto-hide when no session is active.
fn apply_window_prefs(
    handle: &tauri::AppHandle,
    store: &settings::SettingsStore,
    manager: &session::SessionManager,
) {
    let widget = store.get().widget;
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.set_always_on_top(widget.always_on_top);
        if widget.auto_hide && !manager.has_active() {
            let _ = window.hide();
        } else {
            let _ = window.show();
        }
    }
}

#[tauri::command]
fn get_sessions(manager: tauri::State<session::SessionManager>) -> Vec<session::Session> {
    manager.snapshot()
}

/// Tauri command: read current user settings (Task 12).
#[tauri::command]
fn get_settings(store: tauri::State<settings::SettingsStore>) -> settings::Settings {
    store.get()
}

/// Tauri command: persist user settings and apply window prefs (Task 12/14).
#[tauri::command]
fn set_settings(
    app: tauri::AppHandle,
    store: tauri::State<settings::SettingsStore>,
    manager: tauri::State<session::SessionManager>,
    settings: settings::Settings,
) {
    store.set(settings);
    apply_window_prefs(&app, &store, &manager);
}

/// Tauri command: is launch-at-startup currently enabled (Task 13)?
#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Tauri command: fully quit GoFetch (WC-6, `x` button). Triggers the app's
/// `RunEvent::Exit` so GoFetch's hooks are cleaned out of `settings.json`
/// (SE-3). The `−` button uses `window.hide()` instead (kept resident in tray).
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Tauri command: enable/disable launch-at-startup (Task 13 / SE-2).
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Shared, thread-safe session state machine (Task 4) + persisted settings.
    let manager = session::SessionManager::new();
    let settings_store = settings::SettingsStore::load();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // Persist widget position/size across restarts (WC-9). Only SIZE +
        // POSITION are tracked — visibility stays under our tray/auto-hide
        // control (WC-5), so the plugin never fights the show/hide logic.
        //
        // The filename is versioned (not the default `.window-state.json`) so
        // that bumping the default window size (WC-12: 360×600) invalidates any
        // stale geometry saved under the old default — otherwise the restored
        // old size would mask the new default on launch (GF-99). Future default
        // changes can bump this name again to reset cleanly.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename("gofetch-window-state.json")
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION,
                )
                .build(),
        )
        .manage(manager.clone())
        .manage(settings_store.clone())
        .invoke_handler(tauri::generate_handler![
            get_sessions,
            get_settings,
            set_settings,
            get_autostart,
            set_autostart,
            quit_app
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // Per-session de-dup for OS notifications (Task 7).
            let notifications = notification::NotificationManager::new();

            // Notifier: refresh the widget, fire OS notifications for the changed
            // session (Task 7/12), and re-apply window visibility (Task 14).
            let n_handle = handle.clone();
            let n_manager = manager.clone();
            let n_settings = settings_store.clone();
            let notify: server::UpdateNotifier = Arc::new(move |session_id: &str| {
                let snapshot = n_manager.snapshot();
                let _ = n_handle.emit(SESSIONS_UPDATE_EVENT, &snapshot);

                if let Some(session) = snapshot.iter().find(|s| s.id == session_id) {
                    let prefs = n_settings.notifications();
                    if let Some((title, body)) = notifications.should_notify(session, &prefs) {
                        let _ = n_handle
                            .notification()
                            .builder()
                            .title(title)
                            .body(body)
                            .show();
                    }
                } else {
                    // Session no longer in the snapshot → it was removed
                    // (SessionEnd / eviction). Clear its dedup record (SL-2).
                    notifications.forget(session_id);
                }
                apply_window_prefs(&n_handle, &n_settings, &n_manager);
            });

            // Localhost hook receiver (Task 3) → registers hooks once bound (Task 6).
            let s_manager = manager.clone();
            let s_notify = notify.clone();
            tauri::async_runtime::spawn(async move {
                server::run(s_manager, s_notify, |port| {
                    hook_installer::register(port);
                })
                .await;
            });

            // Idle ticker (ST-3): demote quiet sessions, refresh per change.
            let i_manager = manager.clone();
            let i_notify = notify.clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(IDLE_TICK);
                loop {
                    ticker.tick().await;
                    // ST-3: demote quiet `Done` sessions to `Idle`.
                    for id in i_manager.tick_idle() {
                        (i_notify)(&id);
                    }
                    // SL-3: evict sessions stale past the timeout (missed
                    // SessionEnd safety net). The notifier sees them gone from
                    // the snapshot and refreshes + clears dedup.
                    for id in i_manager.tick_evict() {
                        (i_notify)(&id);
                    }
                }
            });

            // Pre-existing session detection (SL-4): poll `claude agents --json`
            // off-thread to surface sessions that started before GoFetch (or are
            // stalled emitting no events). First tick fires immediately (poll at
            // startup), then every 10s; polling pauses while the widget is hidden
            // (D9). Seeding is hook-first and best-effort (DI-4): any failure just
            // degrades to hook-only.
            let p_manager = manager.clone();
            let p_notify = notify.clone();
            let p_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(PREEXISTING_POLL_INTERVAL);
                loop {
                    ticker.tick().await;
                    // Skip the poll while the widget is hidden (battery, D9).
                    let visible = p_handle
                        .get_webview_window("main")
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(true);
                    if !visible {
                        continue;
                    }
                    // `None` = the poll couldn't run (degrade to hook-only, don't
                    // touch tracked sessions). `Some` = a clean snapshot of live
                    // sessions: seed the ones we don't track yet (hook-first) and
                    // refresh liveness for the rest so they aren't stale-evicted.
                    if let Some(entries) = preexisting::poll_active_sessions().await {
                        let now = std::time::Instant::now();
                        let mut seeded = 0usize;
                        for entry in &entries {
                            let Some(id) = entry.session_id.as_deref() else {
                                continue;
                            };
                            if p_manager.seed_pending(id, entry.cwd.clone(), now) {
                                seeded += 1;
                                (p_notify)(id);
                            } else {
                                p_manager.touch_seen(id, now);
                            }
                        }
                        if seeded > 0 {
                            eprintln!(
                                "[gofetch] pre-existing poll: {} active session(s), {seeded} newly shown",
                                entries.len()
                            );
                        }
                    }
                }
            });

            // Tray icon (Task 14): left-click toggles the widget's visibility,
            // so an auto-hidden widget can always be brought back.
            if let Some(icon) = app.default_window_icon().cloned() {
                let _ = tauri::tray::TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("GoFetch")
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(app);
            }

            // Apply initial window preferences (always-on-top + auto-hide).
            apply_window_prefs(&handle, &settings_store, &manager);

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
