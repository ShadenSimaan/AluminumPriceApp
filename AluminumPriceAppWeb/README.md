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
