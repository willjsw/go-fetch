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

#[tokio::main]
async fn main() {
    gofetch_lib::server::run().await;
}
