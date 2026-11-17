import type { QuestionStatus, RfqLanguage, SupplierProfile, SupplierQuestion, SupplierRequest } from "./types";
import { dict, fmt } from "./i18n";
import { addLinkedQuestions, customQuestion, dismissSuggestion, pendingSuggestions, questionContext, questionText, removeQuestion, renderTemplate } from "./questions";
import { rfqUuid } from "./rfqState";
import { Btn, Card, Field, Select, TextArea } from "./ui";

const STATUSES: QuestionStatus[] = ["open", "answered", "resolved"];

export default function QuestionsCard({
  lang,
  draft,
  profile,
  updateDraft,
}: {
  lang: RfqLanguage;
  draft: SupplierRequest;
  profile: SupplierProfile | undefined;
  updateDraft: (fn: (r: SupplierRequest) => SupplierRequest) => void;
}) {
  const d = dict(lang);
  const Q = d.q;
  const suggestions = pendingSuggestions(draft, profile);
  const setQ = (id: string, patch: Partial<SupplierQuestion>) => updateDraft((r) => ({ ...r, questions: r.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  const refOf = (q: SupplierQuestion) => questionContext(lang, q);
  const open = draft.questions.filter((q) => q.status === "open").length;

  return (
    <Card
      title={
        <>
          {Q.title} <span className="text-sm font-normal text-slate-600">· {fmt(d.ui.questionsCount, { n: open })}</span>
        </>
      }
      actions={
        <Btn small variant="primary" onClick={() => updateDraft((r) => ({ ...r, questions: [...r.questions, customQuestion(rfqUuid())] }))}>
          + {Q.custom}
        </Btn>
      }
    >
      <div className="grid gap-3">
        <div className="text-xs text-slate-500">{Q.intro}</div>
        {draft.questions.length === 0 && <div className="text-sm text-slate-500">{Q.none}</div>}
        <ol className="grid gap-2">
          {draft.questions.map((q, i) => (
            <li key={q.id} className={`rounded-md border p-2 grid gap-2 ${q.stale ? "border-amber-300 bg-amber-50/60" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Q{i + 1}</span>
                {refOf(q) && <bdi>{refOf(q)}</bdi>}
                {q.origin === "auto" && <span className="rounded bg-slate-100 px-1.5 py-0.5">{Q.auto}</span>}
                <div className="ms-auto flex items-center gap-2">
                  <div className="w-36">
                    <Select<QuestionStatus> ariaLabel={Q.status} value={q.status} onChange={(v) => setQ(q.id, { status: v })} options={STATUSES.map((s) => ({ value: s, label: d.qStatus[s] }))} />
                  </div>
                  <Btn small variant="ghost" onClick={() => updateDraft((r) => removeQuestion(r, q.id))}>
                    {d.ui.delete}
                  </Btn>
                </div>
              </div>
              {q.stale && <div className="text-xs text-amber-800">{Q.stale}</div>}
              <TextArea rows={2} value={questionText(lang, q)} onChange={(v) => setQ(q.id, { text: v === renderTemplate(lang, q.templateKey, q.params) ? "" : v })} />
              <div className="grid sm:grid-cols-2 gap-2">
                <Field label={Q.reply}>
                  <TextArea rows={2} value={q.reply} onChange={(v) => setQ(q.id, { reply: v, status: v.trim() && q.status === "open" ? "answered" : q.status })} />
                </Field>
                <Field label={Q.confirmationNote}>
                  <TextArea rows={2} value={q.confirmationNote} onChange={(v) => setQ(q.id, { confirmationNote: v })} />
                </Field>
              </div>
            </li>
          ))}
        </ol>
        {suggestions.length > 0 && (
          <details className="rounded-md border border-slate-200 bg-slate-50 p-2" open={draft.questions.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">
              {Q.suggested} ({suggestions.length})
            </summary>
            <div className="mt-2 grid gap-1.5">
              <div>
                <Btn small onClick={() => updateDraft((r) => addLinkedQuestions(r, profile, suggestions.map((s) => s.linkKey)))}>
                  {Q.addAll}
                </Btn>
              </div>
              <ul className="grid gap-1.5">
                {suggestions.map((s) => {
                  const ctx = questionContext(lang, { params: s.params });
                  return (
                    <li key={s.linkKey} className="flex flex-wrap items-start gap-2 text-sm">
                      <div className="flex-1 min-w-[14rem]">
                        {ctx && <bdi className="text-xs text-slate-600 me-1">[{ctx}]</bdi>}
                        {renderTemplate(lang, s.templateKey, s.params)}
                      </div>
                      <Btn small onClick={() => updateDraft((r) => addLinkedQuestions(r, profile, [s.linkKey]))}>
                        + {Q.addSuggestion}
                      </Btn>
                      <Btn small variant="ghost" onClick={() => updateDraft((r) => dismissSuggestion(r, s.linkKey))}>
                        {Q.dismiss}
                      </Btn>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}
