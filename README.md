# Gantt Chart Creator

Gantt Chart Creator is a focused Windows desktop editor for maintaining and exporting one active project timeline.

## Requirements
- Bun 1.3.14 or compatible 1.3.x
- Rust stable with Cargo
- Tauri 2 Windows prerequisites (Microsoft C++ Build Tools and WebView2)

## Run
`bun install`
`bun run desktop`

## Verify
`bun run test`
`bun run lint`
`bun run build:frontend`
`cd backend && cargo test && cargo clippy --all-targets --all-features -- -D warnings`

## Editing
Drag a bar to move it, drag either edge to resize it, and double-click it for exact dates. Use Chart settings to show Saturday or Sunday independently.

## Storage and export
The active chart auto-saves in the Tauri application-data folder. Export PNG writes a complete 2x image after a native destination is chosen.

The app currently manages one chart. Portable project loading, clipboard copy, and PowerPoint output are future capabilities.
