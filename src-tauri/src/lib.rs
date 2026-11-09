mod media_server;

use media_server::MediaServer;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

const MODEL_NAME: &str = "ggml-small.bin";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";
const IMAGE_EXT: [&str; 6] = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];

#[derive(Default)]
struct AppState {
    job: Arc<Mutex<Option<Child>>>,
    dirs: Mutex<HashMap<u32, PathBuf>>,
    next: Mutex<u32>,
}

type R<T> = Result<T, String>;
fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn exe_name(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

// Sidecars sit next to the app executable (bundle and dev target dir).
fn sidecar(name: &str) -> PathBuf {
    let dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)).unwrap_or_default();
    dir.join(exe_name(name))
}

fn command(bin: &Path) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

fn tail(s: &str) -> String {
    let lines: Vec<&str> = s.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    lines[lines.len().saturating_sub(4)..].join("\n")
}

/// Run a long job; every output line goes to `on_line`. Killable through `cancel`.
fn run_job(state: &AppState, bin: &Path, args: &[String], on_line: impl Fn(&str) + Send + Sync + 'static) -> R<()> {
    let mut child = command(bin).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("{}: {e}", bin.display()))?;
    let out = child.stdout.take().unwrap();
    let errp = child.stderr.take().unwrap();
    *state.job.lock().unwrap() = Some(child);
    let on_line = Arc::new(on_line);
    let f2 = on_line.clone();
    let err_buf = Arc::new(Mutex::new(String::new()));
    let eb = err_buf.clone();
    let t_err = std::thread::spawn(move || {
        let mut r = BufReader::new(errp);
        let mut buf = Vec::new();
        // whisper prints progress with \r, so split on both
        let mut byte = [0u8; 1];
        while r.read(&mut byte).map(|n| n > 0).unwrap_or(false) {
            if byte[0] == b'\n' || byte[0] == b'\r' {
                let l = String::from_utf8_lossy(&buf).to_string();
                f2(&l);
                let mut e = eb.lock().unwrap();
                e.push_str(&l);
                e.push('\n');
                if e.len() > 8000 { let cut = e.len() - 8000; let cut = (cut..e.len()).find(|i| e.is_char_boundary(*i)).unwrap_or(0); e.drain(..cut); }
                buf.clear();
            } else {
                buf.push(byte[0]);
            }
        }
    });
    for l in BufReader::new(out).lines().map_while(Result::ok) {
        on_line(&l);
    }
    t_err.join().ok();
    let status = state.job.lock().unwrap().take().map(|mut c| c.wait());
    match status {
        Some(Ok(s)) if s.success() => Ok(()),
        Some(Ok(_)) => Err(tail(&err_buf.lock().unwrap())),
        Some(Err(e)) => Err(err(e)),
        None => Err("cancelled".into()),
    }
}

#[tauri::command]
fn cancel(state: State<AppState>) {
    if let Some(mut c) = state.job.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
}

fn probe_one(p: &str) -> R<Value> {
    let out = command(&sidecar("ffprobe"))
        .args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams", p])
        .output().map_err(err)?;
    if !out.status.success() { return Err(tail(&String::from_utf8_lossy(&out.stderr))); }
    let j: Value = serde_json::from_slice(&out.stdout).map_err(err)?;
    let streams = j["streams"].as_array().cloned().unwrap_or_default();
    let v = streams.iter().find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"] != 1);
    let a = streams.iter().find(|s| s["codec_type"] == "audio");
    if v.is_none() && a.is_none() { return Err("unsupported file".into()); }
    let ext = Path::new(p).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let is_img = IMAGE_EXT.contains(&ext.as_str());
    let (mut w, mut h) = v.map(|v| (v["width"].as_u64().unwrap_or(0), v["height"].as_u64().unwrap_or(0))).unwrap_or((0, 0));
    let rot = v.and_then(|v| {
        v["side_data_list"].as_array().and_then(|l| l.iter().find_map(|d| d["rotation"].as_f64()))
            .or_else(|| v["tags"]["rotate"].as_str().and_then(|s| s.parse().ok()))
    }).unwrap_or(0.0).abs() as i64;
    if rot == 90 || rot == 270 { std::mem::swap(&mut w, &mut h); }
    let num = |x: &Value| x.as_str().and_then(|s| s.parse::<f64>().ok());
    let dur = num(&j["format"]["duration"]).or_else(|| v.and_then(|v| num(&v["duration"]))).or_else(|| a.and_then(|a| num(&a["duration"]))).unwrap_or(0.0);
    let kind = if is_img { "image" } else if v.is_some() { "video" } else { "audio" };
    let name = Path::new(p).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    Ok(json!({ "path": p, "name": name, "kind": kind, "dur": if is_img { Value::Null } else { json!(dur) },
        "w": w, "h": h, "hasAudio": a.is_some() && !is_img }))
}

#[tauri::command]
fn media_base(srv: State<Arc<MediaServer>>) -> String {
    srv.base.clone()
}

#[tauri::command]
async fn probe(srv: State<'_, Arc<MediaServer>>, paths: Vec<String>) -> Result<Value, ()> {
    let srv = srv.inner().clone();
    Ok(tauri::async_runtime::spawn_blocking(move || {
        let (mut ok, mut bad) = (vec![], vec![]);
        for p in paths {
            match probe_one(&p) {
                Ok(v) => { srv.allow(&p); ok.push(v) }
                Err(e) => bad.push(format!("{}: {e}", Path::new(&p).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or(p.clone()))),
            }
        }
        json!({ "ok": ok, "bad": bad })
    }).await.unwrap_or(json!({ "ok": [], "bad": [] })))
}

#[tauri::command]
fn save_project(path: String, json: String) -> R<()> {
    if !path.ends_with(".kadr") { return Err("project files end with .kadr".into()); }
    std::fs::write(path, json).map_err(err)
}

#[tauri::command]
fn open_project(srv: State<Arc<MediaServer>>, path: String) -> R<Value> {
    if !path.ends_with(".kadr") { return Err("project files end with .kadr".into()); }
    let mut p: Value = serde_json::from_str(&std::fs::read_to_string(&path).map_err(err)?).map_err(err)?;
    let mut missing = vec![];
    if let Some(m) = p["media"].as_object_mut() {
        for v in m.values() {
            if let Some(f) = v["path"].as_str() {
                if Path::new(f).exists() { srv.allow(f); } else { missing.push(v["name"].clone()); }
            }
        }
    }
    Ok(json!({ "project": p.take(), "missing": missing }))
}

#[tauri::command]
fn work_begin(state: State<AppState>) -> R<Value> {
    let mut n = state.next.lock().unwrap();
    *n += 1;
    let dir = std::env::temp_dir().join(format!("kadr-{}-{}", std::process::id(), *n));
    std::fs::create_dir_all(&dir).map_err(err)?;
    state.dirs.lock().unwrap().insert(*n, dir.clone());
    Ok(json!({ "id": *n, "path": dir.to_string_lossy().replace('\\', "/") }))
}

fn work_dir(state: &AppState, id: u32) -> R<PathBuf> {
    state.dirs.lock().unwrap().get(&id).cloned().ok_or_else(|| "bad work dir".to_string())
}

#[tauri::command]
fn work_end(state: State<AppState>, id: u32) {
    if let Some(d) = state.dirs.lock().unwrap().remove(&id) { let _ = std::fs::remove_dir_all(d); }
}

// Raw body: PNG bytes. Headers: x-id (work dir), x-name (fNNNNN.png).
#[tauri::command]
fn write_frame(state: State<AppState>, request: tauri::ipc::Request) -> R<()> {
    let h = request.headers();
    let id: u32 = h.get("x-id").and_then(|v| v.to_str().ok()).and_then(|s| s.parse().ok()).ok_or("x-id")?;
    let name = h.get("x-name").and_then(|v| v.to_str().ok()).ok_or("x-name")?;
    let ok = name.len() == 10 && name.starts_with('f') && name.ends_with(".png") && name[1..6].chars().all(|c| c.is_ascii_digit());
    if !ok { return Err("bad frame name".into()); }
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("expected raw body".into()) };
    std::fs::write(work_dir(&state, id)?.join(name), bytes).map_err(err)
}

// Raw body: recorded audio. Header x-ext: m4a | webm. Saved under app data/recordings.
#[tauri::command]
fn save_recording(app: AppHandle, request: tauri::ipc::Request) -> R<String> {
    let ext = request.headers().get("x-ext").and_then(|v| v.to_str().ok()).unwrap_or("m4a");
    let ext = if ext == "webm" { "webm" } else { "m4a" };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("expected raw body".into()) };
    let dir = app.path().app_data_dir().map_err(err)?.join("recordings");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let file = dir.join(format!("voiceover-{secs}.{ext}"));
    std::fs::write(&file, bytes).map_err(err)?;
    Ok(file.to_string_lossy().to_string())
}

#[tauri::command]
async fn export_run(app: AppHandle, id: u32, args: Vec<String>, concat: Option<String>, duration: f64) -> R<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let dir = work_dir(&state, id)?;
        if let Some(c) = concat { std::fs::write(dir.join("text.ffconcat"), c).map_err(err)?; }
        let a = app.clone();
        let r = run_job(&state, &sidecar("ffmpeg"), &args, move |l| {
            if let Some(us) = l.strip_prefix("out_time_us=").and_then(|s| s.trim().parse::<f64>().ok()) {
                let _ = a.emit("progress", json!({ "label": "export", "p": (us / 1e6 / duration).clamp(0.0, 1.0) }));
            }
        });
        if let Some(d) = state.dirs.lock().unwrap().remove(&id) { let _ = std::fs::remove_dir_all(d); }
        r
    }).await.map_err(err)?
}

fn model_path(app: &AppHandle) -> R<PathBuf> {
    Ok(app.path().app_data_dir().map_err(err)?.join("models").join(MODEL_NAME))
}

#[tauri::command]
fn model_ready(app: AppHandle) -> R<bool> {
    Ok(model_path(&app)?.exists())
}

#[tauri::command]
async fn model_download(app: AppHandle) -> R<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = model_path(&app)?;
        std::fs::create_dir_all(file.parent().unwrap()).map_err(err)?;
        let res = ureq::get(MODEL_URL).call().map_err(err)?;
        let total: f64 = res.header("content-length").and_then(|s| s.parse().ok()).unwrap_or(0.0);
        let part = file.with_extension("part");
        let mut w = std::fs::File::create(&part).map_err(err)?;
        let mut r = res.into_reader();
        let mut buf = vec![0u8; 1 << 16];
        let (mut got, mut last) = (0f64, 0f64);
        loop {
            let n = r.read(&mut buf).map_err(err)?;
            if n == 0 { break; }
            w.write_all(&buf[..n]).map_err(err)?;
            got += n as f64;
            if total > 0.0 && got / total - last > 0.005 {
                last = got / total;
                let _ = app.emit("progress", json!({ "label": "model", "p": last }));
            }
        }
        w.flush().map_err(err)?;
        drop(w);
        std::fs::rename(part, file).map_err(err)
    }).await.map_err(err)?
}

fn find_whisper() -> Option<PathBuf> {
    // shortcut: falls back to a system whisper.cpp (brew install whisper-cpp); bundle whisper-cli as a sidecar before wide release.
    let bundled = sidecar("whisper-cli");
    if bundled.exists() { return Some(bundled); }
    let mut dirs: Vec<PathBuf> = vec!["/opt/homebrew/bin".into(), "/usr/local/bin".into()];
    if let Some(p) = std::env::var_os("PATH") { dirs.extend(std::env::split_paths(&p)); }
    dirs.into_iter().map(|d| d.join(exe_name("whisper-cli"))).find(|p| p.exists())
}

#[tauri::command]
async fn transcribe(app: AppHandle, id: u32, audio_args: Vec<String>, lang: String) -> R<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let whisper = find_whisper().ok_or("whisper")?;
        let dir = work_dir(&state, id)?;
        let a = app.clone();
        let _ = a.emit("progress", json!({ "label": "audio", "p": 0 }));
        let r = (|| {
            run_job(&state, &sidecar("ffmpeg"), &audio_args, |_| {})?;
            let base = dir.join("out");
            let threads = std::thread::available_parallelism().map(|n| n.get().clamp(2, 8)).unwrap_or(4).to_string();
            let args: Vec<String> = ["-m", &model_path(&app)?.to_string_lossy(), "-f", &dir.join("mix.wav").to_string_lossy(),
                "-l", &lang, "-ml", "1", "-sow", "-oj", "-of", &base.to_string_lossy(), "-t", &threads, "-pp", "-np"]
                .iter().map(|s| s.to_string()).collect();
            let a2 = a.clone();
            run_job(&state, &whisper, &args, move |l| {
                if let Some(i) = l.find("progress =") {
                    if let Ok(p) = l[i + 10..].trim().trim_end_matches('%').trim().parse::<f64>() {
                        let _ = a2.emit("progress", json!({ "label": "asr", "p": p / 100.0 }));
                    }
                }
            })?;
            std::fs::read_to_string(base.with_extension("json")).map_err(err)
        })();
        if let Some(d) = state.dirs.lock().unwrap().remove(&id) { let _ = std::fs::remove_dir_all(d); }
        r
    }).await.map_err(err)?
}

// Dev builds only: KADR_DEMO="a.mp4;b.wav" preloads media, KADR_DEMO_EXPORT=out.mp4 exports it. Lets tests drive the app.
#[tauri::command]
fn dev_demo() -> Value {
    if !cfg!(debug_assertions) { return json!({}); }
    let paths: Vec<String> = std::env::var("KADR_DEMO").unwrap_or_default().split(';').filter(|s| !s.is_empty()).map(String::from).collect();
    json!({ "paths": paths, "export": std::env::var("KADR_DEMO_EXPORT").ok() })
}

#[tauri::command]
fn dev_log(msg: String) {
    if cfg!(debug_assertions) { eprintln!("[web] {msg}"); }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .manage(MediaServer::start().expect("media server"))
        .invoke_handler(tauri::generate_handler![
            probe, save_project, open_project, work_begin, work_end, write_frame, export_run,
            cancel, model_ready, model_download, transcribe, save_recording, dev_demo, dev_log, media_base
        ])
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::Destroyed = e {
                let st = w.state::<AppState>();
                if let Some(mut c) = st.job.lock().unwrap().take() { let _ = c.kill(); }
                for (_, d) in st.dirs.lock().unwrap().drain() { let _ = std::fs::remove_dir_all(d); }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Kadr");
}
