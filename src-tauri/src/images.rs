//! Product-image downloading.
//!
//! Downloads a catalogue product image over HTTPS and stores it on disk next
//! to the SQLite database, under `<app_local_data_dir>/product_images/`.
//!
//! The command is deliberately synchronous (blocking `reqwest`): it runs on a
//! Tauri command worker thread, so it does not block the UI, and keeping it
//! blocking avoids pulling a full async runtime into the app.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

/// Result returned to the frontend after a successful download.
#[derive(serde::Serialize)]
pub struct DownloadedImage {
    /// Absolute path of the saved file on disk.
    pub path: String,
    /// File name only (kept if the caller wants to build asset URLs itself).
    pub file_name: String,
    /// Size in bytes.
    pub bytes: u64,
}

/// Errors surfaced to the frontend as plain strings.
#[derive(Debug, thiserror::Error)]
pub enum ImageError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("http error: {0}")]
    Http(String),
    #[error("invalid url")]
    InvalidUrl,
    #[error("unsupported content: {0}")]
    Unsupported(String),
    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for ImageError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Directory where product images are stored (created if missing).
fn images_dir(app: &AppHandle) -> Result<PathBuf, ImageError> {
    let mut dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| ImageError::Other(format!("app_local_data_dir: {e}")))?;
    dir.push("product_images");
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

/// Pick a file extension from the URL / content-type; default to `.jpg`.
fn extension_for(url: &str, content_type: Option<&str>) -> String {
    let from_ct = content_type.and_then(|ct| {
        let ct = ct.to_ascii_lowercase();
        if ct.contains("webp") {
            Some("webp")
        } else if ct.contains("png") {
            Some("png")
        } else if ct.contains("jpeg") || ct.contains("jpg") {
            Some("jpg")
        } else if ct.contains("gif") {
            Some("gif")
        } else {
            None
        }
    });
    if let Some(ext) = from_ct {
        return ext.to_string();
    }
    // Fall back to the URL's extension.
    let lower = url.split('?').next().unwrap_or(url).to_ascii_lowercase();
    for ext in ["webp", "png", "jpeg", "jpg", "gif"] {
        if lower.ends_with(&format!(".{ext}")) {
            return if ext == "jpeg" { "jpg".into() } else { ext.into() };
        }
    }
    "jpg".into()
}

/// Deterministic file name from the URL so re-downloading the same image
/// overwrites rather than duplicates.
fn file_name_for(url: &str, ext: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let hash = hasher.finalize();
    let hex: String = hash.iter().take(16).map(|b| format!("{b:02x}")).collect();
    format!("{hex}.{ext}")
}

/// Download `url` into the product-images directory.
///
/// * Only http/https URLs are accepted.
/// * A 10 MB cap protects against pathological responses.
/// * Returns the absolute on-disk path.
#[tauri::command]
pub fn download_image(app: AppHandle, url: String) -> Result<DownloadedImage, ImageError> {
    let url = url.trim().to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(ImageError::InvalidUrl);
    }

    let client = reqwest::blocking::Client::builder()
        .user_agent("SmartGestion/1.0")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| ImageError::Http(e.to_string()))?;

    let resp = client
        .get(&url)
        .send()
        .map_err(|e| ImageError::Http(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(ImageError::Http(format!("status {}", resp.status())));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Reject obviously-non-image responses (e.g. an HTML error page).
    if let Some(ct) = &content_type {
        if !ct.to_ascii_lowercase().contains("image") {
            return Err(ImageError::Unsupported(ct.clone()));
        }
    }

    let bytes = resp
        .bytes()
        .map_err(|e| ImageError::Http(e.to_string()))?;

    const MAX: usize = 10 * 1024 * 1024; // 10 MB
    if bytes.len() > MAX {
        return Err(ImageError::Unsupported(format!("{} bytes", bytes.len())));
    }

    let ext = extension_for(&url, content_type.as_deref());
    let file_name = file_name_for(&url, &ext);
    let dir = images_dir(&app)?;
    let full = dir.join(&file_name);

    let mut f = fs::File::create(&full)?;
    f.write_all(&bytes)?;
    f.flush()?;

    Ok(DownloadedImage {
        path: full.to_string_lossy().to_string(),
        file_name,
        bytes: bytes.len() as u64,
    })
}
