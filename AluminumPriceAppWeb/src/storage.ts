/**
 * Application data file storage (Tauri only).
 * Saves and loads full app state to a single JSON file in the app's data directory.
 */

import type { AppState } from "./types";

const DATA_FILENAME = "app-data.json";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Get the path to the app data file (Tauri only). Returns null in browser. */
export async function getDataFilePath(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const pathApi = await import("@tauri-apps/api/path");
    const fsApi = await import("@tauri-apps/plugin-fs");
    const dir = await pathApi.appLocalDataDir();
    if (!dir) return null;
    const filePath = await pathApi.join(dir, DATA_FILENAME);
    // Ensure app data dir is in scope for read/write
    const fsAny = fsApi as any;
    if (typeof fsAny.scope === "function") {
      await fsAny.scope(dir, { recursive: true });
    } else if (fsAny.allowScope) {
      await fsAny.allowScope(dir, { recursive: true });
    }
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Read app state from the data file. Returns null if not Tauri, file missing, or parse error.
 */
export async function readStateFromFile(): Promise<AppState | null> {
  const path = await getDataFilePath();
  if (!path) return null;
  try {
    const fsApi = await import("@tauri-apps/plugin-fs");
    const exists = await fsApi.exists(path);
    if (!exists) return null;
    const contents = await fsApi.readTextFile(path);
    const parsed = JSON.parse(contents);
    return parsed as AppState;
  } catch {
    return null;
  }
}

/**
 * Write app state to the data file. No-op if not Tauri or path unavailable.
 */
export async function writeStateToFile(state: AppState): Promise<void> {
  const path = await getDataFilePath();
  if (!path) return;
  try {
    const fsApi = await import("@tauri-apps/plugin-fs");
    const pathApi = await import("@tauri-apps/api/path");
    const dir = await pathApi.dirname(path);
    const exists = await fsApi.exists(dir);
    if (!exists && fsApi.mkdir) {
      await fsApi.mkdir(dir, { recursive: true });
    }
    const json = JSON.stringify(state, null, 2);
    await fsApi.writeTextFile(path, json);
  } catch (e) {
    console.warn("Failed to write app data file:", e);
  }
}
