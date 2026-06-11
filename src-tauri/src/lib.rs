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

/// How often the idle ticker polls each session's state — demotes quiet `Done`
/// sessions to `Idle` (ST-3), evicts stale ones (SL-3), and (GF-131) pushes a
/// fresh snapshot so elapsed counters tick live. 1s keeps the widget real-time;
/// the work per tick is a few in-memory scans, and the snapshot push is gated
/// on the widget being visible.
const IDLE_TICK: Duration = Duration::from_secs(1);

/// How often to poll `claude agents --json` for pre-existing sessions (SL-4 /
/// D9, tightened by GF-131). The first tick fires immediately (poll once at
/// startup), then every 2s — a warm call costs ~0.3s, and the loop awaits each
/// call (with `MissedTickBehavior::Delay`), so polls can never overlap even
/// when a cold call takes longer than the interval. Polling still pauses while
/// the widget is hidden to save battery (D9).
const PREEXISTING_POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Event the widget frontend listens on for session snapshots.
const SESSIONS_UPDATE_EVENT: &str = "sessions-update";

/// Apply widget display preferences to the main window (Task 14 / WC-5):
/// always-on-top, and — only when `auto_hide` is enabled — hide while no
/// session is active / reappear on activity.
///
/// GF-132: with `auto_hide` OFF this must not touch visibility at all. It used
/// to call `window.show()` on every refresh, so a widget the user explicitly
/// hid (− button / tray) popped back up on the next hook event — one of the
/// "window appears inconsistently" reports. Visibility in manual mode belongs
/// to the user (tray click, Dock click, − button) exclusively.
fn apply_window_prefs(
    handle: &tauri::AppHandle,
    store: &settings::SettingsStore,
    manager: &session::SessionManager,
) {
    let widget = store.get().widget;
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.set_always_on_top(widget.always_on_top);
        if widget.auto_hide {
            if manager.has_active() {
                let _ = window.show();
            } else {
                let _ = window.hide();
            }
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

/// Tauri command: user removes a session from the widget ("Stop monitoring",
/// GF-106). Dismisses it (so the pre-existing poll won't immediately re-seed an
/// still-alive session) and reuses the shared notifier to refresh the widget,
/// clear its notification dedup, and re-apply window prefs.
#[tauri::command]
fn dismiss_session(
    manager: tauri::State<session::SessionManager>,
    notify: tauri::State<server::UpdateNotifier>,
    id: String,
) {
    manager.dismiss(&id);
    let notify = notify.inner().clone();
    notify(&id);
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
    // `with_persistence` loads the set of sessions the user dismissed in a prior
    // run (GF-107) so "Stop monitoring" survives a restart instead of the poll
    // re-seeding the still-alive session.
    let manager = session::SessionManager::with_persistence(session::dismissed_path());
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
        // that bumping the default window size invalidates any stale geometry
        // saved under the old default — otherwise the restored old size masks
        // the new default on launch (GF-99). Bumped to `-v2` for the 410×600
        // default (GF-108): with the new lower minHeight (400), a previously
        // saved smaller height was no longer clamped up and the window launched
        // smaller than the intended default until the saved state is reset.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename("gofetch-window-state-v2.json")
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
            quit_app,
            dismiss_session
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

            // Expose the notifier to commands (e.g. dismiss_session, GF-106) so a
            // user action can refresh the widget through the same path as hooks.
            app.manage(notify.clone());

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
            let i_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(IDLE_TICK);
                loop {
                    ticker.tick().await;
                    // ST-3: demote quiet `Done` sessions to `Idle`.
                    for id in i_manager.tick_idle() {
                        (i_notify)(&id);
                    }
                    // Flag `Working` sessions gone quiet as `inactive` — a
                    // visual-only hint for the interrupt / IDE-permission blind
                    // spots (no hook fires for those). The notifier refreshes the
                    // widget; the state stays `Working`, so no OS notification.
                    for id in i_manager.tick_stale_working() {
                        (i_notify)(&id);
                    }
                    // SL-3: evict sessions stale past the timeout (missed
                    // SessionEnd safety net). The notifier sees them gone from
                    // the snapshot and refreshes + clears dedup.
                    for id in i_manager.tick_evict() {
                        (i_notify)(&id);
                    }
                    // GF-131: push a fresh snapshot every tick while the widget
                    // is visible, so elapsed counters and summaries stay live
                    // between (possibly sparse) hook events. Plain emit — no
                    // notification or window-pref work on this path.
                    let visible = i_handle
                        .get_webview_window("main")
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(false);
                    if visible {
                        let _ = i_handle.emit(SESSIONS_UPDATE_EVENT, &i_manager.snapshot());
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
                // A poll can outlast the (tight, GF-131) interval: don't burst
                // missed ticks afterwards — just resume the cadence.
                ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
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
                        let mut alive = std::collections::HashSet::new();
                        for entry in &entries {
                            let Some(id) = entry.session_id.as_deref() else {
                                continue;
                            };
                            alive.insert(id.to_string());
                            if p_manager.seed_pending(id, entry.cwd.clone(), now) {
                                seeded += 1;
                                (p_notify)(id);
                            } else {
                                p_manager.touch_seen(id, now);
                            }
                            // GF-131: the poll's `status` (busy/idle) refines a
                            // still-pending (hook-blind) session's display state
                            // — sessions started before GoFetch registered its
                            // hooks never emit events, so this is their only
                            // live signal. Hook-confirmed sessions are never
                            // touched, and no notification can fire (SL-5).
                            if let Some(status) = entry.status.as_deref() {
                                if p_manager.update_pending_status(id, status, now) {
                                    (p_notify)(id);
                                }
                            }
                        }
                        // Drop dismissed ids whose sessions have ended (absent
                        // from this authoritative snapshot) so the persisted set
                        // stays bounded (GF-107). No UI refresh: dismissed
                        // sessions aren't shown either way.
                        p_manager.prune_dismissed(&alive);
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

            // Apply initial window preferences (always-on-top), then ALWAYS
            // show the widget on launch (GF-132): the user just started the
            // app, so it must visibly appear. Previously, auto_hide + no active
            // sessions hid the window immediately at startup — the app looked
            // like it never opened until the tray icon was clicked. Auto-hide
            // may still reclaim it later, on the next session-state change.
            apply_window_prefs(&handle, &settings_store, &manager);
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Clean up GoFetch's hooks from settings.json when the app exits (SE-3),
    // and restore the widget when the Dock icon is clicked (GF-132).
    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::Exit => hook_installer::unregister(),
            // macOS fires `Reopen` when the running app is activated again —
            // e.g. its Dock icon or Launchpad entry is clicked. Without this
            // handler a hidden widget (auto-hide / − button) could only come
            // back via the small tray icon; the Dock icon appeared dead.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        }
    });
}
