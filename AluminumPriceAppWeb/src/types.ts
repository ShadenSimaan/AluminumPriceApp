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

export type LineItem = {
  id: string;
  widthCm: string; // text input
  heightCm: string; // text input
  qty: string; // text input
  profileId?: string;
  profileName?: string; // <-- חשוב בשביל ה-PDF והטבלה
  unitPrice: string; // from profile by default but editable
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
};

export type AppCurrentState = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerNotes: string;
  title: string;
  items: LineItem[];
  taxPercentText: string;
  notes: string;
};

export type AppState = {
  customers: Customer[];
  quotes: Quote[];
  profiles: Profile[];
  current: AppCurrentState;
  ui: AppUIState;
};
