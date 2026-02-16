# NeuroEdge Desktop (Tauri)

## Prerequisites
- Rust toolchain (stable)
- Node.js + pnpm

## Dev (desktop)
From `frontend/`:

```bash
pnpm install
pnpm tauri:dev
```

## Build (desktop)
```bash
pnpm tauri:build
```

This desktop app runs the Vite dev server in development and loads the built `dist/` in production.
It is configured as always-on-top for the main window.
