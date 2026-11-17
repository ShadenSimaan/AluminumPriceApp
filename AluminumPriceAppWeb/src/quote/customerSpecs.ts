import type { PdfLineItem } from "../pdfExporter";
import { dict, describeConfigurationShort, describeGlass, type SpecRow } from "../rfq/i18n";
import { isAccessoryUsed } from "../rfq/accessories";
import type { RfqItem } from "../rfq/types";
import { formatDimension } from "../rfq/units";
import { isOpenAreaRate, lineTotal, lineUnitPrice, parseLooseNumber, priceBasisOf } from "./pricing";

/** Customer-facing specification rows (full). Supplier confirmation status is omitted. */
export function customerFacingSpecs(item: RfqItem): SpecRow[] {
  return essentialProductSpecRows(item);
}

/** Shared drawing / layout disclaimers — printed once in the PDF notes, not under every product. */
export function customerPdfGeneralNotes(): string[] {
  const d = dict("he");
  return [
    `${d.ui.viewedFromOutside}. ${d.pdf.schematic}`,
    d.layout.layoutNote,
  ];
}

/**
 * Compact essential rows for the customer product card:
 * opening type, glass, accessories, frame finish — no layout essays or empty fields.
 */
export function essentialProductSpecRows(item: RfqItem): SpecRow[] {
  const d = dict("he");
  const labels = new Set(Object.values(d.availability));
  const stripAvailability = (value: string) =>
    value
      .split(" · ")
      .filter((part) => ![...labels].some((label) => part.includes(label)))
      .filter((part) => !part.includes("על הספק לאשר"))
      .join(" · ")
      .trim();

  const rows: SpecRow[] = [];
  rows.push({ label: d.ui.openingType, value: d.openingType[item.openingType] });

  if (item.openingType === "custom") {
    const desc = item.customDescription.trim();
    if (desc) rows.push({ label: "תיאור", value: desc, user: true });
  } else {
    const short = describeConfigurationShort("he", item);
    if (short.trim()) rows.push({ label: "תצורה", value: short });
  }

  const glassParts = describeGlass("he", item.glassSpec)
    .map(stripAvailability)
    .filter((v) => v && v !== d.glass.supplierConfirm);
  if (item.glass.trim()) glassParts.push(item.glass.trim());
  const glass = glassParts.filter(Boolean).join(" · ");
  if (glass) rows.push({ label: "זכוכית", value: glass, user: Boolean(item.glass.trim()) });

  const accessories: string[] = [];
  if (item.completeHardwareSet) accessories.push(d.hw.completeSetOn);
  for (const a of item.accessories.filter(isAccessoryUsed)) {
    const name = a.kind === "custom" ? a.customName.trim() || d.accKind.custom : d.accKind[a.kind];
    const bits = [
      name,
      a.mode !== "include" ? d.accMode[a.mode] : "",
      a.quantity != null ? `×${a.quantity}` : "",
      a.model.trim(),
      a.finish.trim(),
    ].filter(Boolean);
    accessories.push(bits.join(" "));
  }
  for (const s of item.shading) {
    const type =
      s.type === "other" && s.customType.trim()
        ? s.customType.trim()
        : d.shadingType[s.type];
    const bits = [type, s.color.trim(), s.operation !== "unspecified" ? d.shadingOp[s.operation] : ""].filter(Boolean);
    if (bits.length) accessories.push(bits.join(" "));
  }
  if (item.hardware.trim()) accessories.push(item.hardware.trim());
  if (accessories.length) rows.push({ label: "אביזרים", value: accessories.join(" · "), user: true });

  if (item.frameFinish.trim()) rows.push({ label: "גמר מסגרת", value: item.frameFinish.trim(), user: true });

  return rows.filter((row) => row.value.trim());
}

/** Label/value pairs for one compact product card beside the drawing. */
export function compactProductCardRows(item: PdfLineItem): { label: string; value: string; ltr?: boolean; strong?: boolean }[] {
  const cfg = item.configuration;
  if (!cfg) return [];
  const d = dict("he");
  const qty = Math.max(0, parseLooseNumber(item.qty));
  const w = cfg.widthCm;
  const h = cfg.heightCm;
  const dims =
    w != null && h != null
      ? `${formatDimension(w, cfg.unit)} × ${formatDimension(h, cfg.unit)} ${cfg.unit === "mm" ? "מ״מ" : "ס״מ"}`
      : "";

  const rows: { label: string; value: string; ltr?: boolean; strong?: boolean }[] = [
    { label: "מזהה", value: cfg.reference || "" },
    { label: "מידות", value: dims, ltr: true },
    { label: d.ui.quantity, value: String(qty), ltr: true },
    ...essentialProductSpecRows(cfg).map((r) => ({ label: r.label, value: r.value })),
    { label: "פרופיל", value: item.profileName || "" },
  ];

  if (item.location?.trim()) rows.push({ label: "מיקום", value: item.location.trim() });
  // Customer-facing remarks only — skip empty and internal verification chatter.
  const details = (item.details || "").trim();
  if (details && !isInternalDetail(details)) rows.push({ label: "הערות", value: details });

  const rateOnly = isOpenAreaRate(item);
  const unit = rateOnly ? parseLooseNumber(item.unitPrice) : lineUnitPrice(item);
  const total = lineTotal(item);
  const unitLabel = priceBasisOf(item) === "per_m2" ? "מחיר ליח׳ (מ״ר)" : "מחיר ליח׳";
  rows.push({
    label: unitLabel,
    value: rateOnly ? `${formatShekel(unit)} למ״ר` : formatShekel(unit),
    strong: true,
  });
  if (!rateOnly) rows.push({ label: "סה״כ לפני מע״מ", value: formatShekel(total), strong: true });

  return rows.filter((r) => r.value.trim());
}

export function dimensionText(cm: number | null, unit: RfqItem["unit"]): string {
  if (cm == null) return "";
  return `${formatDimension(cm, unit)} ${unit === "mm" ? "מ״מ" : "ס״מ"}`;
}

function isInternalDetail(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("internal") ||
    t.includes("verification") ||
    t.includes("import") ||
    t.includes("supplier remark") ||
    t.includes("לבדיקה פנימית") ||
    t.includes("הערה פנימית")
  );
}

function formatShekel(value: number): string {
  return `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(value)} ₪`;
}
