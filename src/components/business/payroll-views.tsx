"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, BadgeDollarSign, Banknote, CheckCircle2, Download, FileText, Loader2, Pencil, Printer, RotateCcw, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import { Field, Input, inputClass } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataToolbar } from "@/components/data/toolbar";
import { celebrate } from "@/components/motion/celebrate";
import { monthStart } from "@/lib/format";
import { pick, type MessageKey } from "@/lib/i18n";
import { WPS_BANKS, bankFromIban, formatIban } from "@/lib/payroll/banks";
import type { DatasetResult } from "@/lib/datasets/types";
import { cn } from "@/lib/cn";
import { editPayslip, payrollAction, runPayroll, saveWpsSettings, type SlipInput } from "@/app/actions/payroll";
import { StatTile } from "./charts";

export interface RunSummary {
  id: string;
  month: string;
  status: string;
  people: number;
  gross: number;
  deductions: number;
  net: number;
  paidAt: string | null;
}

export interface WpsSettings {
  employerEid: string;
  payerEid: string;
  bankShortName: string;
  iban: string;
}

/** All payroll runs, newest first, and the WPS details. */
export function PayrollList({ slug, runs, nextMonth, wps, canSetup, people, monthlyGross }: { slug: string; runs: RunSummary[]; nextMonth: string | null; wps: WpsSettings; canSetup: boolean; people: number; monthlyGross: number }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [wpsOpen, setWpsOpen] = useState(false);
  const wpsReady = !!(wps.employerEid && wps.bankShortName && wps.iban);
  const prepare = () =>
    start(async () => {
      if (!nextMonth) return;
      const res = await runPayroll(slug, nextMonth);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      router.push(`/w/${slug}/hr/payroll/${res.id}`);
    });
  return (
    <div className="space-y-[var(--gap)]">
      <PageHeader
        title={t("nav.payroll")}
        subtitle={t("payroll.subtitle", { people: fmt.number(people), gross: fmt.money(monthlyGross) })}
        actions={
          <>
            {canSetup && (
              <Button variant="secondary" onClick={() => setWpsOpen(true)}>
                <Settings2 className="size-4" /> {t("payroll.wpsDetails")}
              </Button>
            )}
            {nextMonth && (
              <Button onClick={prepare} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t("payroll.prepare", { month: fmt.monthName(monthStart(nextMonth)) })}
              </Button>
            )}
          </>
        }
      />
      {!wpsReady && (
        <Card className="border-warning/40 bg-warning/5">
          <CardBody className="flex items-center gap-3 text-sm">
            <AlertTriangle className="size-5 shrink-0 text-warning" />
            <span className="flex-1">{t("payroll.wpsMissing")}</span>
            {canSetup && (
              <Button size="sm" variant="secondary" onClick={() => setWpsOpen(true)}>
                {t("payroll.addWps")}
              </Button>
            )}
          </CardBody>
        </Card>
      )}
      {runs.length === 0 ? (
        <EmptyState icon={<BadgeDollarSign className="size-6" />} title={t("payroll.emptyTitle")} body={t("payroll.emptyBody")} />
      ) : (
        <div className="grid gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-3">
          {runs.map((r) => (
            <Link key={r.id} href={`/w/${slug}/hr/payroll/${r.id}`}>
              <Card lift className="h-full p-[var(--pad)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-semibold">{fmt.monthName(monthStart(r.month))}</p>
                    <p className="text-sm text-muted">{t("payroll.peopleCount", { n: fmt.number(r.people) })}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="tabular mt-4 text-2xl font-semibold">{fmt.money(r.net)}</p>
                <p className="text-xs text-muted">
                  {t("payroll.netAfter", { gross: fmt.money(r.gross), deductions: fmt.money(r.deductions) })}
                  {r.paidAt ? ` · ${t("payroll.paidOn", { date: fmt.date(r.paidAt) })}` : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <WpsSheet slug={slug} open={wpsOpen} onOpenChange={setWpsOpen} initial={wps} />
    </div>
  );
}

function WpsSheet({ slug, open, onOpenChange, initial }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; initial: WpsSettings }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({ ...initial, iban: initial.iban ? formatIban(initial.iban) : "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const res = await saveWpsSettings(slug, form);
      if (!res.ok) return setErrors({ [res.field ?? "employerEid"]: t(res.error as MessageKey) });
      toast.success(t("common.saved"));
      onOpenChange(false);
      router.refresh();
    });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("payroll.wpsDetails")}
      description={t("payroll.wpsHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("payroll.employerEid")} hint={t("payroll.employerEidHint")} error={errors.employerEid} htmlFor="wps-eid">
          <Input id="wps-eid" dir="ltr" inputMode="numeric" maxLength={8} value={form.employerEid} onChange={(e) => setForm({ ...form, employerEid: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("payroll.payerEid")} hint={t("payroll.payerEidHint")} error={errors.payerEid} htmlFor="wps-payer">
          <Input id="wps-payer" dir="ltr" inputMode="numeric" maxLength={8} value={form.payerEid} onChange={(e) => setForm({ ...form, payerEid: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("payroll.payerIban")} error={errors.iban} htmlFor="wps-iban">
          <Input id="wps-iban" dir="ltr" className="font-mono" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase(), bankShortName: bankFromIban(e.target.value) ?? form.bankShortName })} />
        </Field>
        <Field label={t("hr.bank")} error={errors.bankShortName} htmlFor="wps-bank">
          <select id="wps-bank" value={form.bankShortName} onChange={(e) => setForm({ ...form, bankShortName: e.target.value })} className={inputClass}>
            <option value="">—</option>
            {WPS_BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} · {locale === "ar" ? b.nameAr : b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Sheet>
  );
}

export interface SlipRow {
  id: string;
  employeeId: string;
  name: string;
  nameAr: string | null;
  number: string;
  payMethod: string;
  workingDays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  basic: number;
  allowances: number;
  overtimeHours: number;
  overtimePay: number;
  bonus: number;
  absenceDeduction: number;
  advanceDeduction: number;
  otherDeduction: number;
  gross: number;
  deductions: number;
  net: number;
  notes: string | null;
}

/** One month's payroll: payslips, adjustments, approval, payment and the WPS file. */
export function PayrollRun({
  slug,
  run,
  slips,
  issues,
  cashPaid,
  wpsReady,
  query,
  result,
  canShare,
  canApprove,
  previousNet,
}: {
  slug: string;
  run: RunSummary & { approvedBy: string | null; approvedAt: string | null };
  slips: SlipRow[];
  issues: { row: number; who: string; field: string; message: string }[];
  cashPaid: string[];
  wpsReady: boolean;
  query: string;
  result: DatasetResult;
  canShare: boolean;
  canApprove: boolean;
  previousNet: number | null;
}) {
  const { t, fmt, locale, dir } = useI18n();
  const reduced = useReducedMotion();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<SlipRow | null>(null);
  const [confirm, setConfirm] = useState<"approve" | "pay" | "reopen" | null>(null);
  const [payDate, setPayDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date()));
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const draft = run.status === "draft";
  const act = (action: "approve" | "reopen" | "pay" | "refresh") =>
    start(async () => {
      const res = await payrollAction(slug, run.id, action, payDate);
      setConfirm(null);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t(`payroll.done_${action}` as MessageKey));
      if (action === "pay") celebrate(reduced);
      router.refresh();
    });
  const change = previousNet ? (run.net - previousNet) / previousNet : null;
  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/hr/payroll`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("nav.payroll")}
      </Link>
      <PageHeader
        title={t("payroll.runTitle", { month: fmt.monthName(monthStart(run.month)) })}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={run.status} />
            {run.approvedBy && run.approvedAt && t("payroll.approvedBy", { name: run.approvedBy, date: fmt.date(run.approvedAt) })}
          </span>
        }
        actions={
          <>
            <DataToolbar slug={slug} dataset="payslips" query={query} result={result} canShare={canShare} />
            {draft && (
              <Button variant="secondary" onClick={() => act("refresh")} disabled={pending}>
                <RotateCcw className="size-4" /> {t("payroll.recalculate")}
              </Button>
            )}
            {draft && canApprove && (
              <Button onClick={() => setConfirm("approve")} disabled={pending}>
                <ShieldCheck className="size-4" /> {t("payroll.approve")}
              </Button>
            )}
            {run.status === "approved" && canApprove && (
              <Button variant="ghost" onClick={() => setConfirm("reopen")} disabled={pending}>
                {t("payroll.reopen")}
              </Button>
            )}
            {run.status !== "draft" && (
              <a href={wpsReady ? `/api/w/${slug}/payroll/${run.id}/wps` : undefined} aria-disabled={!wpsReady} className={buttonClass("secondary", "md", !wpsReady ? "pointer-events-none opacity-50" : undefined)}>
                <Download className="size-4" /> {t("payroll.downloadWps")}
              </a>
            )}
            {run.status === "approved" && (
              <Button onClick={() => setConfirm("pay")} disabled={pending}>
                <Banknote className="size-4" /> {t("payroll.markPaid")}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-[var(--gap)] lg:grid-cols-4">
        <StatTile label={t("payroll.gross")} value={run.gross} />
        <StatTile label={t("payroll.deductions")} value={run.deductions} tone="warning" />
        <StatTile label={t("payroll.netPay")} value={run.net} hint={change != null ? t("payroll.vsLast", { pct: `${change >= 0 ? "+" : ""}${fmt.percent(change, 1)}` }) : undefined} />
        <StatTile label={t("payroll.people")} value={run.people} money={false} />
      </div>

      <Card className={cn(issues.length ? "border-warning/40" : "border-success/40")}>
        <CardHeader title={t("payroll.wpsCheck")} icon={issues.length ? <AlertTriangle className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />} />
        <CardBody className="text-sm">
          {!wpsReady ? (
            <p className="text-warning">{t("payroll.wpsMissing")}</p>
          ) : issues.length === 0 ? (
            <p className="text-success">{t("payroll.wpsOk", { n: fmt.number(slips.length - cashPaid.length) })}</p>
          ) : (
            <ul className="space-y-1">
              {issues.slice(0, 8).map((i, k) => (
                <li key={k} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span>
                    <b>{i.who || t("payroll.header")}</b> · {i.field} {i.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {cashPaid.length > 0 && <p className="mt-2 text-xs text-muted">{t("payroll.cashPaid", { names: cashPaid.join(", ") })}</p>}
        </CardBody>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-sunken/90 text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 text-start font-semibold">{t("hr.colName")}</th>
              <th className="px-2 py-2.5 text-end font-semibold">{t("payroll.daysPaid")}</th>
              <th className="px-2 py-2.5 text-end font-semibold">{t("hr.basicSalary")}</th>
              <th className="px-2 py-2.5 text-end font-semibold">{t("payroll.allowances")}</th>
              <th className="px-2 py-2.5 text-end font-semibold">{t("payroll.overtime")}</th>
              <th className="px-2 py-2.5 text-end font-semibold">{t("payroll.bonus")}</th>
              <th className="px-2 py-2.5 text-end font-semibold">{t("payroll.deductions")}</th>
              <th className="px-2 py-2.5 text-end font-semibold">{t("payroll.netPay")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-4 py-2">
                  <Link href={`/w/${slug}/hr/employees/${s.employeeId}`} className="font-medium hover:text-accent">
                    {pick(locale, s.name, s.nameAr)}
                  </Link>
                  <span className="block text-xs text-muted">
                    {s.number} · {s.payMethod === "bank" ? "WPS" : t("hr.payCash")}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </span>
                </td>
                <td className={cn("px-2 py-2 text-end tabular", s.workingDays < 30 && "font-semibold text-warning")}>{fmt.number(s.workingDays)}</td>
                <td className="px-2 py-2 text-end tabular">{fmt.money(s.basic)}</td>
                <td className="px-2 py-2 text-end tabular">{fmt.money(s.allowances)}</td>
                <td className="px-2 py-2 text-end tabular">{s.overtimePay ? fmt.money(s.overtimePay) : "—"}</td>
                <td className="px-2 py-2 text-end tabular">{s.bonus ? fmt.money(s.bonus) : "—"}</td>
                <td className={cn("px-2 py-2 text-end tabular", s.deductions > 0 && "text-danger")}>{s.deductions ? `−${fmt.money(s.deductions)}` : "—"}</td>
                <td className="px-2 py-2 text-end font-semibold tabular">{fmt.money(s.net, { decimals: true })}</td>
                <td className="px-4 py-2 text-end whitespace-nowrap">
                  {draft ? (
                    <Button variant="ghost" size="sm" onClick={() => setEdit(s)} aria-label={t("common.edit")}>
                      <Pencil className="size-3.5" />
                    </Button>
                  ) : (
                    <a href={`/api/w/${slug}/export/payslip?id=${s.id}&format=print`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")} aria-label={t("payroll.payslip")}>
                      <Printer className="size-3.5" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-line bg-sunken/60 font-semibold">
            <tr>
              <td className="px-4 py-2.5">{t("payroll.total")}</td>
              <td />
              <td className="px-2 py-2.5 text-end tabular">{fmt.money(slips.reduce((s, x) => s + x.basic, 0))}</td>
              <td className="px-2 py-2.5 text-end tabular">{fmt.money(slips.reduce((s, x) => s + x.allowances, 0))}</td>
              <td className="px-2 py-2.5 text-end tabular">{fmt.money(slips.reduce((s, x) => s + x.overtimePay, 0))}</td>
              <td className="px-2 py-2.5 text-end tabular">{fmt.money(slips.reduce((s, x) => s + x.bonus, 0))}</td>
              <td className="px-2 py-2.5 text-end tabular">{run.deductions ? `−${fmt.money(run.deductions)}` : "—"}</td>
              <td className="px-2 py-2.5 text-end tabular">{fmt.money(run.net, { decimals: true })}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <SlipSheet slug={slug} slip={edit} onClose={() => setEdit(null)} />
      <Modal
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`payroll.confirm_${confirm}` as MessageKey, { month: fmt.monthName(monthStart(run.month)), net: fmt.money(run.net) }) : ""}
        description={confirm ? t(`payroll.confirm_${confirm}_body` as MessageKey) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant={confirm === "reopen" ? "danger" : "primary"} onClick={() => confirm && act(confirm)} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {confirm ? t(confirm === "approve" ? "payroll.approve" : confirm === "pay" ? "payroll.markPaid" : "payroll.reopen") : ""}
            </Button>
          </>
        }
      >
        {confirm === "pay" && (
          <Field label={t("payroll.payDate")} htmlFor="pay-date">
            <Input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </Field>
        )}
      </Modal>
    </div>
  );
}

function SlipSheet({ slug, slip, onClose }: { slug: string; slip: SlipRow | null; onClose: () => void }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<SlipInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [lastId, setLastId] = useState<string | null>(null);
  if ((slip?.id ?? null) !== lastId) {
    setLastId(slip?.id ?? null);
    setError(null);
    setForm(
      slip
        ? {
            absentDays: slip.absentDays,
            unpaidLeaveDays: slip.unpaidLeaveDays,
            overtimeHours: String(slip.overtimeHours / 100),
            bonus: slip.bonus ? String(slip.bonus / 100) : "",
            advanceDeduction: slip.advanceDeduction ? String(slip.advanceDeduction / 100) : "",
            otherDeduction: slip.otherDeduction ? String(slip.otherDeduction / 100) : "",
            notes: slip.notes ?? "",
          }
        : null,
    );
  }
  const submit = () =>
    start(async () => {
      if (!slip || !form) return;
      const res = await editPayslip(slug, slip.id, form);
      if (!res.ok) return setError(t(res.error as MessageKey));
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open={!!slip}
      onOpenChange={(o) => !o && onClose()}
      title={slip ? pick(locale, slip.name, slip.nameAr) : ""}
      description={slip ? t("payroll.editHint", { gross: fmt.money(slip.basic + slip.allowances) }) : undefined}
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
      {form && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("payroll.absentDays")} htmlFor="sl-abs">
              <Input id="sl-abs" type="number" min={0} max={31} value={form.absentDays} onChange={(e) => setForm({ ...form, absentDays: Number(e.target.value) || 0 })} />
            </Field>
            <Field label={t("payroll.unpaidLeave")} htmlFor="sl-unp">
              <Input id="sl-unp" type="number" min={0} max={31} value={form.unpaidLeaveDays} onChange={(e) => setForm({ ...form, unpaidLeaveDays: Number(e.target.value) || 0 })} />
            </Field>
            <Field label={t("hr.overtimeHours")} hint={t("payroll.overtimeHint")} htmlFor="sl-ot">
              <Input id="sl-ot" dir="ltr" inputMode="decimal" value={form.overtimeHours} onChange={(e) => setForm({ ...form, overtimeHours: e.target.value })} />
            </Field>
            <Field label={t("payroll.bonus")} htmlFor="sl-bonus">
              <Input id="sl-bonus" dir="ltr" inputMode="decimal" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} />
            </Field>
            <Field label={t("payroll.advance")} htmlFor="sl-adv">
              <Input id="sl-adv" dir="ltr" inputMode="decimal" value={form.advanceDeduction} onChange={(e) => setForm({ ...form, advanceDeduction: e.target.value })} />
            </Field>
            <Field label={t("payroll.otherDeduction")} htmlFor="sl-oth">
              <Input id="sl-oth" dir="ltr" inputMode="decimal" value={form.otherDeduction} onChange={(e) => setForm({ ...form, otherDeduction: e.target.value })} />
            </Field>
          </div>
          <Field label={t("claims.note")} hint={t("payroll.noteHint")} htmlFor="sl-note">
            <Input id="sl-note" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

/** An employee's own payslips. */
export function MyPayslips({ slug, slips, linked }: { slug: string; slips: { id: string; month: string; net: number; gross: number; deductions: number; status: string }[]; linked: boolean }) {
  const { t, fmt } = useI18n();
  return (
    <div className="space-y-[var(--gap)]">
      <PageHeader title={t("nav.payslips")} subtitle={t("payroll.mySubtitle")} />
      {!linked ? (
        <EmptyState icon={<FileText className="size-6" />} title={t("payroll.notLinked")} body={t("hr.noEmployeeRecord")} />
      ) : slips.length === 0 ? (
        <EmptyState icon={<FileText className="size-6" />} title={t("payroll.noPayslipsYet")} body={t("payroll.noPayslipsBody")} />
      ) : (
        <div className="grid gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-3">
          {slips.map((s) => (
            <Card key={s.id} lift className="p-[var(--pad)]">
              <div className="flex items-start justify-between">
                <p className="text-lg font-semibold">{fmt.monthName(monthStart(s.month))}</p>
                <StatusBadge status={s.status} />
              </div>
              <p className="tabular mt-3 text-2xl font-semibold">{fmt.money(s.net, { decimals: true })}</p>
              <p className="text-xs text-muted">{t("payroll.netAfter", { gross: fmt.money(s.gross), deductions: fmt.money(s.deductions) })}</p>
              <div className="mt-4 flex gap-2">
                <a href={`/api/w/${slug}/export/payslip?id=${s.id}&format=print`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                  <Printer className="size-3.5" /> {t("toolbar.print")}
                </a>
                <a href={`/api/w/${slug}/export/payslip?id=${s.id}&format=pdf`} className={buttonClass("ghost", "sm")}>
                  <Download className="size-3.5" /> PDF
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
