# AGENTS.md

## Cursor Cloud specific instructions

### Project layout
- The real application lives in `AluminumPriceAppWeb/` (a React 19 + TypeScript + Vite app packaged with Tauri for desktop and Capacitor for Android). All `npm` commands must be run from inside `AluminumPriceAppWeb/`, not the repo root.
- `PriceAlumin/` is an empty placeholder and can be ignored.

### Services / how to run
- This product is fully client-side: there is **no backend, database, or API**. State persists in browser `localStorage` (web) or a local `app-data.json` file (Tauri desktop). "Running the app" means running the Vite dev server.
- Dev server: `npm run dev` (Vite, serves the full app at `http://localhost:5173`). This exercises all business logic — customers, quotes, price calculations, and PDF export — in the browser. This is the primary way to develop and test in the cloud VM.
- Lint / build commands are the standard npm scripts in `AluminumPriceAppWeb/package.json` (`npm run lint`, `npm run build`, `npm run preview`).

### Non-obvious caveats
- `npm run lint` currently reports many pre-existing errors (mostly `@typescript-eslint/no-explicit-any` and unused vars) in the existing app source. The lint tooling itself works; these failures are not environment problems.
- The Tauri desktop path (`npm run tauri:dev` / `npm run tauri:build`) targets a **Windows `.exe`** and requires the Rust toolchain plus Windows SDK. It is not runnable in this Linux cloud VM — use `npm run dev` (web) to develop and test the app's functionality instead.
- The Android/Capacitor target is scaffolded for future work and is not part of normal development.
- The UI is entirely in Hebrew and renders right-to-left (`<html dir="rtl">`); this is expected, not a bug.
