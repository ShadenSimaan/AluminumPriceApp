// Supplier Request for Quotation (RFQ) data model.
// Outbound RFQ PDFs stay unpriced. Optional supplierPrice / supplierQuotation fields track
// returned supplier quotes for expense calculation only.

export type RfqLanguage = "en" | "he";

/** Display/entry unit. Dimensions are always stored in centimeters (same as quotation items). */
export type RfqUnit = "cm" | "mm";

export type RfqCategory = "window" | "door";

export type RfqOpeningType =
  | "fixed_window"
  | "sliding_window"
  | "casement_window"
  | "tilt_turn_window"
  | "top_hung_window"
  | "sliding_door"
  | "hinged_door_single"
  | "hinged_door_double"
  | "custom";

export const RFQ_OPENING_TYPES: readonly RfqOpeningType[] = [
  "fixed_window",
  "sliding_window",
  "casement_window",
  "tilt_turn_window",
  "top_hung_window",
  "sliding_door",
  "hinged_door_single",
  "hinged_door_double",
  "custom",
];

export type PanelOperation = "fixed" | "sliding" | "casement" | "tilt_turn" | "top_hung" | "hinged";

/** Always expressed as seen from OUTSIDE the building. Never mirrored by UI language. */
export type Side = "left" | "right";

export type Swing = "inward" | "outward";

export type DimensionBasis = "frame" | "opening";

export type Requirement = "unspecified" | "required" | "not_required";

export type RfqPanel = {
  operation: PanelOperation;
  /** casement / tilt_turn / hinged: side carrying the hinges, viewed from outside */
  hingeSide?: Side;
  /** sliding: direction the panel moves when opening, viewed from outside */
  slideDirection?: Side;
};

export type RfqReferenceImage = {
  name: string;
  mime: "image/png" | "image/jpeg";
  dataUrl: string;
};

// ---------- Hierarchical layout ----------
// Frame splits (mullions/transoms) divide the frame into main panels; each panel (fixed light or
// operable sash/leaf) owns a glazing tree whose splits are physical glazing bars between separate glass
// units. Decorative bars are drawn on a glass section and never create separate glass units.

/** "columns" = side by side (vertical dividers); "rows" = stacked (horizontal dividers) */
export type SplitDirection = "columns" | "rows";

/** `sizeCm` null = shares the remaining length equally with the other automatic children */
export type SizedChild<T> = { sizeCm: number | null; node: T };

export type DecorativeBars = { columns: number; rows: number };

export type GlassNode = {
  kind: "glass";
  id: string;
  /** Section-specific glass; absent = uses the item's default glass */
  override?: GlassSpec;
  decorativeBars?: DecorativeBars;
};

export type GlassSplit = {
  kind: "glassSplit";
  id: string;
  direction: SplitDirection;
  children: SizedChild<GlazingNode>[];
};

export type GlazingNode = GlassNode | GlassSplit;

export type PanelNode = {
  kind: "panel";
  id: string;
  operation: PanelOperation;
  hingeSide?: Side;
  slideDirection?: Side;
  glazing: GlazingNode;
};

export type FrameSplit = {
  kind: "frameSplit";
  id: string;
  direction: SplitDirection;
  children: SizedChild<FrameNode>[];
};

export type FrameNode = PanelNode | FrameSplit;

// ---------- Glass ----------

export type GlazingConstruction = "unspecified" | "single" | "double" | "triple" | "custom" | "supplier";
export type GlassTreatment = "unspecified" | "annealed" | "heat_strengthened" | "tempered" | "laminated" | "tempered_laminated" | "supplier";
export type GlassAppearance = "unspecified" | "clear" | "low_iron" | "tinted" | "reflective" | "frosted" | "patterned" | "custom";
export type GlassCoating = "low_e" | "solar_control" | "uv" | "acoustic" | "custom";
export type CavityFill = "unspecified" | "air" | "argon" | "other";

/** Glazing thicknesses are always millimetres, independent of the item's frame unit. */
export type GlassPane = { thicknessMm: number | null; note: string };
export type GlassCavity = { widthMm: number | null; fill: CavityFill; fillNote: string };

/** Free text so values such as "1.1" or "max 1.1" are kept exactly; blank = unknown. */
export type GlassPerformance = { uValue: string; gValue: string; lightTransmission: string; uv: string; acoustic: string };

export type GlassSpec = {
  construction: GlazingConstruction;
  constructionNote: string;
  treatment: GlassTreatment;
  appearance: GlassAppearance;
  tintColor: string;
  appearanceNote: string;
  coatings: GlassCoating[];
  coatingProduct: string;
  coatingSurface: string;
  customRequirement: string;
  panes: GlassPane[];
  cavities: GlassCavity[];
  interlayer: string;
  /** What we ask for */
  required: GlassPerformance;
  /** What the supplier states (kept separate; entered from their reply) */
  declared: GlassPerformance;
  askRecommendation: boolean;
  notes: string;
};

// ---------- Supplier availability ----------

export type Availability = "listed" | "listed_other_family" | "not_verified" | "confirmed" | "unavailable";

export const AVAILABILITIES: readonly Availability[] = ["listed", "listed_other_family", "not_verified", "confirmed", "unavailable"];

export type CatalogCategory = "glass" | "shading" | "hardware" | "other";

export type CatalogEntry = {
  id: string;
  category: CatalogCategory;
  /** Supplier's own wording */
  label: string;
  /** Option keys this entry speaks about, e.g. "glass.coating.low_e" */
  optionKeys: string[];
  availability: Availability;
  productFamily: string;
  sourceUrls: string[];
  /** YYYY-MM-DD */
  checkedDate: string;
  notes: string;
};

export type SupplierProfile = {
  id: string;
  /** Set for seeded suppliers so they are seeded only once */
  builtinKey?: string;
  displayName: string;
  website: string;
  contact: RfqContact;
  notes: string;
  catalog: CatalogEntry[];
  /** Optional local brand mark (e.g. /brand/eklien-logo.jpg). Not company branding. */
  logoUrl?: string;
};

// ---------- Blinds / shading ----------

export type ShadingType = "integrated" | "interior" | "exterior" | "roller_shutter" | "other" | "supplier";
export const SHADING_TYPES: readonly ShadingType[] = ["integrated", "interior", "exterior", "roller_shutter", "other", "supplier"];
export type ShadingOperation = "unspecified" | "manual" | "motorized";

export type ShadingEntry = {
  id: string;
  type: ShadingType;
  /** Panel ids (or glass ids for integrated blinds); empty = whole item */
  appliesTo: string[];
  customType: string;
  location: string;
  color: string;
  operation: ShadingOperation;
  control: string;
  dimensions: string;
  installation: string;
  notes: string;
  confirmation: Availability;
};

// ---------- Hardware & accessories ----------

export type AccessoryKind =
  | "handles"
  | "hinges"
  | "friction_stays"
  | "rollers_tracks"
  | "locks"
  | "restrictors"
  | "gaskets"
  | "insect_screen"
  | "fixings"
  | "custom";

export const ACCESSORY_KINDS: readonly AccessoryKind[] = [
  "handles",
  "hinges",
  "friction_stays",
  "rollers_tracks",
  "locks",
  "restrictors",
  "gaskets",
  "insect_screen",
  "fixings",
  "custom",
];

export type AccessoryMode = "unspecified" | "included" | "separate" | "excluded" | "ask";

export type Accessory = {
  id: string;
  kind: AccessoryKind;
  customName: string;
  mode: AccessoryMode;
  quantity: number | null;
  model: string;
  finish: string;
  compatibility: string;
  /** Panel ids; empty = whole item */
  appliesTo: string[];
  notes: string;
  confirmation: Availability;
};

export type RfqAlternative = { id: string; description: string };

// ---------- Supplier questions ----------

export type QuestionStatus = "open" | "answered" | "resolved";

export type SupplierQuestion = {
  id: string;
  /** Links the question to a requirement ("" = free question). Used for de-duplication and sync. */
  linkKey: string;
  origin: "auto" | "linked" | "template" | "custom";
  /** Generated text template; rendered in the PDF language unless `text` is set */
  templateKey: string;
  params: Record<string, string>;
  itemId: string;
  /** User-written text; overrides the template */
  text: string;
  reply: string;
  confirmationNote: string;
  status: QuestionStatus;
  /** Linked requirement no longer exists but the question has a reply/edits, so it was kept */
  stale: boolean;
  createdAt: number;
};

export type RfqItem = {
  id: string;
  /** Unique within the request, e.g. W-01 / D-01 */
  reference: string;
  category: RfqCategory;
  openingType: RfqOpeningType;
  /** Stored in cm (null until entered) */
  widthCm: number | null;
  heightCm: number | null;
  /** Unit in which this item is entered and shown to the supplier */
  unit: RfqUnit;
  quantity: number;
  location: string;
  /** Source of truth for the panel/glass layout */
  layout: FrameNode;
  /** Derived from `layout` (panel leaves in reading order); index 0 is the left-most panel viewed from outside */
  panels: RfqPanel[];
  /** Hinged items only (casement window / hinged doors) */
  swing?: Swing;
  /** Double hinged door: leaf that carries the handle and opens first */
  activeLeaf?: Side;
  /** Required for custom items */
  customDescription: string;
  referenceImage?: RfqReferenceImage;
  /** Item-level default glass, used by every glass section without an override */
  glassSpec: GlassSpec;
  /** Free-text glass description (legacy field; kept and exported as written) */
  glass: string;
  frameFinish: string;
  /** Derived from the insect-screen accessory when present (kept for import/compatibility) */
  insectScreen: Requirement;
  /** General shutter requirement (legacy field; blinds/shading entries are separate) */
  shutter: Requirement;
  shading: ShadingEntry[];
  accessories: Accessory[];
  completeHardwareSet: boolean;
  /** General hardware notes (legacy free text) */
  hardware: string;
  alternatives: RfqAlternative[];
  otherRequirements: string;
  notes: string;
  /**
   * Supplier quotation prices for this item (internal expense tracking).
   * Not exported on the RFQ PDF sent to the supplier.
   */
  supplierPrice?: RfqItemSupplierPrice;
};

/** Per-item supplier quote after CSV/Excel import (or manual entry). */
export type RfqItemSupplierPrice = {
  /** Original currency as printed (usually USD) */
  currency: string;
  unitPriceOriginal: number;
  screenPriceOriginal: number;
  lineTotalOriginal: number;
  unitPriceIls: number;
  screenPriceIls: number;
  lineTotalIls: number;
  profileSeries?: string;
  remarks?: string;
};

export type RfqContact = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  website: string;
};

/** Whether a supplier quotation with prices has been attached to this request. */
export type QuotationStatus = "pending" | "done";

/** Header/totals from an imported supplier quotation file. */
export type SupplierQuotationInfo = {
  quotationNumber: string;
  quotationDate: string;
  currency: string;
  /** 1 unit of `currency` = this many ILS */
  exchangeRateToIls: number;
  productSubtotalOriginal: number | null;
  packagingOriginal: number | null;
  inlandTransportOriginal: number | null;
  grandTotalOriginal: number | null;
  productSubtotalIls: number | null;
  packagingIls: number | null;
  inlandTransportIls: number | null;
  grandTotalIls: number | null;
  importedAt: number;
  sourceFileName: string;
};

export type SupplierRequest = {
  id: string;
  documentType: "supplier_rfq";
  schemaVersion: 2;
  /** Separate running number (RFQ-0001); assigned on first save */
  number?: number;
  createdAt: number;
  updatedAt: number;
  projectName: string;
  projectReference: string;
  /** YYYY-MM-DD */
  requestDate: string;
  company: RfqContact;
  supplier: RfqContact;
  /** Supplier directory entry the request was addressed to (catalog hints only; never changes the design) */
  supplierProfileId?: string;
  questions: SupplierQuestion[];
  /** Link keys of automatic questions the user deleted, so they are not re-added */
  dismissedQuestionKeys: string[];
  deliveryDestination: string;
  /** Whether item width/height describe the overall frame or the building opening */
  dimensionBasis: DimensionBasis;
  /** Unit for new items */
  defaultUnit: RfqUnit;
  generalSpecifications: string;
  notes: string;
  items: RfqItem[];
  /** pending until a matching supplier quotation with prices is attached */
  quotationStatus: QuotationStatus;
  /** Last imported supplier quotation (expense tracking; not on the outbound RFQ PDF) */
  supplierQuotation?: SupplierQuotationInfo;
};

export type RfqSettings = {
  uiLanguage: RfqLanguage;
  pdfLanguage: RfqLanguage;
  companyDefaults: RfqContact;
  suppliers: SupplierProfile[];
  /** builtinKeys already seeded (a deleted seeded supplier is not re-added) */
  seededSuppliers: string[];
};
