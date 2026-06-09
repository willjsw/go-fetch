//! Auto-register / clean up GoFetch's hook block in `~/.claude/settings.json`
//! (Task 6 / GF-11, SE-3).
//!
//! The structure and field choices follow `docs/HOOK_SPEC_VERIFIED.md` §4:
//!   - two-level nesting: `hooks.<Event> = [ { matcher?, hooks: [ handler ] } ]`
//!   - `http` handler with a short `timeout` (NOT `async`, which is command-only)
//!   - `Notification` is split into `permission_prompt` / `idle_prompt` groups
//!
//! SE-3 invariants:
//!   - **Merge, never overwrite.** Existing user hooks are preserved.
//!   - **Clean up only ours.** Identified by an `http` handler whose `url` points
//!     at `127.0.0.1`/`localhost` and ends with `/event`.
//!   - **Graceful.** A missing file is created; a malformed file is left
//!     untouched (we never clobber settings we can't parse).

use std::path::PathBuf;

use serde_json::{json, Map, Value};

/// Events GoFetch subscribes to, with optional matcher per group.
/// `None` matcher fires on all (tool events) or has no matcher (Stop family).
const TOOL_AND_LIFECYCLE_EVENTS: [&str; 5] = [
    "Stop",
    "StopFailure",
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
];

/// Path to the user-level Claude Code settings file. Overridable via
/// `GOFETCH_SETTINGS_PATH` (used by tests and the non-interference harness so
/// they never touch the real file).
pub fn settings_path() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("GOFETCH_SETTINGS_PATH") {
        return Some(PathBuf::from(p));
    }
    home_dir().map(|h| h.join(".claude").join("settings.json"))
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// The GoFetch HTTP handler object for a given port.
fn gofetch_handler(port: u16) -> Value {
    json!({
        "type": "http",
        "url": format!("http://127.0.0.1:{port}/event"),
        "timeout": 5
    })
}

/// Is this handler object one GoFetch manages?
fn is_gofetch_handler(handler: &Value) -> bool {
    handler.get("type").and_then(Value::as_str) == Some("http")
        && handler
            .get("url")
            .and_then(Value::as_str)
            .is_some_and(|u| u.ends_with("/event") && (u.contains("127.0.0.1") || u.contains("localhost")))
}

/// Ensure `settings.hooks` exists as an object and return it mutably.
fn hooks_object(settings: &mut Value) -> &mut Map<String, Value> {
    if !settings.is_object() {
        *settings = json!({});
    }
    let obj = settings.as_object_mut().expect("settings is an object");
    obj.entry("hooks")
        .or_insert_with(|| json!({}));
    // Repair a non-object `hooks` value defensively.
    if !obj["hooks"].is_object() {
        obj.insert("hooks".to_string(), json!({}));
    }
    obj.get_mut("hooks").unwrap().as_object_mut().unwrap()
}

/// Append a matcher-group with a single GoFetch handler to an event's array.
fn push_group(hooks: &mut Map<String, Value>, event: &str, matcher: Option<&str>, handler: &Value) {
    let arr = hooks
        .entry(event.to_string())
        .or_insert_with(|| json!([]));
    if !arr.is_array() {
        *arr = json!([]);
    }
    let mut group = Map::new();
    if let Some(m) = matcher {
        group.insert("matcher".to_string(), json!(m));
    }
    group.insert("hooks".to_string(), json!([handler.clone()]));
    arr.as_array_mut().unwrap().push(Value::Object(group));
}

/// Add GoFetch's hook groups to `settings` (after first removing any existing
/// GoFetch entries, so the operation is idempotent and re-registers cleanly on
/// a port change).
pub fn apply_register(settings: &mut Value, port: u16) {
    apply_unregister(settings);
    let handler = gofetch_handler(port);
    let hooks = hooks_object(settings);

    // Notification: separate groups so each waiting type is filtered precisely.
    push_group(hooks, "Notification", Some("permission_prompt"), &handler);
    push_group(hooks, "Notification", Some("idle_prompt"), &handler);

    // Stop family + tool events + UserPromptSubmit: no matcher (fire on all).
    for event in TOOL_AND_LIFECYCLE_EVENTS {
        push_group(hooks, event, None, &handler);
    }
}

/// Remove only GoFetch's handlers, preserving every other user hook. Drops any
/// group/event that becomes empty as a result.
pub fn apply_unregister(settings: &mut Value) {
    let Some(hooks) = settings
        .get_mut("hooks")
        .and_then(Value::as_object_mut)
    else {
        return;
    };

    let events: Vec<String> = hooks.keys().cloned().collect();
    for event in events {
        let Some(groups) = hooks.get_mut(&event).and_then(Value::as_array_mut) else {
            continue;
        };
        groups.retain_mut(|group| {
            match group.get_mut("hooks").and_then(Value::as_array_mut) {
                Some(handlers) => {
                    handlers.retain(|h| !is_gofetch_handler(h));
                    // Keep the group only if it still has handlers.
                    !handlers.is_empty()
                }
                // Not a recognizable group — leave it untouched.
                None => true,
            }
        });
        if groups.is_empty() {
            hooks.remove(&event);
        }
    }

    if hooks.is_empty() {
        if let Some(obj) = settings.as_object_mut() {
            obj.remove("hooks");
        }
    }
}

/// Load settings, returning `Ok(Value::Object)` for a present-and-valid or
/// missing/empty file, and `Err` if the file exists but cannot be parsed (so we
/// never overwrite settings we don't understand).
fn load(path: &PathBuf) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(contents) if contents.trim().is_empty() => Ok(json!({})),
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|e| format!("settings.json is not valid JSON: {e}")),
        Err(_) => Ok(json!({})), // missing → start fresh
    }
}

fn save(path: &PathBuf, settings: &Value) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(settings).unwrap_or_else(|_| "{}".to_string());
    std::fs::write(path, text + "\n")
}

/// Register GoFetch hooks for `port` in the resolved settings file. Best-effort:
/// failures are logged and swallowed so install issues never crash the app.
pub fn register(port: u16) {
    let Some(path) = settings_path() else {
        eprintln!("[gofetch] could not resolve settings.json path; skipping hook registration");
        return;
    };
    match load(&path) {
        Ok(mut settings) => {
            apply_register(&mut settings, port);
            if let Err(e) = save(&path, &settings) {
                eprintln!("[gofetch] failed to write hooks to {}: {e}", path.display());
            } else {
                eprintln!("[gofetch] registered hooks in {} (port {port})", path.display());
            }
        }
        Err(e) => eprintln!("[gofetch] not modifying {}: {e}", path.display()),
    }
}

/// Remove GoFetch hooks from the resolved settings file. Best-effort.
pub fn unregister() {
    let Some(path) = settings_path() else { return; };
    if !path.exists() {
        return;
    }
    match load(&path) {
        Ok(mut settings) => {
            apply_unregister(&mut settings);
            if let Err(e) = save(&path, &settings) {
                eprintln!("[gofetch] failed to clean hooks from {}: {e}", path.display());
            } else {
                eprintln!("[gofetch] cleaned GoFetch hooks from {}", path.display());
            }
        }
        Err(e) => eprintln!("[gofetch] not modifying {}: {e}", path.display()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn count_gofetch_handlers(settings: &Value) -> usize {
        let mut n = 0;
        if let Some(hooks) = settings.get("hooks").and_then(Value::as_object) {
            for groups in hooks.values() {
                for group in groups.as_array().into_iter().flatten() {
                    for h in group.get("hooks").and_then(Value::as_array).into_iter().flatten() {
                        if is_gofetch_handler(h) {
                            n += 1;
                        }
                    }
                }
            }
        }
        n
    }

    #[test]
    fn registers_into_empty_settings_with_correct_structure() {
        let mut settings = json!({});
        apply_register(&mut settings, 31337);

        let notif = &settings["hooks"]["Notification"];
        assert!(notif.is_array());
        let matchers: Vec<&str> = notif
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|g| g["matcher"].as_str())
            .collect();
        assert!(matchers.contains(&"permission_prompt"));
        assert!(matchers.contains(&"idle_prompt"));

        // Handler shape: http + url + timeout, NO async (FIX-2).
        let handler = &notif[0]["hooks"][0];
        assert_eq!(handler["type"], "http");
        assert_eq!(handler["url"], "http://127.0.0.1:31337/event");
        assert_eq!(handler["timeout"], 5);
        assert!(handler.get("async").is_none());

        for event in ["Stop", "StopFailure", "PreToolUse", "PostToolUse", "UserPromptSubmit"] {
            assert!(settings["hooks"][event].is_array(), "missing event {event}");
        }
    }

    #[test]
    fn preserves_existing_user_hooks() {
        // A user already has a Prettier PostToolUse command hook.
        let mut settings = json!({
            "model": "claude-x",
            "hooks": {
                "PostToolUse": [
                    { "matcher": "Edit|Write", "hooks": [
                        { "type": "command", "command": "npx prettier --write" }
                    ]}
                ]
            }
        });
        apply_register(&mut settings, 40000);

        // Unrelated top-level key preserved.
        assert_eq!(settings["model"], "claude-x");
        // The user's Prettier command hook is still present.
        let post = settings["hooks"]["PostToolUse"].as_array().unwrap();
        let has_prettier = post.iter().any(|g| {
            g["hooks"].as_array().map_or(false, |hs| {
                hs.iter().any(|h| h["command"].as_str() == Some("npx prettier --write"))
            })
        });
        assert!(has_prettier, "user's command hook must be preserved");
        // GoFetch handler also added to PostToolUse.
        assert!(post.iter().any(|g| {
            g["hooks"].as_array().map_or(false, |hs| hs.iter().any(is_gofetch_handler))
        }));
    }

    #[test]
    fn re_register_is_idempotent() {
        let mut settings = json!({});
        apply_register(&mut settings, 31337);
        let first = count_gofetch_handlers(&settings);
        apply_register(&mut settings, 31337);
        let second = count_gofetch_handlers(&settings);
        assert_eq!(first, second, "re-registering must not duplicate handlers");
    }

    #[test]
    fn re_register_updates_port() {
        let mut settings = json!({});
        apply_register(&mut settings, 31337);
        apply_register(&mut settings, 49152);
        let urls: Vec<String> = settings["hooks"]["Stop"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|g| g["hooks"][0]["url"].as_str().map(str::to_string))
            .collect();
        assert!(urls.iter().all(|u| u.contains(":49152/")), "port should be updated, got {urls:?}");
    }

    #[test]
    fn unregister_removes_only_gofetch() {
        let mut settings = json!({
            "hooks": {
                "PostToolUse": [
                    { "matcher": "Edit|Write", "hooks": [
                        { "type": "command", "command": "npx prettier --write" }
                    ]}
                ]
            }
        });
        apply_register(&mut settings, 31337);
        apply_unregister(&mut settings);

        assert_eq!(count_gofetch_handlers(&settings), 0, "all GoFetch handlers removed");
        // User's Prettier hook survives.
        let post = settings["hooks"]["PostToolUse"].as_array().unwrap();
        assert!(post.iter().any(|g| {
            g["hooks"].as_array().map_or(false, |hs| {
                hs.iter().any(|h| h["command"].as_str() == Some("npx prettier --write"))
            })
        }));
        // GoFetch-only events were pruned entirely.
        assert!(settings["hooks"].get("Notification").is_none());
        assert!(settings["hooks"].get("StopFailure").is_none());
    }

    #[test]
    fn unregister_on_pure_gofetch_clears_hooks_block() {
        let mut settings = json!({ "other": 1 });
        apply_register(&mut settings, 31337);
        apply_unregister(&mut settings);
        assert!(settings.get("hooks").is_none(), "empty hooks block should be removed");
        assert_eq!(settings["other"], 1);
    }

    #[test]
    fn file_roundtrip_via_temp_path() {
        // Use a temp file to exercise load/save without touching the real one.
        let dir = std::env::temp_dir().join(format!("gofetch-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"existing": true}"#).unwrap();

        let mut settings = load(&path).unwrap();
        apply_register(&mut settings, 31337);
        save(&path, &settings).unwrap();

        let reloaded = load(&path).unwrap();
        assert_eq!(reloaded["existing"], true);
        assert_eq!(count_gofetch_handlers(&reloaded), 7); // 2 Notification + 5 others

        let mut cleaned = reloaded;
        apply_unregister(&mut cleaned);
        save(&path, &cleaned).unwrap();
        let after = load(&path).unwrap();
        assert_eq!(count_gofetch_handlers(&after), 0);
        assert_eq!(after["existing"], true);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn malformed_settings_is_not_clobbered() {
        let dir = std::env::temp_dir().join(format!("gofetch-bad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, "{ this is : not json ]").unwrap();

        // load() must error rather than returning {} (which would clobber on save).
        assert!(load(&path).is_err());

        std::fs::remove_dir_all(&dir).ok();
    }
}
