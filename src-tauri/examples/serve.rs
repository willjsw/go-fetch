//! Run only the localhost hook server (no Tauri window) for manual / curl
//! testing and the non-interference checks (Task 8). Usage:
//!
//! ```sh
//! cargo run --example serve --manifest-path src-tauri/Cargo.toml
//! # then in another shell:
//! curl -s -o /dev/null -w '%{http_code}\n' -XPOST localhost:31337/event \
//!   -H 'content-type: application/json' \
//!   -d '{"session_id":"s1","hook_event_name":"Stop"}'
//! ```

use std::sync::Arc;

#[tokio::main]
async fn main() {
    let manager = gofetch_lib::session::SessionManager::new();
    // No-op UI notifier + no-op port reporter — this example only serves HTTP.
    gofetch_lib::server::run(manager, Arc::new(|_: &str| {}), |_port| {}).await;
}
