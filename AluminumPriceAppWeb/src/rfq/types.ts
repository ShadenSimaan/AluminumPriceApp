// Supplier Request for Quotation (RFQ) data model.
// Deliberately independent from priced quotation types: no profiles, prices or totals.

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
  /** Index 0 is the left-most panel viewed from outside */
  panels: RfqPanel[];
  /** Hinged items only (casement window / hinged doors) */
  swing?: Swing;
  /** Double hinged door: leaf that carries the handle and opens first */
  activeLeaf?: Side;
  /** Required for custom items */
  customDescription: string;
  referenceImage?: RfqReferenceImage;
  glass: string;
  frameFinish: string;
  insectScreen: Requirement;
  shutter: Requirement;
  hardware: string;
  otherRequirements: string;
  notes: string;
};

export type RfqContact = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
};

export type SupplierRequest = {
  id: string;
  documentType: "supplier_rfq";
  schemaVersion: 1;
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
  deliveryDestination: string;
  /** Whether item width/height describe the overall frame or the building opening */
  dimensionBasis: DimensionBasis;
  /** Unit for new items */
  defaultUnit: RfqUnit;
  generalSpecifications: string;
  notes: string;
  items: RfqItem[];
};

export type RfqSettings = {
  uiLanguage: RfqLanguage;
  pdfLanguage: RfqLanguage;
  companyDefaults: RfqContact;
};
