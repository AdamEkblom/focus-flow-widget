# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**IMPORTANT:** After every *source code* change, run `npm run test` first, then `npm run build` to validate the tests pass and the build succeeds before considering the task complete. This does not apply to documentation-only changes (e.g. editing CLAUDE.md).

## Technical Requirements

- **Platform:** macOS native Tauri app
- **Device:** MacBook Air
- **Language:** TypeScript (frontend) + Rust (backend)
- **UI Framework:** React 18 + shadcn-ui (Radix UI) + Tailwind CSS
- **Build Tooling:** Vite with SWC (frontend), Cargo (Rust backend)
- **Purpose:** Pomodoro timer app that lives in the macOS menu bar as a tray icon widget

## Commands

```bash
npm run dev          # Start Vite dev server on :8080
npm run build        # Production build (frontend only)
npm run build:dev    # Development build
npm run lint         # ESLint
npm run test         # Run frontend tests once (vitest)
npm run test:watch   # Watch mode tests
npm run tauri:dev    # Start full Tauri app (Rust + frontend, hot-reload)
npm run tauri:build  # Build native macOS .app bundle
npx vitest run src/test/example.test.ts  # Run a single test file

# Rust tests (from focus-flow-widget/src-tauri/)
cargo test           # Run all Rust unit tests
```

## Architecture

React + TypeScript SPA built with Vite (SWC plugin), wrapped in a Tauri native shell.

**Routing:** React Router v6 with two routes: `"/"` renders `PomodoroTimer`, `"*"` renders `NotFound`.

**Core logic:** The `usePomodoro` hook (`src/hooks/usePomodoro.ts`) encapsulates all timer state — mode (work/break), countdown, presets, session tracking, and native notification integration. The UI components consume this hook and are purely presentational.

**UI layer:** shadcn-ui components live in `src/components/ui/`. App components (`PomodoroTimer`, `CircularProgress`) live directly in `src/components/`. Styling uses Tailwind CSS with HSL CSS variables defined in `src/index.css`. Custom timer colors use `--timer-ring` and `--timer-ring-rest` variables.

**Notifications:** Delivered via `@tauri-apps/plugin-notification` (native macOS notifications, not the browser Notification API).

**Data fetching:** React Query (`@tanstack/react-query`) is configured in `App.tsx` but not actively used — safe to remove if needed.

**Path alias:** `@/*` maps to `src/*` (configured in both `tsconfig.json` and `vite.config.ts`).

## Rust / Tauri Backend

Entry point: `src-tauri/src/lib.rs`

**Key responsibilities:**
- **Tray icon:** Built with `TrayIconBuilder`. Left-click toggles the webview window (show/hide). Title updates with the current timer countdown via the `update_tray_title` Tauri command.
- **Window management:** Window is hidden at startup (`visible: false` in `tauri.conf.json`). On tray click, `show_window()` positions it below the tray icon and applies macOS collection behavior flags via `configure_macos_window()`.
- **Full-screen Spaces support:** `NSWindowCollectionBehavior` flags (`CanJoinAllSpaces`, `FullScreenAuxiliary`, `Transient`, `IgnoresCycle`) applied via `objc2-app-kit` so the widget appears in full-screen Spaces.
- **Hide on focus loss:** `WindowEvent::Focused(false)` handler hides the window when the user clicks outside.
- **Single instance:** `tauri-plugin-single-instance` ensures only one app instance runs; a second launch focuses the existing window.

**Plugins used:** `tauri-plugin-notification`, `tauri-plugin-single-instance`

**Cargo deps of note:**
```toml
tauri = { version = "2", features = ["tray-icon", "test"] }
tauri-plugin-notification = "2"
tauri-plugin-single-instance = "2"
objc2-app-kit = { version = "0.3", features = ["NSWindow"] }  # macOS only
```

## Key Conventions

- TypeScript is configured with loose settings (`noImplicitAny: false`, `strictNullChecks: false`)
- Fonts: Inter for body text, JetBrains Mono for timer display (`.font-mono-display`)
- Dark theme by default (class-based dark mode in Tailwind)
- Animations use Framer Motion
- `@typescript-eslint/no-unused-vars` is disabled in ESLint config
