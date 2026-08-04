use std::error::Error;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::chart_document::ChartDocument;

pub type StorageResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

pub fn load_chart_from(path: &Path) -> StorageResult<Option<ChartDocument>> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let document: ChartDocument = serde_json::from_slice(&bytes)?;
    document.validate().map_err(invalid_data)?;
    Ok(Some(document))
}

pub fn save_chart_to(path: &Path, document: &ChartDocument) -> StorageResult<()> {
    document.validate().map_err(invalid_data)?;
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }

    let bytes = serde_json::to_vec_pretty(document)?;
    let temp_path = suffixed_path(path, ".tmp");
    let backup_path = suffixed_path(path, ".backup");
    let mut temp_file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp_path)?;
    temp_file.write_all(&bytes)?;
    temp_file.sync_all()?;
    drop(temp_file);

    let had_target = match fs::metadata(path) {
        Ok(_) => true,
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(error) => return Err(error.into()),
    };

    if had_target {
        if backup_path.exists() {
            fs::remove_file(&backup_path)?;
        }
        fs::rename(path, &backup_path)?;
    }

    if let Err(error) = fs::rename(&temp_path, path) {
        if had_target {
            let _ = fs::rename(&backup_path, path);
        }
        return Err(error.into());
    }

    if had_target {
        fs::remove_file(backup_path)?;
    }
    Ok(())
}

fn invalid_data(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn suffixed_path(path: &Path, suffix: &str) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(suffix);
    value.into()
}
