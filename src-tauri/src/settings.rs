//! Local user settings (Task 12 / GF-17, SE-1).
//!
//! Persists to `~/.gofetch/settings.json` (override with `GOFETCH_CONFIG_PATH`
//! for tests). v1 holds per-type notification toggles; Task 13/14 extend it
//! with widget/startup preferences. All local — no external transmission.

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

use crate::session::SessionState;

/// Per-type notification toggles (NT-3). All enabled by default.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct NotificationSettings {
    pub waiting: bool,
    pub error: bool,
    pub done: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            waiting: true,
            error: true,
            done: true,
        }
    }
}

impl NotificationSettings {
    /// Whether notifications for the given state are enabled.
    pub fn enabled_for(&self, state: SessionState) -> bool {
        match state {
            SessionState::Waiting => self.waiting,
            SessionState::Error => self.error,
            SessionState::Done => self.done,
            // Working/Idle never notify regardless of settings.
            SessionState::Working | SessionState::Idle => false,
        }
    }
}

/// Widget display preferences (Task 14 / WC-5).
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct WidgetSettings {
    /// Keep the widget above other windows. Matches tauri.conf default (true).
    pub always_on_top: bool,
    /// Hide the widget when every session is idle; reappear on new activity.
    pub auto_hide: bool,
}

impl Default for WidgetSettings {
    fn default() -> Self {
        Self {
            always_on_top: true,
            auto_hide: false,
        }
    }
}

/// Root settings document.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub notifications: NotificationSettings,
    pub widget: WidgetSettings,
}

/// Thread-safe, persisted settings store. Cheap to clone (`Arc`).
#[derive(Clone)]
pub struct SettingsStore {
    inner: Arc<RwLock<Settings>>,
    path: Option<PathBuf>,
}

impl SettingsStore {
    /// Load from the resolved config path (or defaults if missing/invalid).
    pub fn load() -> Self {
        Self::at(config_path())
    }

    /// Load from a specific (optional) path — used by tests.
    pub fn at(path: Option<PathBuf>) -> Self {
        let settings = path.as_ref().and_then(|p| read_settings(p)).unwrap_or_default();
        Self {
            inner: Arc::new(RwLock::new(settings)),
            path,
        }
    }

    pub fn get(&self) -> Settings {
        *self.inner.read().expect("settings lock poisoned")
    }

    pub fn notifications(&self) -> NotificationSettings {
        self.get().notifications
    }

    /// Replace settings and persist (best-effort).
    pub fn set(&self, settings: Settings) {
        *self.inner.write().expect("settings lock poisoned") = settings;
        if let Some(path) = &self.path {
            if let Err(e) = write_settings(path, &settings) {
                eprintln!("[gofetch] failed to save settings to {}: {e}", path.display());
            }
        }
    }
}

fn config_path() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("GOFETCH_CONFIG_PATH") {
        return Some(PathBuf::from(p));
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| PathBuf::from(h).join(".gofetch").join("settings.json"))
}

fn read_settings(path: &PathBuf) -> Option<Settings> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_settings(path: &PathBuf, settings: &Settings) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(settings).unwrap_or_else(|_| "{}".to_string());
    std::fs::write(path, text + "\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_enable_all_notifications() {
        let n = NotificationSettings::default();
        assert!(n.waiting && n.error && n.done);
        assert!(n.enabled_for(SessionState::Waiting));
        assert!(n.enabled_for(SessionState::Error));
        assert!(n.enabled_for(SessionState::Done));
        assert!(!n.enabled_for(SessionState::Working));
        assert!(!n.enabled_for(SessionState::Idle));
    }

    #[test]
    fn disabling_a_type_gates_only_that_type() {
        let n = NotificationSettings { waiting: false, error: true, done: true };
        assert!(!n.enabled_for(SessionState::Waiting));
        assert!(n.enabled_for(SessionState::Error));
        assert!(n.enabled_for(SessionState::Done));
    }

    #[test]
    fn set_persists_and_load_reads_back() {
        let dir = std::env::temp_dir().join(format!("gofetch-cfg-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");

        let store = SettingsStore::at(Some(path.clone()));
        let mut s = store.get();
        s.notifications.done = false;
        store.set(s);

        // A fresh store at the same path must see the persisted change.
        let reloaded = SettingsStore::at(Some(path.clone()));
        assert!(!reloaded.notifications().done);
        assert!(reloaded.notifications().waiting);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_or_invalid_file_falls_back_to_defaults() {
        let store = SettingsStore::at(Some(PathBuf::from("/nonexistent/gofetch/settings.json")));
        assert!(store.notifications().waiting);
    }

    #[test]
    fn widget_defaults_and_persist() {
        let dir = std::env::temp_dir().join(format!("gofetch-widget-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");

        let store = SettingsStore::at(Some(path.clone()));
        // Defaults: always-on-top on, auto-hide off.
        assert!(store.get().widget.always_on_top);
        assert!(!store.get().widget.auto_hide);

        let mut s = store.get();
        s.widget.auto_hide = true;
        s.widget.always_on_top = false;
        store.set(s);

        let reloaded = SettingsStore::at(Some(path.clone()));
        assert!(reloaded.get().widget.auto_hide);
        assert!(!reloaded.get().widget.always_on_top);
        // Notifications still present alongside widget settings.
        assert!(reloaded.get().notifications.error);

        std::fs::remove_dir_all(&dir).ok();
    }
}
