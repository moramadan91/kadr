// In-app assistant: runs the user's own Claude Code CLI (their login, their plan) headless, with only this
// app's MCP tools (`kadr --mcp`), and streams its JSON events to the page.
use super::{err, R};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

static RUNNING: Mutex<Option<HashMap<String, Child>>> = Mutex::new(None);

/// Apps started from the Dock/Explorer don't get the shell PATH, so look where the installers put it.
fn find_claude() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default());
    let names: &[&str] = if cfg!(windows) { &["claude.exe", "claude.cmd"] } else { &["claude"] };
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    dirs.extend([home.join(".local/bin"), home.join(".claude/local"), home.join(".npm-global/bin"), home.join(".bun/bin")]);
    if cfg!(windows) {
        if let Ok(a) = std::env::var("APPDATA") { dirs.push(PathBuf::from(a).join("npm")); }
    } else {
        dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    }
    dirs.iter().flat_map(|d| names.iter().map(move |n| d.join(n))).find(|p| p.is_file())
}

#[tauri::command]
pub fn assistant_ready() -> bool {
    find_claude().is_some()
}

const SYSTEM: &str = "You are the assistant inside Maqto, a video editor open on the user's screen. \
The maqto tools edit the open project live; start with get_project and catalog when you need to know what is there, \
and check visual work with preview. Do what the user asks with those tools, then answer in one or two short sentences \
in the user's language (Egyptian Arabic if they write Arabic). You cannot read or change files on the computer.";

/// One turn. `session` continues an earlier conversation. Events go out as "assistant-ev" {job, ev}.
#[tauri::command]
pub async fn assistant_ask(app: AppHandle, prompt: String, session: Option<String>, job: String) -> R<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let claude = find_claude().ok_or("claude-missing")?;
        let exe = std::env::current_exe().map_err(err)?;
        let cfg = json!({ "mcpServers": { "maqto": { "command": exe, "args": ["--mcp"] } } }).to_string();
        let dir = app.path().app_data_dir().map_err(err)?.join("assistant");
        std::fs::create_dir_all(&dir).map_err(err)?;
        let mut cmd = Command::new(&claude);
        cmd.current_dir(&dir) // no project CLAUDE.md gets pulled in
            .args(["-p", &prompt, "--output-format", "stream-json", "--verbose", "--mcp-config", &cfg, "--strict-mcp-config",
                "--tools", "", "--allowedTools", "mcp__maqto", "--permission-mode", "dontAsk", "--append-system-prompt", SYSTEM])
            .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        if let Some(s) = session.filter(|s| !s.is_empty()) { cmd.args(["--resume", &s]); }
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; cmd.creation_flags(0x0800_0000); }
        let mut child = cmd.spawn().map_err(err)?;
        let (out, mut er) = (child.stdout.take().unwrap(), child.stderr.take().unwrap());
        RUNNING.lock().unwrap().get_or_insert_with(HashMap::new).insert(job.clone(), child);
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            if let Ok(ev) = serde_json::from_str::<Value>(&line) { let _ = app.emit("assistant-ev", json!({ "job": job, "ev": ev })); }
        }
        let mut e = String::new();
        let _ = er.read_to_string(&mut e);
        let child = RUNNING.lock().unwrap().as_mut().and_then(|m| m.remove(&job));
        let ok = child.map(|mut c| c.wait().map(|s| s.success()).unwrap_or(false)).unwrap_or(true); // gone = stopped
        if ok { Ok(()) } else { Err(super::tail(&e)) }
    }).await.map_err(err)?
}

#[tauri::command]
pub fn assistant_stop(job: String) {
    if let Some(mut c) = RUNNING.lock().unwrap().as_mut().and_then(|m| m.remove(&job)) { let _ = c.kill(); let _ = c.wait(); }
}
