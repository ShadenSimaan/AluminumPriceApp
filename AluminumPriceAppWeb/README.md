# Aluminum Price App

A desktop application for creating and managing aluminum price quotes, built with Tauri (Windows .exe) and React.

## Project Structure

```
├── src/                    # React frontend source code
├── src-tauri/              # Tauri backend (Rust) - Windows .exe app
├── android/                 # Android app (Capacitor) - For future development
├── public/                  # Static assets
└── dist/                    # Build output (generated)
```

## Features

- Create and manage customer quotes
- Calculate prices based on window profiles and dimensions
- Export quotes to PDF
- Customer management
- Profile management (window types and pricing)

## בדיקת מחירי שוק (internal market-price comparison)

On the quotation screen, **בדיקת מחירי שוק** compares each line's actual selling price (after the
quotation discount, before VAT, in the line's own unit) with current Israeli market prices, and
summarises the quotation as an index (100 = market) with coverage by line count and by value.
It is decision support only: it never changes catalogue prices, line prices, totals or the customer PDF.

- Code: `src/market/` (spec builder, deterministic arithmetic, UI) and `market-proxy/` (authenticated
  endpoint holding the provider key; Claude web search + web fetch, with code-side source verification).
- Setup, settings, costs and privacy: see [`market-proxy/README.md`](market-proxy/README.md).
- In the app: **הגדרות — ניהול פרופילים ותוספות → בדיקת מחירי שוק לפרופילים → חיבור לאינטרנט ול-AI**.
  Default is a **direct connection**: paste a Claude API key once and the app searches the web itself
  (no server needed). A deployed `market-proxy` (endpoint URL + access token) is still supported.
- **Profile prices:** in the same dialog every profile has a **מחיר שוק למ״ר** column. Click **בדיקה**
  to search today's prices (original manufacturers + leading fabricators); the app verifies each source
  and shows the average per m² before VAT, the range, the number of sellers and our gap. Click the
  value to see every source and why it was or wasn't counted. **בדיקת כל הפרופילים** checks them all.
- On a quotation, click **בדיקת מחירי שוק** above the items table; ↻ **רענון שורה** re-searches one line.
- Results are stored on each line with their evidence, assumptions and retrieval date, so a saved
  quotation reopens with the same comparison. Editing a line's specification marks it "לא עדכני".
- Tests: `npx vitest run src/market market-proxy`; end-to-end against the fixture endpoint:
  `node scripts/e2e-market.mjs` (see header of that file).

## Development

### Prerequisites

- Node.js (v18 or higher)
- Rust (for Tauri)
- Windows SDK (for building Windows .exe)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run tauri:dev
```

This will start the Vite dev server and launch the Tauri app.

### Building

Build the Windows executable:
```bash
npm run tauri:build
```

The built .exe installer will be in `src-tauri/target/release/bundle/nsis/`

## Android App (Future)

The `android/` folder contains Capacitor configuration for future Android development. Currently, the project focuses on the Windows desktop application.

To work on Android in the future:
1. Ensure Capacitor dependencies are installed (already in devDependencies)
2. Sync Capacitor: `npx cap sync android`
3. Open Android Studio: `npx cap open android`

## Scripts

- `npm run dev` - Start Vite dev server (web only)
- `npm run build` - Build web version
- `npm run tauri:dev` - Start Tauri development (recommended)
- `npm run tauri:build` - Build Windows .exe
- `npm run lint` - Run ESLint

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Desktop**: Tauri 2.x (Rust)
- **PDF Export**: jsPDF
- **UI Components**: Radix UI, shadcn/ui

## License

Private project
