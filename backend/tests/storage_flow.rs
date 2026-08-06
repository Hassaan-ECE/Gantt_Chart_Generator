use std::fs;

use gantt_chart_creator_lib::chart_document::{
    ChartDocument, ChartSettings, GanttTask, TimelineRange,
};
use gantt_chart_creator_lib::storage::{load_chart_from, save_chart_to, save_chart_to_with_rename};

fn sample() -> ChartDocument {
    ChartDocument {
        schema_version: 1,
        title: "Execution Timeline".into(),
        settings: ChartSettings {
            show_saturday: false,
            show_sunday: false,
            timeline_range: None,
        },
        tasks: vec![GanttTask {
            id: "task-1".into(),
            name: "Build".into(),
            start_date: "2026-08-04".into(),
            end_date: "2026-08-05".into(),
            category: "IRHX".into(),
            color: "#00b95a".into(),
        }],
    }
}

#[test]
fn saves_and_loads_a_versioned_chart() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    save_chart_to(&path, &sample()).unwrap();
    assert_eq!(load_chart_from(&path).unwrap().unwrap(), sample());
}

#[test]
fn persists_an_optional_timeline_range() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let mut document = sample();
    document.settings.timeline_range = Some(TimelineRange {
        start_date: "2026-08-01".into(),
        end_date: "2026-08-28".into(),
    });

    save_chart_to(&path, &document).unwrap();
    assert_eq!(load_chart_from(&path).unwrap(), Some(document));
}

#[test]
fn rejects_a_reversed_timeline_range() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let mut document = sample();
    document.settings.timeline_range = Some(TimelineRange {
        start_date: "2026-08-05".into(),
        end_date: "2026-08-04".into(),
    });

    assert!(save_chart_to(&path, &document).is_err());
    assert!(!path.exists());
}

#[test]
fn loads_legacy_settings_without_a_timeline_range() {
    let legacy = serde_json::json!({
        "schemaVersion": 1,
        "title": "Legacy",
        "settings": { "showSaturday": false, "showSunday": false },
        "tasks": [],
    });
    let parsed: ChartDocument = serde_json::from_value(legacy).unwrap();
    assert_eq!(parsed.settings.timeline_range, None);
}

#[test]
fn invalid_json_is_preserved_and_reported() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    fs::write(&path, b"{invalid").unwrap();
    assert!(load_chart_from(&path).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"{invalid");
}

#[test]
fn a_missing_file_loads_as_none() {
    let root = tempfile::tempdir().unwrap();
    assert_eq!(
        load_chart_from(&root.path().join("chart.json")).unwrap(),
        None
    );
}

#[test]
fn invalid_documents_are_rejected_before_writing() {
    let mut invalid_documents = Vec::new();

    let mut wrong_version = sample();
    wrong_version.schema_version = 2;
    invalid_documents.push(wrong_version);

    let mut blank_title = sample();
    blank_title.title = "  ".into();
    invalid_documents.push(blank_title);

    let mut blank_task_field = sample();
    blank_task_field.tasks[0].category = "".into();
    invalid_documents.push(blank_task_field);

    let mut malformed_date = sample();
    malformed_date.tasks[0].start_date = "08/04/2026".into();
    invalid_documents.push(malformed_date);

    let mut reversed_dates = sample();
    reversed_dates.tasks[0].end_date = "2026-08-03".into();
    invalid_documents.push(reversed_dates);

    let mut invalid_color = sample();
    invalid_color.tasks[0].color = "#0b95a".into();
    invalid_documents.push(invalid_color);

    for (index, document) in invalid_documents.into_iter().enumerate() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(format!("chart-{index}.json"));
        assert!(save_chart_to(&path, &document).is_err());
        assert!(!path.exists());
    }
}

#[test]
fn semantic_invalid_dates_are_rejected_without_modifying_the_source() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let mut invalid = sample();
    invalid.tasks[0].start_date = "2026-02-31".into();
    invalid.tasks[0].end_date = "2026-03-01".into();
    let source = serde_json::to_vec_pretty(&invalid).unwrap();
    fs::write(&path, &source).unwrap();

    assert!(load_chart_from(&path).is_err());
    assert_eq!(fs::read(&path).unwrap(), source);

    let valid_source = serde_json::to_vec_pretty(&sample()).unwrap();
    fs::write(&path, &valid_source).unwrap();
    assert!(save_chart_to(&path, &invalid).is_err());
    assert_eq!(fs::read(&path).unwrap(), valid_source);
}

#[test]
fn overwrites_an_existing_chart_without_leaving_replacement_files() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let mut replacement = sample();
    replacement.title = "Updated timeline".into();

    save_chart_to(&path, &sample()).unwrap();
    save_chart_to(&path, &replacement).unwrap();

    assert_eq!(load_chart_from(&path).unwrap(), Some(replacement));
    assert!(!root.path().join("chart.json.tmp").exists());
    assert!(!root.path().join("chart.json.backup").exists());
}

#[test]
fn recovers_a_valid_backup_when_the_target_is_missing() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let backup_path = root.path().join("chart.json.backup");
    fs::write(&backup_path, serde_json::to_vec_pretty(&sample()).unwrap()).unwrap();

    assert_eq!(load_chart_from(&path).unwrap(), Some(sample()));
    assert!(path.exists());
    assert!(!backup_path.exists());
}

#[test]
fn restores_the_existing_chart_when_installing_the_replacement_fails() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let temp_path = root.path().join("chart.json.tmp");
    let backup_path = root.path().join("chart.json.backup");
    let original = sample();
    let mut replacement = sample();
    replacement.title = "Replacement".into();
    save_chart_to(&path, &original).unwrap();

    let error = save_chart_to_with_rename(&path, &replacement, |from, to| {
        if from == temp_path {
            Err(std::io::Error::other("install failure"))
        } else {
            fs::rename(from, to)
        }
    })
    .unwrap_err();

    assert!(error.to_string().contains("install failure"));
    assert_eq!(load_chart_from(&path).unwrap(), Some(original));
    assert!(!backup_path.exists());
}

#[test]
fn reports_install_and_restore_failures_and_leaves_a_recoverable_backup() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.json");
    let temp_path = root.path().join("chart.json.tmp");
    let backup_path = root.path().join("chart.json.backup");
    let original = sample();
    let mut replacement = sample();
    replacement.title = "Replacement".into();
    save_chart_to(&path, &original).unwrap();

    let error = save_chart_to_with_rename(&path, &replacement, |from, to| {
        if from == temp_path {
            Err(std::io::Error::other("install failure"))
        } else if from == backup_path {
            Err(std::io::Error::other("restore failure"))
        } else {
            fs::rename(from, to)
        }
    })
    .unwrap_err();
    let message = error.to_string();

    assert!(message.contains("install failure"));
    assert!(message.contains("restore failure"));
    assert!(!path.exists());
    assert!(backup_path.exists());
    assert_eq!(load_chart_from(&path).unwrap(), Some(original));
}

#[test]
fn writes_png_bytes_to_the_chosen_path() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("exports").join("chart.png");
    let bytes = b"\x89PNG\r\n\x1a\nexample";

    gantt_chart_creator_lib::storage::write_png_to(&path, bytes).unwrap();

    assert_eq!(fs::read(path).unwrap(), bytes);
}

#[test]
fn rejects_empty_png_bytes_without_creating_a_file() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chart.png");

    let error = gantt_chart_creator_lib::storage::write_png_to(&path, &[]).unwrap_err();

    assert!(error.to_string().contains("PNG data must not be empty"));
    assert!(!path.exists());
}
