# Focus Flow

A minimal Pomodoro focus timer that lives in the macOS menu bar.

Click the tray icon to open a compact widget with circular progress, preset durations, and session tracking. When a session ends, a native macOS notification fires. The widget dismisses itself when you click outside, staying out of your way until the next break.

## Origin

This project started as a browser-based React SPA generated with [Lovable](https://lovable.dev). Lovable scaffolded the initial UI — routing, shadcn-ui components, Tailwind styling, and a Vite build — which gave the project a working Pomodoro timer in the browser within minutes.

To turn it into a proper desktop tool, the project was wrapped in [Tauri](https://tauri.app) — a Rust-based framework that bundles a web frontend into a lightweight native app. The Lovable-generated React UI was kept almost entirely intact; what changed was everything around it: tray icon with live countdown, borderless always-on-top window that hides on focus loss, full-screen Spaces support via `NSWindowCollectionBehavior` flags, native macOS notifications, and single-instance enforcement.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn-ui, Framer Motion |
| Build | Vite (SWC), Tauri CLI |
| Backend | Rust, Tauri 2 |
| Plugins | `tauri-plugin-notification`, `tauri-plugin-single-instance` |
| macOS APIs | `objc2-app-kit` (NSWindowCollectionBehavior) |
| Testing | Vitest + React Testing Library (frontend), `cargo test` (backend) |

## Getting Started

Prerequisites: [Node.js](https://nodejs.org/) and [Rust](https://rustup.rs/).

```sh
# Install frontend dependencies
npm install

# Run the full Tauri app with hot-reload
npm run tauri:dev

# Run frontend tests
npm run test

# Run Rust backend tests
cd src-tauri && cargo test

# Build a production .app bundle
npm run tauri:build
```

## Project Structure

```
focus-flow-widget/
├── src/                      # React frontend
│   ├── components/           # PomodoroTimer, CircularProgress, UI primitives
│   ├── hooks/usePomodoro.ts  # All timer state, mode switching, tray updates
│   └── test/                 # Vitest tests
├── src-tauri/                # Rust backend
│   ├── src/lib.rs            # Tray icon, window management, macOS integration
│   ├── tauri.conf.json       # Window config, bundle settings
│   └── Cargo.toml            # Rust dependencies
└── index.html                # Vite entry point
```
