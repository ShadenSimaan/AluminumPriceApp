// Questions for the supplier. Linked questions are derived from the request's requirements and kept in sync:
// a requirement that disappears removes its untouched question; one with a reply or edits is kept and marked stale.
// Generated questions store a template + params, so they are rendered in the PDF language.

import type { RfqItem, RfqLanguage, SupplierProfile, SupplierQuestion, SupplierRequest } from "./types";
import { numberedGlass, hasGlassSubdivisions, hasDecorativeBars, isSimpleColumns } from "./layout";
import { effectiveGlass, glassOptionKeys } from "./glass";
import { availabilityFor, needsConfirmation } from "./suppliers";
import { glassForEntry } from "./accessories";
import { dict, fmt, optionLabel, accessoryLabel } from "./i18n";

export const TEMPLATE_KEYS = [
  "glass_config",
  "lowe_solar",
  "uv",
  "integrated_blinds",
  "hardware_compat",
  "hardware_set",
  "accessory_catalog",
  "subdivisions",
  "alternatives",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number] | "option_unverified" | "accessory" | "glass_recommend" | "shading_recommend";

export type QuestionCandidate = {
  linkKey: string;
  templateKey: TemplateKey;
  params: Record<string, string>;
  itemId: string;
  /** Added automatically (the user selected "ask supplier" or an option that requires a question) */
  auto: boolean;
  /** Shown in the suggestions list */
  suggest: boolean;
};

function glassLabels(numbers: number[], total: number): string {
  return numbers.length === total ? "" : numbers.map((n) => `G${n}`).join(", ");
}

function itemCandidates(item: RfqItem, profile: SupplierProfile | undefined): QuestionCandidate[] {
  const out: QuestionCandidate[] = [];
  const ref = item.reference;
  const glass = numberedGlass(item.layout);
  const add = (c: Omit<QuestionCandidate, "itemId" | "params"> & { params?: Record<string, string> }) =>
    out.push({ ...c, itemId: item.id, params: { ref, ...(c.params ?? {}) } });

  // Glass options: one candidate per option per item, naming the sections that use it.
  const byKey = new Map<string, number[]>();
  const recommend: number[] = [];
  const specs = item.openingType === "custom" ? [{ spec: item.glassSpec, number: 1 }] : glass.map((g) => ({ spec: effectiveGlass(item, g.glass), number: g.number }));
  for (const { spec, number } of specs) {
    for (const k of glassOptionKeys(spec)) byKey.set(k, [...(byKey.get(k) ?? []), number]);
    if (spec.construction === "supplier" || spec.treatment === "supplier" || spec.askRecommendation) recommend.push(number);
  }
  const total = specs.length;
  for (const [key, numbers] of byKey) {
    if (!needsConfirmation(availabilityFor(profile, key).availability)) continue;
    const templateKey: TemplateKey = key === "glass.coating.uv" ? "uv" : key === "glass.coating.low_e" || key === "glass.coating.solar_control" ? "lowe_solar" : "option_unverified";
    add({ linkKey: `${item.id}:opt:${key}`, templateKey, auto: false, suggest: true, params: { sectionKind: "glass", sectionLabel: glassLabels(numbers, total), option: key } });
  }
  if (recommend.length) {
    add({ linkKey: `${item.id}:glass:recommend`, templateKey: "glass_recommend", auto: true, suggest: false, params: { sectionKind: "glass", sectionLabel: glassLabels(recommend, total) } });
  }

  for (const s of item.shading) {
    const numbers = glassForEntry(item, s.appliesTo).map((g) => g.number);
    const params = { sectionKind: s.type === "integrated" ? "glass" : "shading", sectionLabel: s.type === "integrated" ? glassLabels(numbers, glass.length) : "", option: `shading.${s.type}` };
    const key = `shading.${s.type}`;
    const confirmed = s.confirmation === "confirmed" || availabilityFor(profile, key).availability === "confirmed";
    if (s.type === "integrated") add({ linkKey: `${item.id}:shading:${s.id}`, templateKey: "integrated_blinds", auto: !confirmed, suggest: false, params });
    else if (s.type === "supplier") add({ linkKey: `${item.id}:shading:${s.id}`, templateKey: "shading_recommend", auto: true, suggest: false, params });
    else add({ linkKey: `${item.id}:shading:${s.id}`, templateKey: "option_unverified", auto: false, suggest: needsConfirmation(availabilityFor(profile, key).availability) && s.confirmation !== "confirmed", params });
  }

  for (const a of item.accessories) {
    if (a.mode === "unspecified" && !a.customName.trim()) continue;
    add({
      linkKey: `${item.id}:acc:${a.id}`,
      templateKey: "accessory",
      auto: a.mode === "ask",
      suggest: false,
      params: { sectionKind: "hardware", sectionLabel: "", accessory: a.kind, accessoryName: a.customName.trim() },
    });
  }
  if (item.completeHardwareSet) add({ linkKey: `${item.id}:hwset`, templateKey: "hardware_set", auto: true, suggest: false, params: { sectionKind: "hardware", sectionLabel: "" } });

  if (item.openingType !== "custom" && (!isSimpleColumns(item.layout) || hasGlassSubdivisions(item.layout) || hasDecorativeBars(item.layout))) {
    add({ linkKey: `${item.id}:layout`, templateKey: "subdivisions", auto: false, suggest: true, params: { sectionKind: "item", sectionLabel: "" } });
  }
  return out;
}

export function questionCandidates(req: Pick<SupplierRequest, "items">, profile: SupplierProfile | undefined): QuestionCandidate[] {
  const out = req.items.flatMap((it) => itemCandidates(it, profile));
  if (req.items.some((i) => i.alternatives.some((a) => a.description.trim()))) {
    out.push({ linkKey: "req:alternatives", templateKey: "alternatives", params: {}, itemId: "", auto: false, suggest: true });
  }
  for (const k of TEMPLATE_KEYS) out.push({ linkKey: `tpl:${k}`, templateKey: k, params: {}, itemId: "", auto: false, suggest: true });
  return out;
}

export function newQuestion(id: string, c: Pick<QuestionCandidate, "linkKey" | "templateKey" | "params" | "itemId">, origin: SupplierQuestion["origin"], now = Date.now()): SupplierQuestion {
  return { id, linkKey: c.linkKey, origin, templateKey: c.templateKey, params: { ...c.params }, itemId: c.itemId, text: "", reply: "", confirmationNote: "", status: "open", stale: false, createdAt: now };
}

export function customQuestion(id: string, text = "", now = Date.now()): SupplierQuestion {
  return { id, linkKey: "", origin: "custom", templateKey: "", params: {}, itemId: "", text, reply: "", confirmationNote: "", status: "open", stale: false, createdAt: now };
}

const untouched = (q: SupplierQuestion) => q.status === "open" && !q.reply.trim() && !q.text.trim() && !q.confirmationNote.trim();

const sameParams = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(a) === JSON.stringify(b);

function makeId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Idempotent: returns the same object when nothing changes (keeps the "unsaved changes" state accurate). */
export function syncQuestions(req: SupplierRequest, profile: SupplierProfile | undefined, now = Date.now()): SupplierRequest {
  const cands = questionCandidates(req, profile);
  const byKey = new Map(cands.map((c) => [c.linkKey, c]));
  let changed = false;
  const kept: SupplierQuestion[] = [];
  for (const q of req.questions) {
    if (!q.linkKey) {
      kept.push(q);
      continue;
    }
    const c = byKey.get(q.linkKey);
    if (!c) {
      if (untouched(q)) {
        changed = true;
        continue;
      }
      if (!q.stale) {
        changed = true;
        kept.push({ ...q, stale: true });
      } else kept.push(q);
      continue;
    }
    if (q.stale || q.templateKey !== c.templateKey || q.itemId !== c.itemId || !sameParams(q.params, c.params)) {
      changed = true;
      kept.push({ ...q, stale: false, templateKey: c.templateKey, itemId: c.itemId, params: { ...c.params } });
    } else kept.push(q);
  }
  const have = new Set(kept.map((q) => q.linkKey));
  for (const c of cands) {
    if (!c.auto || have.has(c.linkKey) || req.dismissedQuestionKeys.includes(c.linkKey)) continue;
    kept.push(newQuestion(makeId(), c, "auto", now));
    have.add(c.linkKey);
    changed = true;
  }
  return changed ? { ...req, questions: kept } : req;
}

/** Add questions for the given candidate keys (no duplicates). */
export function addLinkedQuestions(req: SupplierRequest, profile: SupplierProfile | undefined, keys: string[], now = Date.now()): SupplierRequest {
  if (!keys.length) return req;
  const cands = new Map(questionCandidates(req, profile).map((c) => [c.linkKey, c]));
  const have = new Set(req.questions.map((q) => q.linkKey).filter(Boolean));
  const added: SupplierQuestion[] = [];
  for (const k of keys) {
    const c = cands.get(k);
    if (!c || have.has(k)) continue;
    added.push(newQuestion(makeId(), c, k.startsWith("tpl:") ? "template" : "linked", now));
    have.add(k);
  }
  if (!added.length) return req;
  return { ...req, questions: [...req.questions, ...added], dismissedQuestionKeys: req.dismissedQuestionKeys.filter((k) => !keys.includes(k)) };
}

export function removeQuestion(req: SupplierRequest, id: string): SupplierRequest {
  const q = req.questions.find((x) => x.id === id);
  if (!q) return req;
  const dismissed = q.linkKey && q.origin === "auto" && !req.dismissedQuestionKeys.includes(q.linkKey) ? [...req.dismissedQuestionKeys, q.linkKey] : req.dismissedQuestionKeys;
  return { ...req, questions: req.questions.filter((x) => x.id !== id), dismissedQuestionKeys: dismissed };
}

/** Suggestions not yet added. */
export function pendingSuggestions(req: SupplierRequest, profile: SupplierProfile | undefined): QuestionCandidate[] {
  const have = new Set(req.questions.map((q) => q.linkKey).filter(Boolean));
  return questionCandidates(req, profile).filter((c) => c.suggest && !have.has(c.linkKey) && !req.dismissedQuestionKeys.includes(c.linkKey));
}

export function dismissSuggestion(req: SupplierRequest, linkKey: string): SupplierRequest {
  return req.dismissedQuestionKeys.includes(linkKey) ? req : { ...req, dismissedQuestionKeys: [...req.dismissedQuestionKeys, linkKey] };
}

/** "[W-01 · Glass G2]" style context, language-aware. */
export function questionContext(lang: RfqLanguage, q: Pick<SupplierQuestion, "params">): string {
  const d = dict(lang);
  const p = q.params;
  const parts: string[] = [];
  if (p.ref) parts.push(p.ref);
  const kind = p.sectionKind;
  if (kind === "glass") parts.push(p.sectionLabel ? `${d.q.sectionGlass} ${p.sectionLabel}` : d.q.sectionAllGlass);
  else if (kind === "hardware") parts.push(d.q.sectionHardware);
  else if (kind === "shading") parts.push(d.q.sectionShading);
  return parts.join(" · ");
}

export function renderTemplate(lang: RfqLanguage, templateKey: string, params: Record<string, string>): string {
  const d = dict(lang);
  const tpl = d.qt[templateKey];
  if (!tpl) return "";
  const accessory = params.accessoryName || (params.accessory ? accessoryLabel(lang, params.accessory) : "");
  return fmt(tpl, { option: params.option ? optionLabel(lang, params.option) : "", accessory });
}

export function questionText(lang: RfqLanguage, q: SupplierQuestion): string {
  return q.text.trim() || renderTemplate(lang, q.templateKey, q.params);
}

export function openQuestions(req: Pick<SupplierRequest, "questions">): SupplierQuestion[] {
  return req.questions.filter((q) => q.status === "open");
}
