// AI frame interpolation (RIFE, rife-ncnn-vulkan, MIT) for smooth slow motion.
// The tool is downloaded once into app data. A clip's source range is turned into a high-frame-rate
// copy (factor x the frames), cached by its inputs; preview proxy and export then retime that copy.
use super::{command, err, sidecar, tail, R};
use serde_json::json;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
const TOOL_URL: &str = "https://github.com/moramadan91/kadr/releases/download/rife-v1/rife-macos.zip";
#[cfg(not(target_os = "macos"))]
const TOOL_URL: &str = "https://github.com/moramadan91/kadr/releases/download/rife-v1/rife-windows.zip";
const MODEL: &str = "rife-v4.6";

fn root(app: &AppHandle) -> R<PathBuf> {
    Ok(app.path().app_data_dir().map_err(err)?.join("rife"))
}
fn tool(app: &AppHandle) -> R<PathBuf> {
    Ok(root(app)?.join("tool").join(if cfg!(windows) { "rife-ncnn-vulkan.exe" } else { "rife-ncnn-vulkan" }))
}

#[tauri::command]
pub fn rife_ready(app: AppHandle) -> R<bool> {
    let t = tool(&app)?;
    Ok(t.exists() && t.with_file_name(MODEL).join("flownet.bin").exists())
}

#[tauri::command]
pub async fn rife_download(app: AppHandle) -> R<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = tool(&app)?.parent().unwrap().to_path_buf();
        std::fs::create_dir_all(&dir).map_err(err)?;
        let res = ureq::get(TOOL_URL).call().map_err(err)?;
        let total: f64 = res.header("content-length").and_then(|s| s.parse().ok()).unwrap_or(0.0);
        let zip = dir.join("rife.zip.part");
        let mut w = std::fs::File::create(&zip).map_err(err)?;
        let (mut r, mut buf) = (res.into_reader(), vec![0u8; 1 << 16]);
        let (mut got, mut last) = (0f64, 0f64);
        loop {
            let n = r.read(&mut buf).map_err(err)?;
            if n == 0 { break; }
            w.write_all(&buf[..n]).map_err(err)?;
            got += n as f64;
            if total > 0.0 && got / total - last > 0.005 {
                last = got / total;
                let _ = app.emit("progress", json!({ "label": "rife", "p": last }));
            }
        }
        drop(w);
        // bsdtar reads zip on macOS and on Windows 10+
        let out = command(Path::new("tar")).arg("-xf").arg(&zip).arg("-C").arg(&dir).output().map_err(err)?;
        let _ = std::fs::remove_file(&zip);
        if !out.status.success() { return Err(tail(&String::from_utf8_lossy(&out.stderr))); }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(tool(&app)?, std::fs::Permissions::from_mode(0o755));
        }
        if rife_ready(app.clone())? { Ok(()) } else { Err("rife: files missing after unpacking".into()) }
    }).await.map_err(err)?
}

fn ffmpeg(args: &[String]) -> R<String> {
    let o = command(&sidecar("ffmpeg")).args(args).stdin(Stdio::null()).output().map_err(err)?;
    let e = String::from_utf8_lossy(&o.stderr).into_owned();
    if o.status.success() { Ok(String::from_utf8_lossy(&o.stdout).into_owned()) } else { Err(tail(&e)) }
}
fn pngs(d: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(d).map(|r| r.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().is_some_and(|x| x == "png")).collect()).unwrap_or_default();
    v.sort();
    v
}

/// Source [start, start+len] of `path` -> mp4 with `factor` x the frames at the same duration.
/// Scene cuts are not interpolated across (RIFE would morph one shot into the next).
#[tauri::command]
pub async fn rife_make(app: AppHandle, path: String, start: f64, len: f64, factor: u32, job: String) -> R<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::hash::{Hash, Hasher};
        let factor = factor.clamp(2, 8);
        let mut h = std::collections::hash_map::DefaultHasher::new();
        (&path, format!("{start:.3}"), format!("{len:.3}"), factor, MODEL).hash(&mut h);
        let outd = root(&app)?.join("out");
        std::fs::create_dir_all(&outd).map_err(err)?;
        let out = outd.join(format!("{:016x}.mp4", h.finish()));
        let srv = app.state::<std::sync::Arc<super::MediaServer>>();
        if out.exists() { let s = out.to_string_lossy().into_owned(); srv.allow(&s); return Ok(s); }
        let prog = |p: f64| { let _ = app.emit("rifeprog", json!({ "job": job, "p": p.clamp(0.0, 0.99) })); };
        let work = root(&app)?.join(format!("work-{:016x}", h.finish()));
        let _ = std::fs::remove_dir_all(&work);
        let (ind, outf) = (work.join("in"), work.join("out"));
        std::fs::create_dir_all(&ind).map_err(err)?;
        std::fs::create_dir_all(&outf).map_err(err)?;
        let s = |x: &str| x.to_string();
        let run = || -> R<()> {
            // 1. frames of the range, long side capped at 1920
            ffmpeg(&[s("-v"), s("error"), s("-ss"), format!("{start:.3}"), s("-t"), format!("{len:.3}"), s("-i"), path.clone(),
                s("-vf"), s("scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'"), s("-fps_mode"), s("passthrough"), ind.join("%08d.png").to_string_lossy().into_owned()])?;
            let frames = pngs(&ind);
            if frames.len() < 2 { return Err("rife: clip too short".into()); }
            let fps = frames.len() as f64 / len.max(0.01);
            prog(0.08);
            // 2. scene cuts: at 1 fps input, pts_time is the frame index
            let meta = ffmpeg(&[s("-v"), s("error"), s("-framerate"), s("1"), s("-i"), ind.join("%08d.png").to_string_lossy().into_owned(),
                s("-vf"), s("select='gt(scene,0.3)',metadata=print:file=-"), s("-an"), s("-f"), s("null"), s("-")])?;
            let mut cuts: Vec<usize> = meta.lines().filter_map(|l| l.split("pts_time:").nth(1)).filter_map(|v| v.trim().parse::<f64>().ok()).map(|v| v.round() as usize).filter(|&i| i > 0).collect();
            cuts.push(frames.len());
            // 3. each shot on its own
            let (mut a, mut k) = (0usize, 0usize);
            let emit = |p: &Path, k: &mut usize| -> R<()> { *k += 1; std::fs::rename(p, outf.join(format!("{:08}.png", *k))).or_else(|_| std::fs::copy(p, outf.join(format!("{:08}.png", *k))).map(|_| ())).map_err(err) };
            for &b in &cuts {
                let seg = &frames[a..b];
                if seg.len() == 1 {
                    for _ in 0..factor { std::fs::copy(&seg[0], outf.join(format!("{:08}.png", { k += 1; k }))).map_err(err)?; }
                } else if !seg.is_empty() {
                    let (si, so) = (work.join("si"), work.join("so"));
                    let _ = std::fs::remove_dir_all(&si); let _ = std::fs::remove_dir_all(&so);
                    std::fs::create_dir_all(&si).map_err(err)?; std::fs::create_dir_all(&so).map_err(err)?;
                    for (i, f) in seg.iter().enumerate() { std::fs::rename(f, si.join(format!("{:08}.png", i + 1))).map_err(err)?; }
                    let n = seg.len() * factor as usize;
                    let o = command(&tool(&app)?).current_dir(tool(&app)?.parent().unwrap())
                        .arg("-i").arg(&si).arg("-o").arg(&so).arg("-m").arg(MODEL).arg("-n").arg(n.to_string())
                        .stdin(Stdio::null()).output().map_err(err)?;
                    let got = pngs(&so);
                    if !o.status.success() || got.len() != n { return Err(format!("rife failed: {}", tail(&String::from_utf8_lossy(&o.stderr)))); }
                    for f in &got { emit(f, &mut k)?; }
                }
                a = b;
                prog(0.08 + 0.82 * a as f64 / frames.len() as f64);
            }
            // 4. same duration, factor x the frame rate
            let tmp = out.with_extension("part.mp4");
            ffmpeg(&[s("-v"), s("error"), s("-y"), s("-framerate"), format!("{:.4}", fps * factor as f64), s("-i"), outf.join("%08d.png").to_string_lossy().into_owned(),
                s("-c:v"), s("libx264"), s("-preset"), s("fast"), s("-crf"), s("16"), s("-g"), s("24"), s("-pix_fmt"), s("yuv420p"), tmp.to_string_lossy().into_owned()])?;
            std::fs::rename(&tmp, &out).map_err(err)
        };
        let r = run();
        let _ = std::fs::remove_dir_all(&work);
        r?;
        let s = out.to_string_lossy().into_owned();
        srv.allow(&s);
        Ok(s)
    }).await.map_err(err)?
}
