pub mod chart_document;
pub mod storage;

use chart_document::ChartDocument;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn load_chart(app: tauri::AppHandle) -> Result<Option<ChartDocument>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("chart.json");
    storage::load_chart_from(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_chart(app: tauri::AppHandle, document: ChartDocument) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("chart.json");
    storage::save_chart_to(&path, &document).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_png(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = PathBuf::from(path);
    let is_png = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("png"));
    if !is_png {
        return Err("PNG export path must have a .png extension".into());
    }
    storage::write_png_to(&path, &bytes).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_chart, save_chart, write_png])
        .run(tauri::generate_context!())
        .expect("error while running Gantt Chart Creator");
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::write_png;

    #[test]
    fn write_png_command_accepts_a_case_insensitive_png_extension() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("chart.PNG");
        let bytes = b"\x89PNG\r\n\x1a\nexample";

        write_png(path.to_string_lossy().into_owned(), bytes.to_vec()).unwrap();

        assert_eq!(fs::read(path).unwrap(), bytes);
    }

    #[test]
    fn write_png_command_rejects_a_non_png_path_without_writing() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("chart.jpg");

        let error =
            write_png(path.to_string_lossy().into_owned(), b"not a png".to_vec()).unwrap_err();

        assert_eq!(error, "PNG export path must have a .png extension");
        assert!(!path.exists());
    }
}
