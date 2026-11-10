//! Claude Code (or any MCP client) drives the open editor live.
//!
//! The app listens on loopback behind a random token and writes {port, token} to
//! <app data>/mcp.json. `kadr --mcp` is a stdio MCP server: it answers `initialize` itself and
//! forwards tools/list and tools/call to the running app, starting the app first if needed. The
//! page runs every tool (it owns the project), so edits land on the timeline as they happen.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Same folder Tauri uses for app data (identifier app.kadr.editor).
fn data_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    let base = PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library/Application Support");
    #[cfg(target_os = "windows")]
    let base = PathBuf::from(std::env::var("APPDATA").unwrap_or_default());
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let base = PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".local/share");
    base.join("app.kadr.editor")
}
fn info_path() -> PathBuf { data_dir().join("mcp.json") }

pub struct Bridge {
    pending: Mutex<HashMap<u64, mpsc::Sender<Value>>>,
    next: AtomicU64,
}

impl Bridge {
    pub fn start(app: AppHandle) -> Arc<Self> {
        let br = Arc::new(Self { pending: Mutex::new(HashMap::new()), next: AtomicU64::new(1) });
        let Ok(listener) = TcpListener::bind("127.0.0.1:0") else { return br };
        let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
        let token = crate::media_server::random_token();
        let _ = std::fs::create_dir_all(data_dir());
        let _ = std::fs::write(info_path(), json!({ "port": port, "token": token, "pid": std::process::id() }).to_string());
        let b2 = br.clone();
        std::thread::spawn(move || {
            for conn in listener.incoming().flatten() {
                let (b, a, tk) = (b2.clone(), app.clone(), token.clone());
                std::thread::spawn(move || { let _ = b.handle(conn, &a, &tk); });
            }
        });
        br
    }

    fn handle(&self, mut conn: TcpStream, app: &AppHandle, token: &str) -> std::io::Result<()> {
        let mut rd = BufReader::new(conn.try_clone()?);
        let mut line = String::new();
        rd.read_line(&mut line)?;
        let ok_path = line.split_whitespace().nth(1) == Some(&format!("/{token}"));
        let mut len = 0usize;
        loop {
            let mut h = String::new();
            if rd.read_line(&mut h)? == 0 || h.trim().is_empty() { break; }
            if let Some((k, v)) = h.split_once(':') { if k.eq_ignore_ascii_case("content-length") { len = v.trim().parse().unwrap_or(0); } }
        }
        let mut body = vec![0u8; len.min(64 << 20)];
        rd.read_exact(&mut body)?;
        let out = if !ok_path {
            json!({ "error": "bad token" })
        } else {
            let req: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
            let id = self.next.fetch_add(1, Ordering::Relaxed);
            let (tx, rx) = mpsc::channel();
            self.pending.lock().unwrap().insert(id, tx);
            let _ = app.emit("mcp-call", json!({ "id": id, "method": req["method"], "params": req["params"] }));
            let r = rx.recv_timeout(Duration::from_secs(600)).unwrap_or(json!({ "error": "the editor did not answer" }));
            self.pending.lock().unwrap().remove(&id);
            r
        };
        let s = out.to_string();
        write!(conn, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{s}", s.len())
    }

    pub fn reply(&self, id: u64, v: Value) {
        if let Some(tx) = self.pending.lock().unwrap().remove(&id) { let _ = tx.send(v); }
    }
}

#[tauri::command]
pub fn mcp_reply(id: u64, result: Value, state: tauri::State<Arc<Bridge>>) { state.reply(id, result); }

/* ---------- `kadr --mcp`: stdio MCP server that forwards to the running app ---------- */

fn call_app(method: &str, params: &Value) -> Result<Value, String> {
    let info: Value = std::fs::read(info_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).ok_or("no app")?;
    let url = format!("http://127.0.0.1:{}/{}", info["port"], info["token"].as_str().unwrap_or(""));
    let r = ureq::post(&url).timeout(Duration::from_secs(610)).set("Content-Type", "application/json")
        .send_string(&json!({ "method": method, "params": params }).to_string()).map_err(|e| e.to_string())?;
    serde_json::from_str(&r.into_string().map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

// The editor isn't running (or mcp.json is stale): start it and wait for its bridge.
fn ensure_app() -> Result<(), String> {
    if call_app("ping", &Value::Null).is_ok() { return Ok(()); }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    std::process::Command::new(exe).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
        .spawn().map_err(|e| e.to_string())?;
    for _ in 0..60 {
        std::thread::sleep(Duration::from_millis(500));
        if call_app("ping", &Value::Null).is_ok() { return Ok(()); }
    }
    Err("Maqto did not start".into())
}

fn forward(method: &str, params: &Value) -> Result<Value, String> {
    ensure_app()?;
    let r = call_app(method, params)?;
    match r.get("error") { Some(e) if !e.is_null() => Err(e.as_str().map(String::from).unwrap_or(e.to_string())), _ => Ok(r["result"].clone()) }
}

pub fn serve_stdio() {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    for line in stdin.lock().lines().map_while(Result::ok) {
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        let Some(id) = msg.get("id").cloned() else { continue }; // notifications need no answer
        let method = msg["method"].as_str().unwrap_or("");
        let params = &msg["params"];
        let res: Result<Value, (i64, String)> = match method {
            "initialize" => Ok(json!({
                "protocolVersion": params["protocolVersion"].as_str().unwrap_or("2025-06-18"),
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "maqto", "version": env!("CARGO_PKG_VERSION") },
                "instructions": "Maqto is a video editor open on the user's screen. Every tool edits the open project live. Start with get_project and catalog; check your work with preview (it returns a frame image).",
            })),
            "ping" => Ok(json!({})),
            "tools/list" => forward("tools/list", params).map_err(|e| (-32603, e)),
            // a tool failure is a tool result the model can read, not a protocol error
            "tools/call" => Ok(forward("tools/call", params).unwrap_or_else(|e| json!({ "content": [{ "type": "text", "text": e }], "isError": true }))),
            _ => Err((-32601, format!("unknown method {method}"))),
        };
        let reply = match res {
            Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
            Err((code, m)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": m } }),
        };
        let _ = writeln!(out, "{reply}");
        let _ = out.flush();
    }
}
