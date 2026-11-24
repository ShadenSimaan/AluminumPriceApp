import type { SeriesAppendixSettings } from "../../types";

export const DEFAULT_SERIES_APPENDIX: SeriesAppendixSettings = {
  enabled: false,
  excluded: [],
  content: { photos: true, glass: true, colors: true, screens: true },
};

export function defaultSeriesAppendix(): SeriesAppendixSettings {
  return { ...DEFAULT_SERIES_APPENDIX, excluded: [], content: { ...DEFAULT_SERIES_APPENDIX.content } };
}

/** Saved settings (or their absence on older quotes) → complete settings; missing = off. */
export function normalizeSeriesAppendix(raw: unknown): SeriesAppendixSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SeriesAppendixSettings>;
  const c = (r.content && typeof r.content === "object" ? r.content : {}) as Partial<SeriesAppendixSettings["content"]>;
  const flag = (v: unknown) => (typeof v === "boolean" ? v : true);
  return {
    enabled: r.enabled === true,
    excluded: Array.isArray(r.excluded) ? [...new Set(r.excluded.filter((k): k is string => typeof k === "string"))] : [],
    content: { photos: flag(c.photos), glass: flag(c.glass), colors: flag(c.colors), screens: flag(c.screens) },
  };
}

/** Explicit series of a saved line: a list of keys, or undefined (= recognise automatically). */
export function normalizeSeriesRefs(raw: unknown): string[] | undefined {
  return Array.isArray(raw) ? [...new Set(raw.filter((k): k is string => typeof k === "string"))] : undefined;
}
