"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Cloud, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, inputClass } from "@/components/ui/input";
import { selectClass } from "@/components/business/list-view";
import { cn } from "@/lib/cn";
import { pick, type MessageKey } from "@/lib/i18n";
import { parseMark, parsePastedGrid, stats, termPercent } from "@/lib/school/grading";
import { bandFor, type GradeBand } from "@/lib/school/settings";
import { deleteAssessment, saveAssessment, saveMarks, type AssessmentInput } from "@/app/actions/exams";

interface Assessment {
  id: string;
  name: string;
  nameAr: string | null;
  kind: "exam" | "quiz" | "assignment" | "project";
  date: string;
  maxScore: number;
  weight: number;
}

const key = (a: string, s: string) => `${a}|${s}`;
const show = (score: number | null, absent: boolean) => (absent ? "a" : score == null ? "" : String(score / 100));

export function Gradebook(p: {
  slug: string;
  section: { id: string; label: string; campus: string };
  subject: { id: string; name: string; color: string | null; teacher: string | null };
  termId: string;
  terms: { id: string; name: string }[];
  students: { id: string; name: string; plainName: string; color: string | null }[];
  assessments: Assessment[];
  marks: { assessmentId: string; studentId: string; score: number | null; absent: boolean }[];
  scale: GradeBand[];
  passMark: number;
  canEdit: boolean;
  others: { sectionId: string; subjectId: string; label: string }[];
  now: string;
}) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const initial = () => Object.fromEntries(p.marks.map((m) => [key(m.assessmentId, m.studentId), show(m.score, m.absent)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [seen, setSeen] = useState(p.marks);
  if (seen !== p.marks) {
    setSeen(p.marks);
    setValues(initial());
  }
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [editing, setEditing] = useState<Assessment | "new" | null>(null);
  const grid = useRef<HTMLTableElement>(null);
  const cols = p.assessments;

  // Save a moment after the last keystroke.
  useEffect(() => {
    if (!dirty.size || !p.canEdit) return;
    const id = setTimeout(async () => {
      const batch = [...dirty];
      setDirty(new Set());
      setSaving("saving");
      const res = await saveMarks(
        p.slug,
        p.section.id,
        p.subject.id,
        batch.map((k) => {
          const [assessmentId, studentId] = k.split("|");
          return { assessmentId, studentId, value: values[k] ?? "" };
        }),
      );
      if (!res.ok) {
        setSaving("idle");
        return void toast.error(t(res.error as MessageKey));
      }
      setInvalid((cur) => {
        const next = new Set([...cur].filter((k) => !batch.includes(k)));
        for (const c of res.invalid) next.add(key(c.assessmentId, c.studentId));
        return next;
      });
      setSaving("saved");
    }, 700);
    return () => clearTimeout(id);
  }, [dirty, values, p.canEdit, p.slug, p.section.id, p.subject.id, t]);

  const setCell = (k: string, v: string) => {
    setValues((x) => ({ ...x, [k]: v }));
    setDirty((d) => new Set(d).add(k));
    setSaving("idle");
  };

  // Live term results from what's on screen.
  const parsedMarks = useMemo(() => {
    const out: { assessmentId: string; studentId: string; score: number | null; absent: boolean }[] = [];
    for (const a of cols) {
      for (const st of p.students) {
        const v = values[key(a.id, st.id)] ?? "";
        const m = parseMark(v, a.maxScore);
        if (m !== "invalid" && (m.score != null || m.absent)) out.push({ assessmentId: a.id, studentId: st.id, ...m });
      }
    }
    return out;
  }, [values, cols, p.students]);
  const term = new Map(p.students.map((st) => [st.id, termPercent(cols.map((a) => ({ id: a.id, maxScore: a.maxScore, weight: a.weight })), parsedMarks.filter((m) => m.studentId === st.id))]));
  const termStats = stats([...term.values()]);
  const totalWeight = cols.reduce((s, a) => s + a.weight, 0);
  const bands = p.scale.map((b) => ({ ...b, count: [...term.values()].filter((v) => v != null && bandFor(p.scale, v)?.letter === b.letter).length }));
  const maxBand = Math.max(1, ...bands.map((b) => b.count));

  const focus = (row: number, col: number) => {
    const el = grid.current?.querySelector<HTMLInputElement>(`input[data-r="${row}"][data-c="${col}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const rtl = dir === "rtl";
    if (e.key === "Enter" || e.key === "ArrowDown") (e.preventDefault(), focus(row + 1, col));
    else if (e.key === "ArrowUp") (e.preventDefault(), focus(row - 1, col));
    else if ((e.key === "ArrowRight" && !rtl) || (e.key === "ArrowLeft" && rtl)) {
      if (e.currentTarget.selectionStart === e.currentTarget.value.length) (e.preventDefault(), focus(row, col + 1));
    } else if ((e.key === "ArrowLeft" && !rtl) || (e.key === "ArrowRight" && rtl)) {
      if (e.currentTarget.selectionStart === 0) (e.preventDefault(), focus(row, col - 1));
    }
  };
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, row: number, col: number) => {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    const block = parsePastedGrid(text);
    let count = 0;
    const next: Record<string, string> = {};
    block.forEach((line, i) =>
      line.forEach((cell, j) => {
        const st = p.students[row + i];
        const a = cols[col + j];
        if (!st || !a) return;
        next[key(a.id, st.id)] = cell.trim();
        count++;
      }),
    );
    setValues((x) => ({ ...x, ...next }));
    setDirty((d) => new Set([...d, ...Object.keys(next)]));
    toast.success(t("gradebook.pasted", { count }));
  };

  const goTo = (sectionId: string, subjectId: string, termId = p.termId) => {
    const next = new URLSearchParams(search.toString());
    next.set("section", sectionId);
    next.set("subject", subjectId);
    next.set("term", termId);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <Link href={`/w/${p.slug}/exams`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("exams.title")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <span className="size-3 rounded-full" style={{ background: p.subject.color ?? "var(--accent)" }} />
            {p.subject.name} · <span className="tabular">{p.section.label}</span>
          </h1>
          <p className="text-sm text-muted">
            {p.section.campus}
            {p.subject.teacher ? ` · ${p.subject.teacher}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.others.length > 1 && (
            <select aria-label={t("exams.myGradebooks")} className={selectClass} value={`${p.section.id}|${p.subject.id}`} onChange={(e) => goTo(...(e.target.value.split("|") as [string, string]))}>
              {p.others.map((o) => (
                <option key={`${o.sectionId}|${o.subjectId}`} value={`${o.sectionId}|${o.subjectId}`}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <select aria-label={t("school.term")} className={selectClass} value={p.termId} onChange={(e) => goTo(p.section.id, p.subject.id, e.target.value)}>
            {p.terms.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {p.canEdit && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> {t("gradebook.addAssessment")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        {p.canEdit ? <span>{t("gradebook.hint")}</span> : (
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" /> {t("gradebook.readOnly")}
          </span>
        )}
        <span className="inline-flex items-center gap-3">
          {totalWeight !== 100 && cols.length > 0 && <Badge tone="warning">{t("gradebook.weights", { pct: totalWeight })}</Badge>}
          {saving === "saving" && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3.5 animate-spin" /> {t("gradebook.saving")}
            </span>
          )}
          {saving === "saved" && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-1 text-success">
              <Cloud className="size-3.5" /> {t("gradebook.saved")}
            </motion.span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
        <table ref={grid} className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky start-0 z-10 bg-surface px-3 py-2 text-start text-xs font-semibold text-muted">{t("reportCards.student")}</th>
              {cols.map((a) => {
                const future = a.date > p.now;
                return (
                  <th key={a.id} className="min-w-28 border-s border-line px-2 py-2 text-start align-bottom">
                    <button type="button" disabled={!p.canEdit} onClick={() => setEditing(a)} className={cn("w-full text-start", p.canEdit && "hover:text-accent")}>
                      <span className="block truncate text-xs font-semibold">{pick(locale, a.name, a.nameAr)}</span>
                      <span className="block text-[0.7rem] font-normal text-subtle">
                        {fmt.date(a.date, "short")} · /{a.maxScore} · {a.weight}%
                      </span>
                      {future && <span className="block text-[0.65rem] font-normal text-info">{t("gradebook.upcoming")}</span>}
                    </button>
                  </th>
                );
              })}
              <th className="min-w-24 border-s border-line bg-sunken/60 px-3 py-2 text-end text-xs font-semibold">{t("exams.termAvg")}</th>
            </tr>
          </thead>
          <tbody>
            {p.students.map((st, r) => {
              const pct = term.get(st.id) ?? null;
              const band = bandFor(p.scale, pct);
              return (
                <tr key={st.id} className="border-b border-line last:border-0">
                  <th scope="row" className="sticky start-0 z-10 max-w-56 truncate bg-surface px-3 py-1.5 text-start text-sm font-medium">
                    {st.name}
                  </th>
                  {cols.map((a, c) => {
                    const k = key(a.id, st.id);
                    const v = values[k] ?? "";
                    const bad = invalid.has(k) || parseMark(v, a.maxScore) === "invalid";
                    return (
                      <td key={a.id} className="border-s border-line p-0">
                        <input
                          data-r={r}
                          data-c={c}
                          value={v}
                          readOnly={!p.canEdit}
                          inputMode="decimal"
                          aria-label={`${st.name} · ${a.name}`}
                          title={bad ? t("gradebook.invalid", { max: a.maxScore }) : undefined}
                          onChange={(e) => setCell(k, e.target.value)}
                          onKeyDown={(e) => onKey(e, r, c)}
                          onPaste={(e) => onPaste(e, r, c)}
                          onFocus={(e) => e.target.select()}
                          className={cn(
                            "h-9 w-full bg-transparent px-2 text-center tabular outline-none transition focus:bg-accent-soft/60 focus:ring-2 focus:ring-inset focus:ring-accent",
                            v === "a" && "text-muted italic",
                            bad && "bg-[color-mix(in_oklch,var(--danger)_12%,var(--surface))] text-danger",
                            dirty.has(k) && "font-semibold",
                          )}
                        />
                      </td>
                    );
                  })}
                  <td className="border-s border-line bg-sunken/40 px-3 py-1.5 text-end tabular">
                    {pct != null ? (
                      <span className={cn("font-semibold", pct < p.passMark && "text-danger")}>
                        {fmt.number(pct)}% <Badge tone={band?.letter === "F" ? "danger" : band?.letter === "A" ? "success" : "neutral"}>{band?.letter}</Badge>
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!p.students.length && (
              <tr>
                <td colSpan={cols.length + 2} className="px-3 py-8 text-center text-muted">
                  {t("gradebook.noStudents")}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            {(["mean", "high", "low"] as const).map((row) => (
              <tr key={row} className="border-t border-line bg-sunken/50 text-xs">
                <th scope="row" className="sticky start-0 bg-sunken px-3 py-1.5 text-start font-medium text-muted">
                  {t(`gradebook.${row}`)}
                </th>
                {cols.map((a) => {
                  const vals = parsedMarks.filter((m) => m.assessmentId === a.id && m.score != null).map((m) => m.score! / 100);
                  const st = stats(vals);
                  const v = row === "mean" ? st.mean : row === "high" ? st.max : st.min;
                  const missing = p.students.length - parsedMarks.filter((m) => m.assessmentId === a.id).length;
                  return (
                    <td key={a.id} className="border-s border-line px-2 py-1.5 text-center tabular">
                      {v != null ? fmt.number(v) : "—"}
                      {row === "mean" && missing > 0 && vals.length > 0 && <span className="block text-[0.65rem] text-warning">{t("gradebook.missing", { count: missing })}</span>}
                    </td>
                  );
                })}
                <td className="border-s border-line px-3 py-1.5 text-end font-semibold tabular">{(row === "mean" ? termStats.mean : row === "high" ? termStats.max : termStats.min) != null ? `${fmt.number((row === "mean" ? termStats.mean : row === "high" ? termStats.max : termStats.min)!)}%` : "—"}</td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      {termStats.count > 0 && (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <p className="mb-3 text-sm font-semibold">{t("gradebook.distribution")}</p>
          <div className="flex h-28 items-end gap-3">
            {[...bands].reverse().map((b, i) => (
              <div key={b.letter} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular text-muted">{b.count}</span>
                <motion.div className={cn("w-full max-w-14 rounded-t-lg", b.letter === "F" ? "bg-danger" : "bg-accent")} initial={{ height: 0 }} animate={{ height: `${(b.count / maxBand) * 80}px` }} transition={{ duration: 0.6, delay: i * 0.05 }} />
                <span className="text-xs font-semibold">{b.letter}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {p.canEdit && <AssessmentModal slug={p.slug} editing={editing} onClose={() => setEditing(null)} sectionId={p.section.id} subjectId={p.subject.id} termId={p.termId} onSaved={() => router.refresh()} />}
    </div>
  );
}

function AssessmentModal({ slug, editing, onClose, sectionId, subjectId, termId, onSaved }: { slug: string; editing: Assessment | "new" | null; onClose: () => void; sectionId: string; subjectId: string; termId: string; onSaved: () => void }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());
  const blank = (): AssessmentInput =>
    editing && editing !== "new"
      ? { sectionId, subjectId, termId, name: editing.name, nameAr: editing.nameAr ?? "", kind: editing.kind, date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date(editing.date)), maxScore: editing.maxScore, weight: editing.weight }
      : { sectionId, subjectId, termId, name: "", nameAr: "", kind: "quiz", date: today, maxScore: 20, weight: 10 };
  const [form, setForm] = useState<AssessmentInput>(blank);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [was, setWas] = useState<typeof editing>(null);
  if (editing !== was) {
    setWas(editing);
    setForm(blank());
    setConfirmDelete(false);
  }
  const submit = () =>
    start(async () => {
      const res = await saveAssessment(slug, editing && editing !== "new" ? editing.id : null, form);
      if (!res.ok) return void toast.error(t(res.error as MessageKey, { max: form.maxScore }));
      toast.success(t("common.saved"));
      onClose();
      onSaved();
    });
  const remove = () =>
    start(async () => {
      if (!editing || editing === "new") return;
      const res = await deleteAssessment(slug, editing.id);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      onClose();
      onSaved();
    });
  return (
    <Modal
      open={!!editing}
      onOpenChange={(o) => !o && onClose()}
      title={editing === "new" ? t("gradebook.addAssessment") : t("gradebook.editAssessment")}
      footer={
        <>
          {editing && editing !== "new" && (
            <Button variant="ghost" className="me-auto text-danger" onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))} disabled={pending}>
              <Trash2 className="size-4" /> {confirmDelete ? t("gradebook.deleteBody") : t("gradebook.delete")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || form.name.trim().length < 2}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("gradebook.name")} htmlFor="as-name">
            <Input id="as-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label={t("students.nameAr")} htmlFor="as-name-ar">
            <Input id="as-name-ar" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t("gradebook.kind")} htmlFor="as-kind">
            <select id="as-kind" className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AssessmentInput["kind"] })}>
              {(["exam", "quiz", "assignment", "project"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`exams.kind_${k}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("gradebook.date")} htmlFor="as-date">
            <Input id="as-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label={t("gradebook.maxScore")} htmlFor="as-max">
            <Input id="as-max" inputMode="numeric" value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
          <Field label={t("gradebook.weight")} htmlFor="as-weight">
            <Input id="as-weight" inputMode="numeric" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
        </div>
        <p className="text-xs text-muted">{t("gradebook.weightHint")}</p>
      </div>
    </Modal>
  );
}
