import type {
  Requirement,
  RfqContact,
  RfqItem,
  RfqLanguage,
  RfqPanel,
  RfqReferenceImage,
  RfqSettings,
  RfqUnit,
  SupplierRequest,
} from "./types";
import { isOpeningType, nextReference, normalizeItemConfig, OPENING_TYPE_DEFS } from "./presets";

export function rfqUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyContact(): RfqContact {
  return { name: "", contactPerson: "", phone: "", email: "", address: "" };
}

export const DEFAULT_RFQ_SETTINGS: RfqSettings = {
  uiLanguage: "he",
  pdfLanguage: "en",
  companyDefaults: { ...emptyContact(), name: "אלום סמעאן סאמי", phone: "0526475531" },
};

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function createSupplierRequest(opts: { company: RfqContact; defaultUnit: RfqUnit; now?: number }): SupplierRequest {
  const now = opts.now ?? Date.now();
  return {
    id: rfqUuid(),
    documentType: "supplier_rfq",
    schemaVersion: 1,
    number: undefined,
    createdAt: now,
    updatedAt: now,
    projectName: "",
    projectReference: "",
    requestDate: todayIso(new Date(now)),
    company: { ...opts.company },
    supplier: emptyContact(),
    deliveryDestination: "",
    dimensionBasis: "frame",
    defaultUnit: opts.defaultUnit,
    generalSpecifications: "",
    notes: "",
    items: [],
  };
}

export function formatRfqNumber(n: number | undefined): string {
  return n != null && n > 0 ? `RFQ-${String(Math.floor(n)).padStart(4, "0")}` : "";
}

// ---------- Normalization (backward/forward tolerant loading) ----------

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const unit = (v: unknown, fallback: RfqUnit = "cm"): RfqUnit => (v === "mm" ? "mm" : v === "cm" ? "cm" : fallback);
const requirement = (v: unknown): Requirement => (v === "required" || v === "not_required" ? v : "unspecified");
const posNumOrNull = (v: unknown): number | null => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);

function normalizeContact(raw: unknown): RfqContact {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: str(o.name),
    contactPerson: str(o.contactPerson),
    phone: str(o.phone),
    email: str(o.email),
    address: str(o.address),
  };
}

function normalizeImage(raw: unknown): RfqReferenceImage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const dataUrl = str(o.dataUrl);
  const mime = o.mime === "image/png" ? "image/png" : o.mime === "image/jpeg" ? "image/jpeg" : null;
  if (!mime || !dataUrl.startsWith(`data:${mime};base64,`)) return undefined;
  return { name: str(o.name), mime, dataUrl };
}

export function normalizeRfqItem(raw: unknown, fallbackUnit: RfqUnit, takenRefs: string[]): RfqItem {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const openingType = isOpeningType(o.openingType) ? o.openingType : "custom";
  const def = OPENING_TYPE_DEFS[openingType];
  const category = def.category ?? (o.category === "door" ? "door" : "window");
  const qty = typeof o.quantity === "number" && Number.isInteger(o.quantity) && o.quantity > 0 ? o.quantity : 1;
  const panels: RfqPanel[] = Array.isArray(o.panels)
    ? (o.panels as unknown[]).map((p) => {
        const po = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        return {
          operation: (["fixed", "sliding", "casement", "tilt_turn", "top_hung", "hinged"].includes(str(po.operation))
            ? po.operation
            : "fixed") as RfqPanel["operation"],
          hingeSide: po.hingeSide === "left" || po.hingeSide === "right" ? po.hingeSide : undefined,
          slideDirection: po.slideDirection === "left" || po.slideDirection === "right" ? po.slideDirection : undefined,
        };
      })
    : [];
  const reference = str(o.reference).trim() || nextReference(category, takenRefs);
  const legacyDescription = openingType === "custom" && !str(o.customDescription).trim() && !isOpeningType(o.openingType)
    ? str(o.openingType)
    : "";
  return normalizeItemConfig({
    id: str(o.id) || rfqUuid(),
    reference,
    category,
    openingType,
    widthCm: posNumOrNull(o.widthCm),
    heightCm: posNumOrNull(o.heightCm),
    unit: unit(o.unit, fallbackUnit),
    quantity: qty,
    location: str(o.location),
    panels,
    swing: o.swing === "outward" ? "outward" : o.swing === "inward" ? "inward" : undefined,
    activeLeaf: o.activeLeaf === "left" ? "left" : o.activeLeaf === "right" ? "right" : undefined,
    customDescription: str(o.customDescription) || legacyDescription,
    referenceImage: normalizeImage(o.referenceImage),
    glass: str(o.glass),
    frameFinish: str(o.frameFinish),
    insectScreen: requirement(o.insectScreen),
    shutter: requirement(o.shutter),
    hardware: str(o.hardware),
    otherRequirements: str(o.otherRequirements),
    notes: str(o.notes),
  });
}

export function normalizeSupplierRequest(raw: unknown): SupplierRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id);
  if (!id) return null;
  const defaultUnit = unit(o.defaultUnit);
  const items: RfqItem[] = [];
  const taken: string[] = [];
  if (Array.isArray(o.items)) {
    for (const it of o.items) {
      const n = normalizeRfqItem(it, defaultUnit, taken);
      items.push(n);
      taken.push(n.reference);
    }
  }
  const num = typeof o.number === "number" && isFinite(o.number) && o.number > 0 ? Math.floor(o.number) : undefined;
  const createdAt = typeof o.createdAt === "number" ? o.createdAt : Date.now();
  return {
    id,
    documentType: "supplier_rfq",
    schemaVersion: 1,
    number: num,
    createdAt,
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : createdAt,
    projectName: str(o.projectName),
    projectReference: str(o.projectReference),
    requestDate: /^\d{4}-\d{2}-\d{2}$/.test(str(o.requestDate)) ? str(o.requestDate) : todayIso(new Date(createdAt)),
    company: normalizeContact(o.company),
    supplier: normalizeContact(o.supplier),
    deliveryDestination: str(o.deliveryDestination),
    dimensionBasis: o.dimensionBasis === "opening" ? "opening" : "frame",
    defaultUnit,
    generalSpecifications: str(o.generalSpecifications),
    notes: str(o.notes),
    items,
  };
}

export function normalizeRfqSettings(raw: unknown): RfqSettings {
  if (!raw || typeof raw !== "object") return structuredCloneSafe(DEFAULT_RFQ_SETTINGS);
  const o = raw as Record<string, unknown>;
  const lang = (v: unknown, fb: RfqLanguage): RfqLanguage => (v === "en" || v === "he" ? v : fb);
  return {
    uiLanguage: lang(o.uiLanguage, DEFAULT_RFQ_SETTINGS.uiLanguage),
    pdfLanguage: lang(o.pdfLanguage, DEFAULT_RFQ_SETTINGS.pdfLanguage),
    companyDefaults: o.companyDefaults ? normalizeContact(o.companyDefaults) : { ...DEFAULT_RFQ_SETTINGS.companyDefaults },
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** RFQ part of the persisted app state. */
export type RfqSlice = {
  supplierRequests: SupplierRequest[];
  rfqDraft: SupplierRequest | null;
  nextSupplierRequestNumber: number;
  rfqSettings: RfqSettings;
};

export function normalizeRfqSlice(o: Record<string, unknown>): RfqSlice {
  const list = Array.isArray(o.supplierRequests) ? o.supplierRequests : [];
  const seen = new Set<string>();
  const supplierRequests: SupplierRequest[] = [];
  for (const r of list) {
    const n = normalizeSupplierRequest(r);
    if (n && !seen.has(n.id)) {
      seen.add(n.id);
      supplierRequests.push(n);
    }
  }
  const maxNum = supplierRequests.reduce((m, r) => (r.number && r.number > m ? r.number : m), 0);
  const stored =
    typeof o.nextSupplierRequestNumber === "number" && isFinite(o.nextSupplierRequestNumber) && o.nextSupplierRequestNumber > 0
      ? Math.floor(o.nextSupplierRequestNumber)
      : 1;
  return {
    supplierRequests,
    rfqDraft: normalizeSupplierRequest(o.rfqDraft),
    nextSupplierRequestNumber: Math.max(stored, maxNum + 1),
    rfqSettings: normalizeRfqSettings(o.rfqSettings),
  };
}

// ---------- Operations ----------

function contentKey(r: SupplierRequest): string {
  const { updatedAt: _u, ...rest } = r;
  void _u;
  return JSON.stringify(rest);
}

export function isDraftDirty(slice: Pick<RfqSlice, "supplierRequests" | "rfqDraft">): boolean {
  const d = slice.rfqDraft;
  if (!d) return false;
  const saved = slice.supplierRequests.find((r) => r.id === d.id);
  if (!saved) return true;
  return contentKey(saved) !== contentKey(d);
}

/** Upsert the draft into the saved list; allocates an RFQ number on first save. */
export function saveDraft<S extends RfqSlice>(s: S, now = Date.now()): S {
  const draft = s.rfqDraft;
  if (!draft) return s;
  let next = s.nextSupplierRequestNumber;
  let number = draft.number;
  if (number == null) {
    number = next;
    next += 1;
  }
  const saved: SupplierRequest = { ...draft, number, updatedAt: now };
  const exists = s.supplierRequests.some((r) => r.id === saved.id);
  const supplierRequests = exists
    ? s.supplierRequests.map((r) => (r.id === saved.id ? saved : r))
    : [...s.supplierRequests, saved];
  return { ...s, supplierRequests, rfqDraft: saved, nextSupplierRequestNumber: next };
}

export function cloneRequest(r: SupplierRequest): SupplierRequest {
  return JSON.parse(JSON.stringify(r)) as SupplierRequest;
}

export function openRequest<S extends RfqSlice>(s: S, id: string): S {
  const r = s.supplierRequests.find((x) => x.id === id);
  if (!r) return s;
  return { ...s, rfqDraft: cloneRequest(r) };
}

export function duplicateRequest<S extends RfqSlice>(s: S, id: string, copySuffix: string, now = Date.now()): S {
  const src = s.supplierRequests.find((x) => x.id === id);
  if (!src) return s;
  const copy = cloneRequest(src);
  copy.id = rfqUuid();
  copy.number = s.nextSupplierRequestNumber;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.projectName = `${src.projectName || ""} ${copySuffix}`.trim();
  copy.items = copy.items.map((it) => ({ ...it, id: rfqUuid() }));
  return {
    ...s,
    supplierRequests: [...s.supplierRequests, copy],
    nextSupplierRequestNumber: s.nextSupplierRequestNumber + 1,
    rfqDraft: cloneRequest(copy),
  };
}

export function deleteRequest<S extends RfqSlice>(s: S, id: string): S {
  return {
    ...s,
    supplierRequests: s.supplierRequests.filter((r) => r.id !== id),
    rfqDraft: s.rfqDraft?.id === id ? null : s.rfqDraft,
  };
}

export function moveItem(items: RfqItem[], id: string, delta: -1 | 1): RfqItem[] {
  const idx = items.findIndex((i) => i.id === id);
  const to = idx + delta;
  if (idx < 0 || to < 0 || to >= items.length) return items;
  const out = items.slice();
  [out[idx], out[to]] = [out[to], out[idx]];
  return out;
}

export function duplicateItem(items: RfqItem[], id: string): RfqItem[] {
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return items;
  const src = items[idx];
  const copy: RfqItem = {
    ...JSON.parse(JSON.stringify(src)),
    id: rfqUuid(),
    reference: nextReference(src.category, items.map((i) => i.reference)),
  };
  const out = items.slice();
  out.splice(idx + 1, 0, copy);
  return out;
}
