# Building the EXE File - Instructions

## Prerequisites

1. **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
2. **Rust** - Install from [rustup.rs](https://rustup.rs/)
3. **Windows SDK** (for building Windows .exe)

## Setup Steps

1. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

2. **Build the frontend:**
   ```bash
   npm run build
   ```
   This will create the `dist` folder with all frontend assets including fonts.

3. **Build the Tauri EXE:**
   ```bash
   npm run tauri:build
   ```

   This command will:
   - Build the React frontend
   - Compile the Rust backend
   - Bundle everything into a Windows installer

4. **Find the EXE:**
   - Installer: `src-tauri/target/release/bundle/nsis/AluPrice_0.1.0_x64-setup.exe`
   - Standalone EXE: `src-tauri/target/release/app.exe`

## Important Notes

### PDF Export in EXE
- The PDF export is configured to work in the Tauri EXE
- It will open the PDF in a new window within the app
- The PDF will also be saved to your Downloads folder
- Fonts are automatically included in the build from the `public/fonts` folder

### Fonts
- Fonts must be in `public/fonts/` folder
- They are automatically copied to `dist/fonts/` during build
- The PDF uses these fonts, so they must be present

### Troubleshooting

If PDF export doesn't work:
1. Make sure fonts are in `public/fonts/` folder
2. Check that the build completed successfully
3. Verify that `dist/fonts/` contains the font files after building

If build fails:
1. Make sure Rust is properly installed: `rustc --version`
2. Check that Windows SDK is installed
3. Try `npm run build` first to ensure frontend builds correctly

## Development Mode

To test the app before building:
```bash
npm run tauri:dev
```

This runs the app in development mode where you can see console logs and test features.







