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
