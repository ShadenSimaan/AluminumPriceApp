import { isTauri } from "./storage";

/** Ask for confirmation before a destructive action (Tauri dialog or browser confirm). */
export async function confirmDestructive(
  message: string,
  options?: { title?: string; okLabel?: string; cancelLabel?: string }
): Promise<boolean> {
  const title = options?.title ?? "אישור מחיקה";
  const okLabel = options?.okLabel ?? "כן, מחק";
  const cancelLabel = options?.cancelLabel ?? "ביטול";
  if (isTauri()) {
    try {
      const dialogModule = await import("@tauri-apps/plugin-dialog");
      return await dialogModule.confirm(message, {
        title,
        kind: "warning",
        okLabel,
        cancelLabel,
      });
    } catch {
      return window.confirm(message);
    }
  }
  return window.confirm(message);
}
