"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, inputClass } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { pick, type MessageKey } from "@/lib/i18n";
import { WPS_BANKS, bankFromIban, formatIban, isValidIban } from "@/lib/payroll/banks";
import { saveEmployee, type EmployeeInput } from "@/app/actions/hr";

export interface EmployeeData {
  id: string;
  name: string;
  nameAr: string | null;
  jobTitle: string | null;
  jobTitleAr: string | null;
  department: string | null;
  campusId: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  qid: string | null;
  qidExpiry: string | null;
  visaNumber: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  joinedOn: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  foodAllowance: number;
  otherAllowance: number;
  payMethod: string;
  bankShortName: string | null;
  iban: string | null;
  annualLeaveDays: number;
  userId: string | null;
  notes: string | null;
}

/** Nationalities most common in Qatar's workforce first. */
export const NATIONALITIES = ["QA", "IN", "NP", "PH", "BD", "EG", "PK", "LK", "KE", "UG", "JO", "LB", "SY", "SD", "TN", "MA", "ID", "GH", "NG", "ET", "GB", "US", "FR", "DE", "ZA", "SA", "AE", "KW", "OM", "BH"];

const todayInDoha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());
const m = (d: number) => (d ? (d / 100).toFixed(2) : "");

export function EmployeeSheet({
  slug,
  open,
  onOpenChange,
  initial,
  campuses,
  departments,
  members,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: EmployeeData;
  campuses: { id: string; name: string; nameAr: string | null }[];
  departments: string[];
  members: { userId: string; name: string }[];
}) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = (): EmployeeInput => ({
    name: initial?.name ?? "",
    nameAr: initial?.nameAr ?? "",
    jobTitle: initial?.jobTitle ?? "",
    jobTitleAr: initial?.jobTitleAr ?? "",
    department: initial?.department ?? "",
    campusId: initial?.campusId ?? campuses[0]?.id ?? null,
    nationality: initial?.nationality ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    qid: initial?.qid ?? "",
    qidExpiry: initial?.qidExpiry?.slice(0, 10) ?? "",
    visaNumber: initial?.visaNumber ?? "",
    passportNumber: initial?.passportNumber ?? "",
    passportExpiry: initial?.passportExpiry?.slice(0, 10) ?? "",
    joinedOn: initial?.joinedOn.slice(0, 10) ?? todayInDoha(),
    basicSalary: m(initial?.basicSalary ?? 0),
    housingAllowance: m(initial?.housingAllowance ?? 0),
    transportAllowance: m(initial?.transportAllowance ?? 0),
    foodAllowance: m(initial?.foodAllowance ?? 0),
    otherAllowance: m(initial?.otherAllowance ?? 0),
    payMethod: (initial?.payMethod as "bank" | "cash") ?? "bank",
    bankShortName: initial?.bankShortName ?? "",
    iban: initial?.iban ? formatIban(initial.iban) : "",
    annualLeaveDays: initial?.annualLeaveDays ?? 21,
    userId: initial?.userId ?? null,
    notes: initial?.notes ?? "",
  });
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(blank());
      setErrors({});
    }
  }
  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ibanOk = form.iban ? isValidIban(form.iban) : null;
  const gross = ["basicSalary", "housingAllowance", "transportAllowance", "foodAllowance", "otherAllowance"].reduce((s, k) => s + (Number(form[k as keyof EmployeeInput]) || 0), 0);
  const regions = new Intl.DisplayNames([locale], { type: "region" });

  const submit = () =>
    start(async () => {
      const res = await saveEmployee(slug, initial?.id ?? null, form);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
        else toast.error(t(res.error as MessageKey));
        return;
      }
      toast.success(t("common.saved"));
      onOpenChange(false);
      router.refresh();
    });

  const section = (title: string) => <p className="pt-2 text-xs font-semibold tracking-wide text-subtle uppercase">{title}</p>;

  return (
    <Sheet
      open={open}
      wide
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={initial ? t("hr.editEmployee") : t("hr.newEmployee")}
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
        {section(t("hr.personal"))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("hr.nameAsQid")} error={errors.name} htmlFor="e-name">
            <Input id="e-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          <Field label={t("parties.nameAr")} htmlFor="e-name-ar">
            <Input id="e-name-ar" dir="rtl" value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
          </Field>
          <Field label={t("hr.colNationality")} htmlFor="e-nat">
            <select id="e-nat" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={inputClass}>
              <option value="">—</option>
              {NATIONALITIES.map((c) => (
                <option key={c} value={c}>
                  {regions.of(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("parties.phone")} htmlFor="e-phone">
            <Input id="e-phone" dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+974 …" />
          </Field>
        </div>

        {section(t("hr.job"))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("hr.colTitle")} htmlFor="e-title">
            <Input id="e-title" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
          </Field>
          <Field label={t("hr.titleAr")} htmlFor="e-title-ar">
            <Input id="e-title-ar" dir="rtl" value={form.jobTitleAr} onChange={(e) => set("jobTitleAr", e.target.value)} />
          </Field>
          <Field label={t("hr.colDepartment")} htmlFor="e-dept">
            <Input id="e-dept" list="e-depts" value={form.department} onChange={(e) => set("department", e.target.value)} />
            <datalist id="e-depts">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label={t("hr.colBranch")} htmlFor="e-branch">
            <select id="e-branch" value={form.campusId ?? ""} onChange={(e) => set("campusId", e.target.value || null)} className={inputClass}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name, c.nameAr)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("hr.colJoined")} htmlFor="e-joined">
            <Input id="e-joined" type="date" value={form.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} />
          </Field>
          <Field label={t("hr.login")} hint={t("hr.loginHint")} htmlFor="e-user">
            <select id="e-user" value={form.userId ?? ""} onChange={(e) => set("userId", e.target.value || null)} className={inputClass}>
              <option value="">{t("hr.noLogin")}</option>
              {members.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {section(t("hr.documents"))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("hr.qid")} error={errors.qid} hint={t("hr.qidHint")} htmlFor="e-qid">
            <Input id="e-qid" dir="ltr" inputMode="numeric" maxLength={11} value={form.qid} onChange={(e) => set("qid", e.target.value.replace(/\D/g, ""))} aria-invalid={!!errors.qid} />
          </Field>
          <Field label={t("hr.colQidExpiry")} htmlFor="e-qid-exp">
            <Input id="e-qid-exp" type="date" value={form.qidExpiry} onChange={(e) => set("qidExpiry", e.target.value)} />
          </Field>
          <Field label={t("hr.passport")} htmlFor="e-pp">
            <Input id="e-pp" dir="ltr" value={form.passportNumber} onChange={(e) => set("passportNumber", e.target.value.toUpperCase())} />
          </Field>
          <Field label={t("hr.passportExpiry")} htmlFor="e-pp-exp">
            <Input id="e-pp-exp" type="date" value={form.passportExpiry} onChange={(e) => set("passportExpiry", e.target.value)} />
          </Field>
          <Field label={t("hr.visa")} hint={t("hr.visaHint")} htmlFor="e-visa">
            <Input id="e-visa" dir="ltr" value={form.visaNumber} onChange={(e) => set("visaNumber", e.target.value)} />
          </Field>
        </div>

        {section(t("hr.pay"))}
        <div className="grid gap-4 sm:grid-cols-3">
          {(["basicSalary", "housingAllowance", "transportAllowance", "foodAllowance", "otherAllowance"] as const).map((k) => (
            <Field key={k} label={t(`hr.${k}` as MessageKey)} error={errors[k]} htmlFor={`e-${k}`}>
              <Input id={`e-${k}`} dir="ltr" inputMode="decimal" value={form[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k]} />
            </Field>
          ))}
          <div className="flex flex-col justify-end pb-2 text-sm">
            <span className="text-muted">{t("hr.monthlyGross")}</span>
            <span className="tabular text-lg font-semibold">{fmt.money(Math.round(gross * 100))}</span>
          </div>
        </div>
        <Segmented
          label={t("hr.payMethod")}
          value={form.payMethod}
          onChange={(v) => set("payMethod", v)}
          options={[
            { value: "bank", label: t("hr.payBank") },
            { value: "cash", label: t("hr.payCash") },
          ]}
        />
        {form.payMethod === "bank" ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label="IBAN" error={errors.iban} htmlFor="e-iban" hint={ibanOk ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" /> {t("hr.ibanOk")}</span> : ibanOk === false ? t("hr.ibanInvalid") : undefined}>
              <Input
                id="e-iban"
                dir="ltr"
                value={form.iban}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  set("iban", v);
                  const bank = bankFromIban(v);
                  if (bank) set("bankShortName", bank);
                }}
                onBlur={() => form.iban && set("iban", formatIban(form.iban))}
                placeholder="QA00 XXXX 0000 0000 0000 0000 0000 0"
                className="font-mono"
                aria-invalid={!!errors.iban || ibanOk === false}
              />
            </Field>
            <Field label={t("hr.bank")} error={errors.bankShortName} htmlFor="e-bank">
              <select id="e-bank" value={form.bankShortName} onChange={(e) => set("bankShortName", e.target.value)} className={inputClass}>
                <option value="">—</option>
                {WPS_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} · {locale === "ar" ? b.nameAr : b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">{t("hr.cashWarning")}</p>
        )}
        <Field label={t("hr.annualLeave")} hint={t("hr.annualLeaveHint")} htmlFor="e-leave">
          <Input id="e-leave" type="number" min={21} max={60} dir="ltr" value={form.annualLeaveDays} onChange={(e) => set("annualLeaveDays", Math.max(21, Math.min(60, Number(e.target.value) || 21)))} className="max-w-32" />
        </Field>
        <Field label={t("parties.notes")} htmlFor="e-notes">
          <Textarea id="e-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
