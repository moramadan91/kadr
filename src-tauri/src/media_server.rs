//! Local media server: http://127.0.0.1:PORT/TOKEN/<percent-encoded absolute path>.
//! WebKit won't stream video from the asset protocol, and frames from it are cross-origin
//! (tainted) so WebGL can't grade them. This serves only files the app allowlisted, with
//! Range support and CORS, on loopback only, behind a random token.
use std::collections::HashSet;
use std::fs::File;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct MediaServer {
    pub base: String,
    token: String,
    allowed: Mutex<HashSet<PathBuf>>,
}

fn random_token() -> String {
    let mut out = String::new();
    for i in 0..2u64 {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        h.write_u64(i ^ std::process::id() as u64);
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

fn decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn mime(p: &PathBuf) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" | "aac" => "audio/mp4",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }
}

impl MediaServer {
    pub fn start() -> std::io::Result<Arc<Self>> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let port = listener.local_addr()?.port();
        let token = random_token();
        let srv = Arc::new(Self { base: format!("http://127.0.0.1:{port}/{token}/"), token, allowed: Mutex::new(HashSet::new()) });
        let s2 = srv.clone();
        std::thread::spawn(move || {
            for conn in listener.incoming().flatten() {
                let s = s2.clone();
                std::thread::spawn(move || { let _ = s.handle(conn); });
            }
        });
        Ok(srv)
    }

    pub fn allow(&self, p: &str) {
        if let Ok(c) = std::fs::canonicalize(p) { self.allowed.lock().unwrap().insert(c); }
    }

    fn handle(&self, mut c: TcpStream) -> std::io::Result<()> {
        // Read headers (cap 16 KB).
        let mut buf = Vec::new();
        let mut chunk = [0u8; 2048];
        while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
            let n = c.read(&mut chunk)?;
            if n == 0 || buf.len() > 16384 { return Ok(()); }
            buf.extend_from_slice(&chunk[..n]);
        }
        let req = String::from_utf8_lossy(&buf).to_string();
        let mut lines = req.lines();
        let first: Vec<&str> = lines.next().unwrap_or("").split(' ').collect();
        let (method, target) = (first.first().copied().unwrap_or(""), first.get(1).copied().unwrap_or(""));
        let range = lines.find_map(|l| {
            let (k, v) = l.split_once(':')?;
            if k.trim().eq_ignore_ascii_case("range") { Some(v.trim().to_string()) } else { None }
        });

        let fail = |c: &mut TcpStream, code: &str| c.write_all(format!("HTTP/1.1 {code}\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n").as_bytes());
        if method != "GET" && method != "HEAD" { return fail(&mut c, "405 Method Not Allowed"); }
        let path = target.split('?').next().unwrap_or("");
        let Some(rest) = path.strip_prefix(&format!("/{}/", self.token)) else { return fail(&mut c, "403 Forbidden") };
        let Some(file) = decode(rest).and_then(|p| std::fs::canonicalize(p).ok()) else { return fail(&mut c, "404 Not Found") };
        if !self.allowed.lock().unwrap().contains(&file) { return fail(&mut c, "403 Forbidden"); }
        let Ok(mut f) = File::open(&file) else { return fail(&mut c, "404 Not Found") };
        let size = f.metadata()?.len();

        let (status, start, end) = match range.as_deref().and_then(|r| r.strip_prefix("bytes=")) {
            Some(r) => {
                let (a, b) = r.split_once('-').unwrap_or((r, ""));
                let (start, end) = if a.is_empty() {
                    let n: u64 = b.parse().unwrap_or(0);
                    (size.saturating_sub(n), size.saturating_sub(1))
                } else {
                    let s: u64 = a.parse().unwrap_or(0);
                    let e: u64 = b.parse().unwrap_or(size.saturating_sub(1)).min(size.saturating_sub(1));
                    (s, e)
                };
                if start >= size || start > end {
                    return c.write_all(format!("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{size}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes());
                }
                ("206 Partial Content", start, end)
            }
            None => ("200 OK", 0, size.saturating_sub(1)),
        };
        let len = if size == 0 { 0 } else { end - start + 1 };
        let mut head = format!("HTTP/1.1 {status}\r\nContent-Type: {}\r\nContent-Length: {len}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n", mime(&file));
        if status.starts_with("206") { head.push_str(&format!("Content-Range: bytes {start}-{end}/{size}\r\n")); }
        head.push_str("\r\n");
        c.write_all(head.as_bytes())?;
        if method == "HEAD" || len == 0 { return Ok(()); }
        f.seek(SeekFrom::Start(start))?;
        std::io::copy(&mut f.take(len), &mut c)?;
        Ok(())
    }
}
