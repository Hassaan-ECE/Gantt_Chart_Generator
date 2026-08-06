# Gantt Chart Creator

Gantt Chart Creator is a focused Windows desktop editor for maintaining and exporting one active project timeline.

## Requirements
- Bun 1.3.14 or compatible 1.3.x
- Rust stable with Cargo
- Tauri 2 Windows prerequisites (Microsoft C++ Build Tools and WebView2)

## Run
Run these commands from the project root:

`bun install`
`bun run desktop`

The first desktop launch compiles the Rust backend and can take several minutes; later launches are much faster.

## Verify
`bun run test`
`bun run lint`
`bun run build:frontend`
`cd backend && cargo test && cargo clippy --all-targets --all-features -- -D warnings`

## Editing
Edit the chart title directly in the chart. Drag a bar to move it, drag either edge to resize it, and double-click it for exact dates. Click the blank chart area or press Escape to clear a selected bar. Category and color fields suggest values already used in the chart, while still accepting new values. Use Chart settings to show Saturday or Sunday independently.

Use the timeline control to choose the exact inclusive Start and End dates shown in the chart. The custom range is saved and reused by Copy Image and Export PNG. Auto-fit returns to a range derived from the tasks and today. Task names remain listed when their bars are outside the range; intersecting bars are clipped at the chart edges. Headers automatically change from detailed dates to numeric dates, month/day bands, and relative week labels as the selected span grows.

## Storage and export
The active chart auto-saves in the Tauri application-data folder. The adjacent Copy image and Export PNG icon buttons produce the same PowerPoint-ready 3840×2160 image. Copy image puts it directly on the system clipboard; Export PNG writes it after a native destination is chosen. The complete chart is scaled proportionally and centered inside a white 16:9 canvas, so long timelines shrink to fit without clipping.

The app currently manages one chart. Portable project loading and native PowerPoint file output are future capabilities.
