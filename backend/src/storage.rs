use std::error::Error;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::chart_document::ChartDocument;

pub type StorageResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

pub fn write_png_to(path: &Path, bytes: &[u8]) -> StorageResult<()> {
    if bytes.is_empty() {
        return Err(invalid_data("PNG data must not be empty".into()).into());
    }
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, bytes)?;
    Ok(())
}

pub fn load_chart_from(path: &Path) -> StorageResult<Option<ChartDocument>> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let backup_path = suffixed_path(path, ".backup");
            match fs::read(&backup_path) {
                Ok(bytes) => {
                    let document = parse_chart(&bytes)?;
                    fs::rename(backup_path, path)?;
                    return Ok(Some(document));
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(error.into()),
            }
        }
        Err(error) => return Err(error.into()),
    };
    Ok(Some(parse_chart(&bytes)?))
}

pub fn save_chart_to(path: &Path, document: &ChartDocument) -> StorageResult<()> {
    save_chart_to_with_rename(path, document, |from, to| fs::rename(from, to))
}

pub fn save_chart_to_with_rename<F>(
    path: &Path,
    document: &ChartDocument,
    mut rename_file: F,
) -> StorageResult<()>
where
    F: FnMut(&Path, &Path) -> io::Result<()>,
{
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

    let had_target = path_exists(path)?;
    let had_backup = path_exists(&backup_path)?;

    if had_target {
        if had_backup {
            fs::remove_file(&backup_path)?;
        }
        rename_file(path, &backup_path)?;
    }

    if let Err(install_error) = rename_file(&temp_path, path) {
        if had_target {
            if let Err(restore_error) = rename_file(&backup_path, path) {
                return Err(io::Error::other(format!(
                    "failed to install chart replacement: {install_error}; failed to restore previous chart: {restore_error}"
                ))
                .into());
            }
        }
        return Err(io::Error::other(format!(
            "failed to install chart replacement: {install_error}"
        ))
        .into());
    }

    if had_target || had_backup {
        fs::remove_file(backup_path)?;
    }
    Ok(())
}

fn invalid_data(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn parse_chart(bytes: &[u8]) -> StorageResult<ChartDocument> {
    let document: ChartDocument = serde_json::from_slice(bytes)?;
    document.validate().map_err(invalid_data)?;
    Ok(document)
}

fn path_exists(path: &Path) -> io::Result<bool> {
    match fs::metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn suffixed_path(path: &Path, suffix: &str) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(suffix);
    value.into()
}
