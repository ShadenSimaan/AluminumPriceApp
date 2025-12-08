# Android App (Future Development)

This folder contains the Capacitor Android project configuration.

**Status**: Currently not in active development. The project focuses on the Windows desktop application (.exe).

## Future Setup

When ready to develop the Android app:

1. Ensure Capacitor dependencies are installed:
   ```bash
   npm install
   ```

2. Sync Capacitor with the web build:
   ```bash
   npm run build
   npx cap sync android
   ```

3. Open in Android Studio:
   ```bash
   npx cap open android
   ```

4. Build and run from Android Studio or:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```

## Notes

- The Android app uses the same React frontend from `src/`
- Build artifacts in `app/build/` and `build/` are gitignored
- Configuration files are kept for future development







