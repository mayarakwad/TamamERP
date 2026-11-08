"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Search, Star, Trash2, UserPlus, Users } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, inputClass } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import { NATIONALITIES, RELATIONS } from "@/lib/school/settings";
import { findGuardians, saveStudent, type GuardianInput, type StudentInput } from "@/app/actions/school";

export interface ClassOpt {
  id: string;
  label: string;
  campusId: string;
  campus: string;
  level: number;
  grade: string;
  count: number;
  capacity: number;
}

export interface StopOpt {
  id: string;
  label: string;
  route: string;
  campusId: string;
}

export interface StudentData {
  id: string;
  name: string;
  nameAr: string | null;
  gender: string;
  dob: string;
  nationality: string | null;
  qid: string | null;
  qidExpiry: string | null;
  passportNumber: string | null;
  sectionId: string | null;
  joinedOn: string;
  bloodGroup: string | null;
  medical: string | null;
  busStopId: string | null;
  discountKind: string | null;
  discountPct: number;
  previousSchool: string | null;
  notes: string | null;
  guardians: { id: string; name: string; relation: string; primary: boolean }[];
}

type GuardianRow = { key: string; id?: string; name: string; relation: (typeof RELATIONS)[number]; primary: boolean; details?: GuardianInput };

const ymdToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());
const BLOOD = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export function StudentSheet({ slug, open, onOpenChange, initial, classes, stops }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; initial?: StudentData; classes: ClassOpt[]; stops: StopOpt[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const blank = () => ({
    name: initial?.name ?? "",
    nameAr: initial?.nameAr ?? "",
    gender: (initial?.gender as "m" | "f") ?? "m",
    dob: initial?.dob.slice(0, 10) ?? "",
    nationality: initial?.nationality ?? "QA",
    qid: initial?.qid ?? "",
    qidExpiry: initial?.qidExpiry?.slice(0, 10) ?? "",
    passportNumber: initial?.passportNumber ?? "",
    sectionId: initial?.sectionId ?? "",
    joinedOn: initial?.joinedOn.slice(0, 10) ?? ymdToday(),
    bloodGroup: initial?.bloodGroup ?? "",
    medical: initial?.medical ?? "",
    busStopId: initial?.busStopId ?? "",
    discountKind: (initial?.discountKind as "" | "staff" | "scholarship") ?? "",
    discountPct: (initial?.discountPct ?? 0) / 100,
    previousSchool: initial?.previousSchool ?? "",
    notes: initial?.notes ?? "",
  });
  const [form, setForm] = useState(blank);
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(blank());
      setGuardians((initial?.guardians ?? []).map((g) => ({ key: g.id, id: g.id, name: g.name, relation: g.relation as GuardianRow["relation"], primary: g.primary })));
      setErrors({});
    }
  }
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cls = classes.find((c) => c.id === form.sectionId);
  const campusStops = stops.filter((s) => !cls || s.campusId === cls.campusId);
  const routes = [...new Set(campusStops.map((s) => s.route))];
  const campuses = [...new Set(classes.map((c) => c.campus))];

  const submit = () =>
    start(async () => {
      const input: StudentInput = {
        ...form,
        discountPct: Math.round(Number(form.discountPct) * 100),
        guardians: guardians.map((g) => ({ id: g.id, relation: g.relation, primary: g.primary, details: g.details })),
      };
      const res = await saveStudent(slug, initial?.id ?? null, input);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey, { capacity: cls?.capacity ?? 0 }) });
        toast.error(t(res.error as MessageKey, { capacity: cls?.capacity ?? 0 }));
        return;
      }
      toast.success(t("students.saved"));
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={initial ? t("students.edit") : t("students.new")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("students.colName")} error={errors.name} htmlFor="st-name">
          <Input id="st-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} autoFocus={!initial} />
        </Field>
        <Field label={t("students.nameAr")} htmlFor="st-name-ar">
          <Input id="st-name-ar" dir="rtl" value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("students.gender")}</p>
            <Segmented label={t("students.gender")} value={form.gender} onChange={(v) => set("gender", v)} options={[{ value: "m", label: t("school.gender_m") }, { value: "f", label: t("school.gender_f") }]} />
          </div>
          <Field label={t("students.dob")} error={errors.dob} htmlFor="st-dob">
            <Input id="st-dob" type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} aria-invalid={!!errors.dob} />
          </Field>
        </div>
        <Field label={t("school.section")} error={errors.sectionId} htmlFor="st-class">
          <select id="st-class" className={inputClass} value={form.sectionId} onChange={(e) => set("sectionId", e.target.value)} aria-invalid={!!errors.sectionId}>
            <option value="">—</option>
            {campuses.map((campus) => (
              <optgroup key={campus} label={campus}>
                {classes
                  .filter((c) => c.campus === campus)
                  .map((c) => (
                    <option key={c.id} value={c.id} disabled={c.count >= c.capacity && c.id !== initial?.sectionId}>
                      {c.label} · {t("school.capacity", { count: c.count, capacity: c.capacity })}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("students.nationality")} htmlFor="st-nat">
            <select id="st-nat" className={inputClass} value={form.nationality} onChange={(e) => set("nationality", e.target.value)}>
              {NATIONALITIES.map((c) => (
                <option key={c} value={c}>
                  {regions.of(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("students.joinedOn")} htmlFor="st-joined">
            <Input id="st-joined" type="date" value={form.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("students.qid")} htmlFor="st-qid">
            <Input id="st-qid" dir="ltr" inputMode="numeric" value={form.qid} onChange={(e) => set("qid", e.target.value.replace(/\D/g, "").slice(0, 11))} />
          </Field>
          <Field label={t("students.qidExpiry")} htmlFor="st-qid-exp">
            <Input id="st-qid-exp" type="date" value={form.qidExpiry} onChange={(e) => set("qidExpiry", e.target.value)} />
          </Field>
          <Field label={t("students.passport")} htmlFor="st-pp">
            <Input id="st-pp" dir="ltr" value={form.passportNumber} onChange={(e) => set("passportNumber", e.target.value.toUpperCase())} />
          </Field>
        </div>

        <GuardianEditor slug={slug} rows={guardians} onChange={setGuardians} error={errors.guardians} />

        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label={t("students.bloodGroup")} htmlFor="st-blood">
            <select id="st-blood" className={inputClass} value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
              <option value="">—</option>
              {BLOOD.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label={t("students.busStop")} htmlFor="st-bus">
            <select id="st-bus" className={inputClass} value={form.busStopId} onChange={(e) => set("busStopId", e.target.value)}>
              <option value="">{t("students.noBus")}</option>
              {routes.map((r) => (
                <optgroup key={r} label={r}>
                  {campusStops
                    .filter((s) => s.route === r)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("students.medical")} hint={t("students.medicalHint")} htmlFor="st-medical">
          <Textarea id="st-medical" rows={2} value={form.medical} onChange={(e) => set("medical", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label={t("students.discount")} htmlFor="st-disc">
            <select id="st-disc" className={inputClass} value={form.discountKind} onChange={(e) => set("discountKind", e.target.value as typeof form.discountKind)}>
              <option value="">{t("students.discountNone")}</option>
              <option value="staff">{t("students.discountStaff")}</option>
              <option value="scholarship">{t("students.discountScholarship")}</option>
            </select>
          </Field>
          {form.discountKind === "scholarship" && (
            <Field label={t("students.discountPct")} htmlFor="st-disc-pct">
              <Input id="st-disc-pct" inputMode="decimal" value={form.discountPct} onChange={(e) => set("discountPct", Number(e.target.value.replace(/[^\d.]/g, "")))} />
            </Field>
          )}
        </div>
        <Field label={t("students.previousSchool")} htmlFor="st-prev">
          <Input id="st-prev" value={form.previousSchool} onChange={(e) => set("previousSchool", e.target.value)} />
        </Field>
        <Field label={t("students.notes")} htmlFor="st-notes">
          <Textarea id="st-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

/** Parents of the student: link an existing family (siblings) or add new parents. */
function GuardianEditor({ slug, rows, onChange, error }: { slug: string; rows: GuardianRow[]; onChange: (rows: GuardianRow[]) => void; error?: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"existing" | "new" | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof findGuardians>>>([]);
  const [draft, setDraft] = useState<GuardianInput & { relation: GuardianRow["relation"] }>({ name: "", nameAr: "", phone: "", email: "", relation: "father" });

  useEffect(() => {
    if (mode !== "existing" || q.trim().length < 2) return;
    const id = setTimeout(() => findGuardians(slug, q).then(setHits), 250);
    return () => clearTimeout(id);
  }, [q, mode, slug]);

  const add = (row: GuardianRow) => {
    const next = [...rows, { ...row, primary: rows.length === 0 }];
    onChange(next);
    setMode(null);
    setQ("");
    setHits([]);
  };

  return (
    <div className={cn("rounded-2xl border p-3", error ? "border-danger" : "border-line")}>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Users className="size-4 text-muted" /> {t("students.guardiansTitle")}
      </p>
      <ul className="space-y-1.5">
        {rows.map((g, i) => (
          <li key={g.key} className="flex items-center gap-2 rounded-xl bg-sunken px-2.5 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{g.name || g.details?.name}</span>
            <select aria-label={t("students.guardiansTitle")} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs" value={g.relation} onChange={(e) => onChange(rows.map((x, k) => (k === i ? { ...x, relation: e.target.value as GuardianRow["relation"] } : x)))}>
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {t(`school.relation_${r}` as MessageKey)}
                </option>
              ))}
            </select>
            <button
              type="button"
              title={t("students.makePrimary")}
              aria-pressed={g.primary}
              onClick={() => onChange(rows.map((x, k) => ({ ...x, primary: k === i })))}
              className={cn("inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs", g.primary ? "bg-accent-soft text-accent" : "text-subtle hover:bg-surface")}
            >
              <Star className={cn("size-3.5", g.primary && "fill-current")} /> {t("students.primary")}
            </button>
            <button type="button" aria-label={t("common.delete")} onClick={() => onChange(rows.filter((_, k) => k !== i))} className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-surface hover:text-danger">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {mode === null && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMode("existing")}>
            <Search className="size-4" /> {t("students.existingGuardian")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("new")}>
            <UserPlus className="size-4" /> {t("students.newGuardian")}
          </Button>
        </div>
      )}
      {mode === "existing" && (
        <div className="mt-2 space-y-1.5">
          <Input autoFocus placeholder={t("students.pickGuardian")} value={q} onChange={(e) => setQ(e.target.value)} />
          {hits
            .filter((h) => !rows.some((r) => r.id === h.id))
            .map((h) => (
              <button key={h.id} type="button" onClick={() => add({ key: h.id, id: h.id, name: h.name, relation: "father", primary: false })} className="flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-start text-sm hover:border-accent-line">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {h.phone} · {h.children.join(", ")}
                  </span>
                </span>
                <Plus className="size-4 text-muted" />
              </button>
            ))}
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            {t("common.cancel")}
          </Button>
        </div>
      )}
      {mode === "new" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Input placeholder={t("guardians.colName")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
          <Input placeholder={t("students.nameAr")} dir="rtl" value={draft.nameAr} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} />
          <Input placeholder={t("guardians.colPhone")} dir="ltr" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <Input placeholder={t("guardians.colEmail")} dir="ltr" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <select aria-label={t("students.guardiansTitle")} className={inputClass} value={draft.relation} onChange={(e) => setDraft({ ...draft, relation: e.target.value as GuardianRow["relation"] })}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {t(`school.relation_${r}` as MessageKey)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={draft.name.trim().length < 2 || draft.phone.trim().length < 5}
              onClick={() => {
                const { relation, ...details } = draft;
                add({ key: `new-${Date.now()}`, name: draft.name, relation, primary: false, details });
                setDraft({ name: "", nameAr: "", phone: "", email: "", relation: "mother" });
              }}
            >
              <Plus className="size-4" /> {t("students.addGuardian")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
