use std::fs;

use gantt_chart_creator_lib::chart_document::{ChartDocument, ChartSettings, GanttTask};
use gantt_chart_creator_lib::storage::{load_chart_from, save_chart_to};

fn sample() -> ChartDocument {
    ChartDocument {
        schema_version: 1,
        title: "Execution Timeline".into(),
        settings: ChartSettings {
            show_saturday: false,
            show_sunday: false,
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
