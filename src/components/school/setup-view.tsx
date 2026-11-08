"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { BookOpen, CalendarRange, Clock, Copy, GraduationCap, Loader2, PartyPopper, Plus, Receipt, Trash2, Wand2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { pick, type MessageKey } from "@/lib/i18n";
import type { SchoolSettings } from "@/lib/school/settings";
import { saveSchoolSetup, saveSubject, type SchoolSettingsInput } from "@/app/actions/school";

interface Subject {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  color: string;
  classes: number;
}

const cellInput = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-accent-line";

export function SchoolSetupView({
  slug,
  yearName,
  terms: initialTerms,
  subjects,
  settings,
  canEdit,
}: {
  slug: string;
  yearName: string;
  terms: { id: string; name: string; nameAr: string | null; start: string; end: string }[];
  subjects: Subject[];
  settings: SchoolSettings;
  canEdit: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [terms, setTerms] = useState(initialTerms);
  const [form, setForm] = useState({
    periods: settings.periods,
    rollBy: settings.rollBy,
    installments: settings.installments,
    sibling: settings.sibling.map((b) => b / 100),
    staffDiscount: settings.staffDiscount / 100,
    scale: settings.scale,
    passMark: settings.passMark,
    loanDays: settings.loanDays,
    admissionsOpen: settings.admissionsOpen,
    feeTerms: settings.feeTerms ?? "",
  });
  const [subject, setSubject] = useState<Subject | "new" | null>(null);
  const share = form.installments.reduce((s, i) => s + (Number(i.pct) || 0), 0);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const publicPath = `/apply/${slug}`;

  const save = () =>
    start(async () => {
      const input: SchoolSettingsInput = {
        ...form,
        sibling: form.sibling.map((p) => Math.round(Number(p) * 100)),
        staffDiscount: Math.round(Number(form.staffDiscount) * 100),
        installments: form.installments.map((i) => ({ ...i, pct: Number(i.pct) })),
        scale: form.scale.map((b) => ({ ...b, min: Number(b.min) })),
        passMark: Number(form.passMark),
        loanDays: Number(form.loanDays),
        terms: terms.map((x) => ({ id: x.id, start: x.start, end: x.end })),
      };
      const res = await saveSchoolSetup(slug, input);
      if (!res.ok) return void toast.error(t(res.error as MessageKey, { pct: share }));
      toast.success(t("schoolSetup.saved"));
      router.refresh();
    });

  return (
    <div className="pb-24">
      <PageHeader title={t("schoolSetup.title")} subtitle={t("schoolSetup.subtitle")} />
      <div className="grid gap-[var(--gap)] lg:grid-cols-2">
        <Card>
          <CardHeader title={`${t("schoolSetup.yearTitle")} · ${yearName}`} icon={<CalendarRange className="size-4" />} />
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">{t("schoolSetup.yearBody")}</p>
            {terms.map((term, i) => (
              <div key={term.id} className="grid grid-cols-[6rem_1fr_1fr] items-end gap-2">
                <p className="pb-2 text-sm font-medium">{pick(locale, term.name, term.nameAr)}</p>
                <Field label={t("schoolSetup.starts")} htmlFor={`t-s-${i}`}>
                  <Input id={`t-s-${i}`} type="date" value={term.start} disabled={!canEdit} onChange={(e) => setTerms(terms.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)))} />
                </Field>
                <Field label={t("schoolSetup.ends")} htmlFor={`t-e-${i}`}>
                  <Input id={`t-e-${i}`} type="date" value={term.end} disabled={!canEdit} onChange={(e) => setTerms(terms.map((x, k) => (k === i ? { ...x, end: e.target.value } : x)))} />
                </Field>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("schoolSetup.subjectsTitle")}
            icon={<BookOpen className="size-4" />}
            action={
              <Button size="sm" variant="secondary" onClick={() => setSubject("new")}>
                <Plus className="size-4" /> {t("schoolSetup.addSubject")}
              </Button>
            }
          />
          <CardBody>
            <p className="mb-3 text-sm text-muted">{t("schoolSetup.subjectsBody")}</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {subjects.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setSubject(s)} className="flex w-full items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-start text-sm transition hover:border-accent-line">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate">{pick(locale, s.name, s.nameAr)}</span>
                    <span className="font-mono text-xs text-subtle">{s.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("schoolSetup.dayTitle")} icon={<Clock className="size-4" />} />
          <CardBody className="space-y-2">
            <p className="mb-1 text-sm text-muted">{t("schoolSetup.dayBody")}</p>
            {form.periods.map((p, i) => (
              <div key={i} className="grid grid-cols-[6rem_1fr_1fr_2.25rem] items-center gap-2">
                <span className="text-sm text-muted">{t("schoolSetup.period", { n: i + 1 })}</span>
                <input type="time" aria-label={`${t("schoolSetup.period", { n: i + 1 })} ${t("schoolSetup.starts")}`} className={cellInput} value={p.start} disabled={!canEdit} onChange={(e) => set("periods", form.periods.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)))} />
                <input type="time" aria-label={`${t("schoolSetup.period", { n: i + 1 })} ${t("schoolSetup.ends")}`} className={cellInput} value={p.end} disabled={!canEdit} onChange={(e) => set("periods", form.periods.map((x, k) => (k === i ? { ...x, end: e.target.value } : x)))} />
                <button type="button" aria-label={t("common.delete")} disabled={!canEdit || form.periods.length <= 1} onClick={() => set("periods", form.periods.filter((_, k) => k !== i))} className="grid size-9 place-items-center rounded-lg text-subtle hover:bg-sunken hover:text-danger disabled:opacity-30">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
              <Button size="sm" variant="ghost" disabled={!canEdit || form.periods.length >= 12} onClick={() => set("periods", [...form.periods, { start: form.periods.at(-1)?.end ?? "08:00", end: form.periods.at(-1)?.end ?? "08:45" }])}>
                <Plus className="size-4" /> {t("schoolSetup.addPeriod")}
              </Button>
              <Field label={t("schoolSetup.rollBy")} htmlFor="roll-by" className="w-40">
                <Input id="roll-by" type="time" value={form.rollBy} disabled={!canEdit} onChange={(e) => set("rollBy", e.target.value)} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("schoolSetup.gradingTitle")} icon={<GraduationCap className="size-4" />} />
          <CardBody className="space-y-2">
            <p className="mb-1 text-sm text-muted">{t("schoolSetup.gradingBody")}</p>
            {form.scale.map((b, i) => (
              <div key={i} className="grid grid-cols-[3.5rem_5rem_1fr_1fr] items-center gap-2">
                <input aria-label="Letter" className={`${cellInput} text-center font-semibold`} value={b.letter} disabled={!canEdit} onChange={(e) => set("scale", form.scale.map((x, k) => (k === i ? { ...x, letter: e.target.value } : x)))} />
                <div className="relative">
                  <input aria-label={t("schoolSetup.from", { pct: b.min })} inputMode="numeric" className={`${cellInput} pe-6`} value={b.min} disabled={!canEdit} onChange={(e) => set("scale", form.scale.map((x, k) => (k === i ? { ...x, min: Number(e.target.value.replace(/\D/g, "")) } : x)))} />
                  <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-subtle">%</span>
                </div>
                <input aria-label={t("schoolSetup.name")} className={cellInput} value={b.label} disabled={!canEdit} onChange={(e) => set("scale", form.scale.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                <input aria-label={t("schoolSetup.nameAr")} dir="rtl" className={cellInput} value={b.labelAr} disabled={!canEdit} onChange={(e) => set("scale", form.scale.map((x, k) => (k === i ? { ...x, labelAr: e.target.value } : x)))} />
              </div>
            ))}
            <Field label={t("schoolSetup.passMark")} htmlFor="pass" className="w-40 pt-2">
              <Input id="pass" inputMode="numeric" value={form.passMark} disabled={!canEdit} onChange={(e) => set("passMark", Number(e.target.value.replace(/\D/g, "")))} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("schoolSetup.feesTitle")} icon={<Receipt className="size-4" />} />
          <CardBody className="space-y-2">
            <p className="mb-1 text-sm text-muted">{t("schoolSetup.feesBody")}</p>
            <div className="grid grid-cols-[1fr_1fr_6rem_5rem] gap-2 text-xs text-muted">
              <span>{t("schoolSetup.installment")}</span>
              <span />
              <span>{t("schoolSetup.due")}</span>
              <span>{t("schoolSetup.share")}</span>
            </div>
            {form.installments.map((ins, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_6rem_5rem] gap-2">
                <input aria-label={t("schoolSetup.installment")} className={cellInput} value={ins.label} disabled={!canEdit} onChange={(e) => set("installments", form.installments.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                <input aria-label={t("schoolSetup.nameAr")} dir="rtl" className={cellInput} value={ins.labelAr} disabled={!canEdit} onChange={(e) => set("installments", form.installments.map((x, k) => (k === i ? { ...x, labelAr: e.target.value } : x)))} />
                <input aria-label={t("schoolSetup.due")} dir="ltr" className={cellInput} value={ins.due} disabled={!canEdit} onChange={(e) => set("installments", form.installments.map((x, k) => (k === i ? { ...x, due: e.target.value } : x)))} />
                <div className="relative">
                  <input aria-label={t("schoolSetup.share")} inputMode="numeric" className={`${cellInput} pe-6`} value={ins.pct} disabled={!canEdit} onChange={(e) => set("installments", form.installments.map((x, k) => (k === i ? { ...x, pct: Number(e.target.value.replace(/\D/g, "")) } : x)))} />
                  <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-subtle">%</span>
                </div>
              </div>
            ))}
            {share !== 100 && <p className="text-xs text-danger">{t("schoolSetup.shareTotal", { pct: share })}</p>}
            <p className="pt-3 text-sm font-medium">{t("schoolSetup.siblingTitle")}</p>
            <div className="grid grid-cols-5 gap-2">
              {form.sibling.map((p, i) => (
                <Field key={i} label={i === 0 ? t("schoolSetup.childFirst") : t("schoolSetup.childN", { n: i + 1 })} htmlFor={`sib-${i}`}>
                  <div className="relative">
                    <Input id={`sib-${i}`} inputMode="decimal" className="pe-6" value={p} disabled={!canEdit} onChange={(e) => set("sibling", form.sibling.map((x, k) => (k === i ? Number(e.target.value.replace(/[^\d.]/g, "")) : x)))} />
                    <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-subtle">%</span>
                  </div>
                </Field>
              ))}
              <Field label={t("schoolSetup.staffDiscount")} htmlFor="staff-disc">
                <div className="relative">
                  <Input id="staff-disc" inputMode="decimal" className="pe-6" value={form.staffDiscount} disabled={!canEdit} onChange={(e) => set("staffDiscount", Number(e.target.value.replace(/[^\d.]/g, "")))} />
                  <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-subtle">%</span>
                </div>
              </Field>
            </div>
          </CardBody>
        </Card>

        {canEdit && (
          <Card className="lg:col-span-2">
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-2xl">
                <p className="flex items-center gap-2 font-semibold">
                  <PartyPopper className="size-4 text-accent" /> {t("rollover.card")}
                </p>
                <p className="mt-1 text-sm text-muted">{t("rollover.cardBody")}</p>
              </div>
              <Link href={`/w/${slug}/settings/school/new-year`} className={buttonClass("secondary")}>
                {t("rollover.open")}
              </Link>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title={t("schoolSetup.admissionsTitle")} icon={<Wand2 className="size-4" />} />
          <CardBody className="space-y-4">
            <Switch checked={form.admissionsOpen} onChange={(v) => canEdit && set("admissionsOpen", v)} label={t("schoolSetup.admissionsOpen")} />
            {form.admissionsOpen && (
              <div className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-sm">
                <span className="text-muted">{t("schoolSetup.publicLink")}:</span>
                <a href={`/apply/${slug}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-xs text-accent hover:underline" dir="ltr">
                  {publicPath}
                </a>
                <button type="button" aria-label={t("common.copy")} className="grid size-8 place-items-center rounded-lg hover:bg-surface" onClick={() => navigator.clipboard.writeText(window.location.origin + publicPath).then(() => toast.success(t("common.copied")))}>
                  <Copy className="size-4" />
                </button>
              </div>
            )}
            <Field label={t("schoolSetup.loanDays")} htmlFor="loan-days" className="w-40">
              <Input id="loan-days" inputMode="numeric" value={form.loanDays} disabled={!canEdit} onChange={(e) => set("loanDays", Number(e.target.value.replace(/\D/g, "")))} />
            </Field>
          </CardBody>
        </Card>
      </div>

      {canEdit && (
        <div className="no-print sticky bottom-4 z-20 mt-6 flex justify-end">
          <div className="rounded-2xl border border-line bg-glass p-2 shadow-lift backdrop-blur-xl">
            <Button onClick={save} disabled={pending || share !== 100}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}

      <SubjectModal slug={slug} subject={subject} onClose={() => setSubject(null)} />
    </div>
  );
}

function SubjectModal({ slug, subject, onClose }: { slug: string; subject: Subject | "new" | null; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = subject && subject !== "new" ? subject : null;
  const [form, setForm] = useState({ code: "", name: "", nameAr: "", color: "#4B3FA8" });
  const [error, setError] = useState<{ field?: string; msg: string } | null>(null);
  const [was, setWas] = useState<typeof subject>(null);
  if (subject !== was) {
    setWas(subject);
    setForm(initial ? { code: initial.code, name: initial.name, nameAr: initial.nameAr ?? "", color: initial.color } : { code: "", name: "", nameAr: "", color: "#4B3FA8" });
    setError(null);
  }
  const submit = () =>
    start(async () => {
      const res = await saveSubject(slug, initial?.id ?? null, form);
      if (!res.ok) return setError({ field: res.field, msg: t(res.error as MessageKey) });
      toast.success(t("common.saved"));
      onClose();
      router.refresh();
    });
  return (
    <Modal
      open={!!subject}
      onOpenChange={(o) => !o && onClose()}
      title={initial ? initial.name : t("schoolSetup.addSubject")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label={t("schoolSetup.code")} htmlFor="sub-code" error={error?.field === "code" ? error.msg : undefined}>
            <Input id="sub-code" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} autoFocus />
          </Field>
          <Field label={t("schoolSetup.name")} htmlFor="sub-name" error={error?.field === "name" ? error.msg : undefined}>
            <Input id="sub-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        </div>
        <Field label={t("schoolSetup.nameAr")} htmlFor="sub-name-ar">
          <Input id="sub-name-ar" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
        </Field>
        <Field label={t("schoolSetup.color")} htmlFor="sub-color">
          <input id="sub-color" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-20 cursor-pointer rounded-lg border border-line bg-surface p-1" />
        </Field>
        {error && !error.field && <p className="text-sm text-danger">{error.msg}</p>}
      </div>
    </Modal>
  );
}
