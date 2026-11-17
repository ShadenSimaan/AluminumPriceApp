import type {
  Accessory,
  QuestionStatus,
  Requirement,
  RfqAlternative,
  RfqContact,
  RfqItem,
  RfqItemSupplierPrice,
  RfqLanguage,
  RfqPanel,
  RfqReferenceImage,
  RfqSettings,
  RfqUnit,
  ShadingEntry,
  SupplierProfile,
  SupplierQuestion,
  SupplierQuotationInfo,
  SupplierRequest,
} from "./types";
import { isOpeningType, nextReference, normalizeItemConfig, OPENING_TYPE_DEFS } from "./presets";
import { layoutFromPanels, normalizeLayout, reassignIds } from "./layout";
import { emptyGlassSpec, normalizeGlassSpec } from "./glass";
import { accessoryFromLegacyScreen, normalizeAccessory, normalizeShading } from "./accessories";
import { normalizeContactLike, normalizeSupplierDirectory } from "./suppliers";

export function rfqUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyContact(): RfqContact {
  return { name: "", contactPerson: "", phone: "", email: "", address: "", website: "" };
}

export const DEFAULT_RFQ_SETTINGS: RfqSettings = {
  uiLanguage: "he",
  pdfLanguage: "en",
  companyDefaults: { ...emptyContact(), name: "אלום סמעאן סאמי", phone: "0526475531" },
  ...normalizeSupplierDirectory([], []),
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
    schemaVersion: 2,
    number: undefined,
    createdAt: now,
    updatedAt: now,
    projectName: "",
    projectReference: "",
    requestDate: todayIso(new Date(now)),
    company: { ...emptyContact(), ...opts.company },
    supplier: emptyContact(),
    questions: [],
    dismissedQuestionKeys: [],
    deliveryDestination: "",
    dimensionBasis: "frame",
    defaultUnit: opts.defaultUnit,
    generalSpecifications: "",
    notes: "",
    items: [],
    quotationStatus: "pending",
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

const normalizeContact = normalizeContactLike;

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
  // Items saved before layouts existed have only `panels`: they become N equal columns (same drawing as before).
  const layout = normalizeLayout(o.layout, normalizeGlassSpec) ?? layoutFromPanels(panels.length ? panels : def.defaultPanels());
  const accessories: Accessory[] = Array.isArray(o.accessories)
    ? (o.accessories as unknown[]).map((a, i) => normalizeAccessory(a, `acc-${i + 1}`)).filter((a): a is Accessory => !!a)
    : [];
  const legacyScreen = requirement(o.insectScreen);
  if (!accessories.some((a) => a.kind === "insect_screen")) {
    const migrated = accessoryFromLegacyScreen("acc-insect-screen", legacyScreen);
    if (migrated) accessories.push(migrated);
  }
  const shading: ShadingEntry[] = Array.isArray(o.shading)
    ? (o.shading as unknown[]).map((s, i) => normalizeShading(s, `sh-${i + 1}`)).filter((s): s is ShadingEntry => !!s)
    : [];
  const alternatives: RfqAlternative[] = Array.isArray(o.alternatives)
    ? (o.alternatives as unknown[])
        .map((a, i) => {
          const ao = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
          return { id: str(ao.id) || `alt-${i + 1}`, description: str(ao.description) };
        })
    : [];
  const supplierPrice = normalizeItemSupplierPrice(o.supplierPrice);
  const item: RfqItem = {
    id: str(o.id) || rfqUuid(),
    reference,
    category,
    openingType,
    widthCm: posNumOrNull(o.widthCm),
    heightCm: posNumOrNull(o.heightCm),
    unit: unit(o.unit, fallbackUnit),
    quantity: qty,
    location: str(o.location),
    layout,
    panels,
    swing: o.swing === "outward" ? "outward" : o.swing === "inward" ? "inward" : undefined,
    activeLeaf: o.activeLeaf === "left" ? "left" : o.activeLeaf === "right" ? "right" : undefined,
    customDescription: str(o.customDescription) || legacyDescription,
    referenceImage: normalizeImage(o.referenceImage),
    glassSpec: o.glassSpec ? normalizeGlassSpec(o.glassSpec) : emptyGlassSpec(),
    glass: str(o.glass),
    frameFinish: str(o.frameFinish),
    insectScreen: legacyScreen,
    shutter: requirement(o.shutter),
    shading,
    accessories,
    completeHardwareSet: o.completeHardwareSet === true,
    hardware: str(o.hardware),
    alternatives,
    otherRequirements: str(o.otherRequirements),
    notes: str(o.notes),
  };
  if (supplierPrice) item.supplierPrice = supplierPrice;
  return normalizeItemConfig(item);
}

const moneyOrZero = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);
const moneyOrNull = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

function normalizeItemSupplierPrice(raw: unknown): RfqItemSupplierPrice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const currency = str(o.currency).trim() || "USD";
  return {
    currency,
    unitPriceOriginal: moneyOrZero(o.unitPriceOriginal),
    screenPriceOriginal: moneyOrZero(o.screenPriceOriginal),
    lineTotalOriginal: moneyOrZero(o.lineTotalOriginal),
    unitPriceIls: moneyOrZero(o.unitPriceIls),
    screenPriceIls: moneyOrZero(o.screenPriceIls),
    lineTotalIls: moneyOrZero(o.lineTotalIls),
    profileSeries: str(o.profileSeries) || undefined,
    remarks: str(o.remarks) || undefined,
  };
}

function normalizeSupplierQuotation(raw: unknown): SupplierQuotationInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const rate = typeof o.exchangeRateToIls === "number" && isFinite(o.exchangeRateToIls) && o.exchangeRateToIls > 0 ? o.exchangeRateToIls : 0;
  if (!rate) return undefined;
  return {
    quotationNumber: str(o.quotationNumber),
    quotationDate: str(o.quotationDate),
    currency: str(o.currency).trim() || "USD",
    exchangeRateToIls: rate,
    productSubtotalOriginal: moneyOrNull(o.productSubtotalOriginal),
    packagingOriginal: moneyOrNull(o.packagingOriginal),
    inlandTransportOriginal: moneyOrNull(o.inlandTransportOriginal),
    grandTotalOriginal: moneyOrNull(o.grandTotalOriginal),
    productSubtotalIls: moneyOrNull(o.productSubtotalIls),
    packagingIls: moneyOrNull(o.packagingIls),
    inlandTransportIls: moneyOrNull(o.inlandTransportIls),
    grandTotalIls: moneyOrNull(o.grandTotalIls),
    importedAt: typeof o.importedAt === "number" && isFinite(o.importedAt) ? o.importedAt : Date.now(),
    sourceFileName: str(o.sourceFileName),
  };
}

const QUESTION_STATUSES: QuestionStatus[] = ["open", "answered", "resolved"];

function normalizeQuestion(raw: unknown): SupplierQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id);
  if (!id) return null;
  const origins: SupplierQuestion["origin"][] = ["auto", "linked", "template", "custom"];
  const params: Record<string, string> = {};
  if (o.params && typeof o.params === "object") for (const [k, v] of Object.entries(o.params as Record<string, unknown>)) params[k] = str(v);
  return {
    id,
    linkKey: str(o.linkKey),
    origin: origins.includes(o.origin as SupplierQuestion["origin"]) ? (o.origin as SupplierQuestion["origin"]) : "custom",
    templateKey: str(o.templateKey),
    params,
    itemId: str(o.itemId),
    text: str(o.text),
    reply: str(o.reply),
    confirmationNote: str(o.confirmationNote),
    status: QUESTION_STATUSES.includes(o.status as QuestionStatus) ? (o.status as QuestionStatus) : "open",
    stale: o.stale === true,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : 0,
  };
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
  const questions = Array.isArray(o.questions) ? (o.questions as unknown[]).map(normalizeQuestion).filter((q): q is SupplierQuestion => !!q) : [];
  const supplierQuotation = normalizeSupplierQuotation(o.supplierQuotation);
  const hasPricedItems = items.some((it) => it.supplierPrice != null);
  const quotationStatus: SupplierRequest["quotationStatus"] =
    o.quotationStatus === "done" || o.quotationStatus === "pending"
      ? o.quotationStatus
      : supplierQuotation || hasPricedItems
        ? "done"
        : "pending";
  const out: SupplierRequest = {
    id,
    documentType: "supplier_rfq",
    schemaVersion: 2,
    number: num,
    createdAt,
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : createdAt,
    projectName: str(o.projectName),
    projectReference: str(o.projectReference),
    requestDate: /^\d{4}-\d{2}-\d{2}$/.test(str(o.requestDate)) ? str(o.requestDate) : todayIso(new Date(createdAt)),
    company: normalizeContact(o.company),
    supplier: normalizeContact(o.supplier),
    questions,
    dismissedQuestionKeys: Array.isArray(o.dismissedQuestionKeys) ? (o.dismissedQuestionKeys as unknown[]).map(str).filter(Boolean) : [],
    deliveryDestination: str(o.deliveryDestination),
    dimensionBasis: o.dimensionBasis === "opening" ? "opening" : "frame",
    defaultUnit,
    generalSpecifications: str(o.generalSpecifications),
    notes: str(o.notes),
    items,
    quotationStatus,
  };
  if (typeof o.supplierProfileId === "string" && o.supplierProfileId) out.supplierProfileId = o.supplierProfileId;
  if (supplierQuotation) out.supplierQuotation = supplierQuotation;
  return out;
}

export function normalizeRfqSettings(raw: unknown): RfqSettings {
  if (!raw || typeof raw !== "object") return structuredCloneSafe(DEFAULT_RFQ_SETTINGS);
  const o = raw as Record<string, unknown>;
  const lang = (v: unknown, fb: RfqLanguage): RfqLanguage => (v === "en" || v === "he" ? v : fb);
  return {
    uiLanguage: lang(o.uiLanguage, DEFAULT_RFQ_SETTINGS.uiLanguage),
    pdfLanguage: lang(o.pdfLanguage, DEFAULT_RFQ_SETTINGS.pdfLanguage),
    companyDefaults: o.companyDefaults ? normalizeContact(o.companyDefaults) : { ...DEFAULT_RFQ_SETTINGS.companyDefaults },
    ...normalizeSupplierDirectory(o.suppliers, o.seededSuppliers),
  };
}

export function supplierProfileFor(settings: Pick<RfqSettings, "suppliers">, req: Pick<SupplierRequest, "supplierProfileId"> | null | undefined): SupplierProfile | undefined {
  return req?.supplierProfileId ? settings.suppliers.find((s) => s.id === req.supplierProfileId) : undefined;
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
  const idMap = new Map<string, string>();
  copy.items = copy.items.map((it) => {
    const id = rfqUuid();
    idMap.set(it.id, id);
    return { ...it, id };
  });
  // Linked questions follow their items into the copy.
  copy.questions = copy.questions.map((q) => {
    const itemId = idMap.get(q.itemId);
    if (!itemId) return { ...q, id: rfqUuid() };
    return { ...q, id: rfqUuid(), itemId, linkKey: q.linkKey.replace(q.itemId, itemId) };
  });
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
  // New design: fresh section ids; links inside the item are remapped so blinds/accessories stay attached.
  const { layout, idMap } = reassignIds(copy.layout);
  copy.layout = layout;
  const remap = (ids: string[]) => ids.map((id) => idMap.get(id) ?? id);
  copy.shading = copy.shading.map((s) => ({ ...s, appliesTo: remap(s.appliesTo) }));
  copy.accessories = copy.accessories.map((a) => ({ ...a, appliesTo: remap(a.appliesTo) }));
  const out = items.slice();
  out.splice(idx + 1, 0, copy);
  return out;
}
