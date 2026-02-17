// FILE: src/types.ts

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: number;
};

export type Profile = {
  id: string;
  name: string;
  unitPrice: number; // price per m²
};

export type Addon = {
  id: string;
  name: string;
  price: string; // text input (per item)
  checked: boolean;
};

export type FreeFormAddition = {
  id: string;
  name: string;
  price: string; // text input
  qty: string; // text input
};

export type LineItem = {
  id: string;
  widthCm: string; // text input
  heightCm: string; // text input
  qty: string; // text input
  profileId?: string;
  profileName?: string; // <-- חשוב בשביל ה-PDF והטבלה
  unitPrice: string; // from profile by default but editable (price per m²)
  /** When set, used as price per unit directly (no formula). Addons still added. */
  manualUnitPrice?: string;
  location?: string;
  details?: string;
  addons: Addon[];
  subtotal: number; // computed
};

export type Quote = {
  id: string;
  customerId: string;
  title: string; // internal only (for filename)
  date: number; // epoch ms
  items: LineItem[];
  taxPercent: number; // accepts 0.18 or 18
  totals: { sub: number; tax: number; grand: number };
};

export type AppUIState = {
  tab: "quote" | "customers";
  settingsOpen: boolean;
  profilesSettingsOpen: boolean;
};

export type AppCurrentState = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerNotes: string;
  title: string;
  items: LineItem[];
  freeFormAdditions: FreeFormAddition[]; // תוספות חופשיות
  taxPercentText: string;
  notes: string;
};

/** Dimension unit for width/height (stored internally in cm) */
export type DimensionUnit = "cm" | "mm";

/** Preset text options for "הערות למסמך" – user can select one when starting a new quote */
export type NotesPreset = {
  id: string;
  label: string;  // short label for the dropdown
  text: string;   // full text applied to notes
};

export type AppState = {
  customers: Customer[];
  quotes: Quote[];
  profiles: Profile[];
  addons: Addon[]; // Global addons that can be managed in settings
  /** Default הערות presets – manageable in main Settings, selectable when editing notes */
  notesPresets: NotesPreset[];
  current: AppCurrentState;
  ui: AppUIState;
  pdfSaveFolder?: string; // Custom folder path for PDF exports (optional, defaults to Desktop)
  dimensionUnit?: DimensionUnit; // ס״מ or מ״מ – display/input only; data always in cm
};
