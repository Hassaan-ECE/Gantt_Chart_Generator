use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChartSettings {
    pub show_saturday: bool,
    pub show_sunday: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GanttTask {
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub category: String,
    pub color: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChartDocument {
    pub schema_version: u32,
    pub title: String,
    pub settings: ChartSettings,
    pub tasks: Vec<GanttTask>,
}

impl ChartDocument {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("unsupported chart schema version".into());
        }
        if self.title.trim().is_empty() {
            return Err("title is required".into());
        }

        for (index, task) in self.tasks.iter().enumerate() {
            if [
                &task.id,
                &task.name,
                &task.start_date,
                &task.end_date,
                &task.category,
                &task.color,
            ]
            .iter()
            .any(|value| value.trim().is_empty())
            {
                return Err(format!("task {} fields must not be blank", index + 1));
            }
            if !is_date_shape(&task.start_date) || !is_date_shape(&task.end_date) {
                return Err(format!("task {} dates must use YYYY-MM-DD", index + 1));
            }
            if task.end_date < task.start_date {
                return Err(format!(
                    "task {} endDate must not precede startDate",
                    index + 1
                ));
            }
            if !is_hex_color(&task.color) {
                return Err(format!(
                    "task {} color must be a six-digit hex color",
                    index + 1
                ));
            }
        }

        Ok(())
    }
}

fn is_date_shape(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}
