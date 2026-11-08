"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, GraduationCap, Loader2 } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Field, Input, inputClass } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { QuickToggles } from "@/components/appearance/quick-toggles";
import { celebrate } from "@/components/motion/celebrate";
import type { MessageKey } from "@/lib/i18n";
import { RELATIONS } from "@/lib/school/settings";
import { submitPublicApplication, type PublicApplicationInput } from "@/app/actions/admissions";

export function ApplyForm(p: {
  slug: string;
  open: boolean;
  school: string;
  logo: string | null;
  color: string | null;
  appName: string;
  years: { id: string; name: string; current: boolean }[];
  campuses: { id: string; name: string }[];
  grades: { id: string; name: string }[];
  nationalities: { code: string; name: string }[];
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const blank = (): PublicApplicationInput => ({
    yearId: p.years.find((y) => !y.current)?.id ?? p.years[0]?.id ?? "",
    campusId: p.campuses[0]?.id ?? "",
    gradeId: "",
    childName: "",
    childNameAr: "",
    gender: "m",
    dob: "",
    nationality: "QA",
    previousSchool: "",
    guardianName: "",
    guardianNameAr: "",
    guardianRelation: "father",
    guardianPhone: "",
    guardianEmail: "",
    website: "",
    consent: false as unknown as true,
  });
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ number: string; phone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof PublicApplicationInput>(k: K, v: PublicApplicationInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const res = await submitPublicApplication(p.slug, form);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
        else setErrors({});
        setError(t(res.error as MessageKey));
        return;
      }
      celebrate(reduced);
      setDone({ number: res.number, phone: form.guardianPhone });
    });
  };

  const field = (k: keyof PublicApplicationInput, label: string, props: React.ComponentProps<"input"> = {}) => (
    <Field label={label} htmlFor={`pa-${k}`} error={errors[k]}>
      <Input id={`pa-${k}`} value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} aria-invalid={!!errors[k]} {...props} />
    </Field>
  );

  return (
    <div className="min-h-dvh bg-bg">
      <div className="h-1.5" style={{ background: p.color ?? "var(--accent)" }} />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {p.logo ? <img src={p.logo} alt="" className="size-12 rounded-xl object-contain" /> : <span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><GraduationCap className="size-6" /></span>}
            <p className="font-semibold">{p.school}</p>
          </div>
          <QuickToggles />
        </header>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-16 text-center">
              <CheckCircle2 className="mx-auto size-14 text-success" />
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t("apply.thanksTitle")}</h1>
              <p className="mx-auto mt-3 max-w-md text-muted">{t("apply.thanksBody", { number: done.number, phone: done.phone })}</p>
              <Button className="mt-8" variant="secondary" onClick={() => (setForm(blank()), setDone(null))}>
                {t("apply.another")}
              </Button>
            </motion.div>
          ) : !p.open ? (
            <motion.p key="closed" className="mt-16 text-center text-muted">
              {t("apply.closed")}
            </motion.p>
          ) : (
            <motion.form key="form" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-10 space-y-8" noValidate>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{t("apply.title", { school: p.school })}</h1>
                <p className="mt-2 text-muted">{t("apply.subtitle")}</p>
              </div>

              <section className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold">{t("apply.schoolTitle")}</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t("apply.year")} htmlFor="pa-year">
                    <select id="pa-year" className={inputClass} value={form.yearId} onChange={(e) => set("yearId", e.target.value)}>
                      {p.years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("apply.campus")} htmlFor="pa-campus">
                    <select id="pa-campus" className={inputClass} value={form.campusId} onChange={(e) => set("campusId", e.target.value)}>
                      {p.campuses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("apply.grade")} htmlFor="pa-grade" error={errors.gradeId}>
                    <select id="pa-grade" className={inputClass} value={form.gradeId} onChange={(e) => set("gradeId", e.target.value)} aria-invalid={!!errors.gradeId}>
                      <option value="">—</option>
                      {p.grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>

              <section className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold">{t("apply.childTitle")}</h2>
                {field("childName", t("admissions.childName"), { autoComplete: "off" })}
                {field("childNameAr", t("students.nameAr"), { dir: "rtl" })}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">{t("students.gender")}</p>
                    <Segmented label={t("students.gender")} value={form.gender} onChange={(v) => set("gender", v)} options={[{ value: "m", label: t("school.gender_m") }, { value: "f", label: t("school.gender_f") }]} />
                  </div>
                  {field("dob", t("students.dob"), { type: "date" })}
                  <Field label={t("students.nationality")} htmlFor="pa-nat">
                    <select id="pa-nat" className={inputClass} value={form.nationality} onChange={(e) => set("nationality", e.target.value)}>
                      {p.nationalities.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {field("previousSchool", t("apply.previousSchool"))}
              </section>

              <section className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
                <h2 className="font-semibold">{t("apply.guardianTitle")}</h2>
                <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                  {field("guardianName", t("admissions.guardianName"), { autoComplete: "name" })}
                  <Field label={t("admissions.relation")} htmlFor="pa-rel">
                    <select id="pa-rel" className={inputClass} value={form.guardianRelation} onChange={(e) => set("guardianRelation", e.target.value as PublicApplicationInput["guardianRelation"])}>
                      {RELATIONS.map((r) => (
                        <option key={r} value={r}>
                          {t(`school.relation_${r}` as MessageKey)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("guardianPhone", t("guardians.colPhone"), { dir: "ltr", inputMode: "tel", autoComplete: "tel", placeholder: "+974 5555 1234" })}
                  {field("guardianEmail", t("guardians.colEmail"), { dir: "ltr", type: "email", autoComplete: "email" })}
                </div>
                {/* Bots fill every field; people never see this one. */}
                <input tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" value={form.website} onChange={(e) => set("website", e.target.value)} />
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={!!form.consent} onChange={(e) => set("consent", e.target.checked as true)} />
                  <span className={errors.consent ? "text-danger" : "text-muted"}>{t("apply.consent")}</span>
                </label>
              </section>

              {error && <p role="alert" className="rounded-xl bg-[color-mix(in_oklch,var(--danger)_10%,var(--surface))] px-3.5 py-2.5 text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                {pending ? <><Loader2 className="size-4 animate-spin" /> {t("apply.sending")}</> : t("apply.submit")}
              </Button>
              <p className="text-center text-xs text-subtle">{t("apply.poweredBy", { app: p.appName })}</p>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
