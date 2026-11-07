"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CalendarClock, Check, Loader2, Pause, Pencil, Play, Plus, SkipForward, Trash2 } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, inputClass, Textarea } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { CategoryIcon } from "@/components/ui/category-icon";
import { DataToolbar } from "@/components/data/toolbar";
import { celebrate } from "@/components/motion/celebrate";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { DatasetResult } from "@/lib/datasets/types";
import { deleteBill, payBill, saveBill, skipBill, toggleBill, type BillInput } from "@/app/actions/home";

interface Bill {
  id: string;
  name: string;
  nameAr: string | null;
  provider: string | null;
  categoryId: string;
  icon: string;
  color: string;
  amount: number;
  variable: boolean;
  frequency: "monthly" | "quarterly" | "yearly";
  nextDue: string;
  remindDaysBefore: number;
  autopay: boolean;
  active: boolean;
  notes: string | null;
  due: { id: string; dueOn: string; amount: number } | null;
  history: { id: string; status: string; dueOn: string; paidOn: string | null; amount: number }[];
}

const ymd = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date(iso));
const DAY = 86400_000;

export function BillsView({ slug, now, result, bills, categories, openId, canManage, canShare }: { slug: string; now: string; result: DatasetResult; bills: Bill[]; categories: { id: string; name: string; nameAr: string; icon: string }[]; openId: string | null; canManage: boolean; canShare: boolean }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [formFor, setFormFor] = useState<Bill | "new" | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const nowD = new Date(now);
  const open = bills.find((b) => b.id === openId) ?? null;
  const upcoming = bills.filter((b) => b.active && b.due && new Date(b.due.dueOn).getTime() - nowD.getTime() < 30 * DAY).sort((a, b) => a.due!.dueOn.localeCompare(b.due!.dueOn));
  const monthly = bills.filter((b) => b.active).reduce((s, b) => s + b.amount / (b.frequency === "yearly" ? 12 : b.frequency === "quarterly" ? 3 : 1), 0);
  const close = () => router.replace(`/w/${slug}/bills`, { scroll: false });

  return (
    <div>
      <PageHeader
        title={t("bills.title")}
        subtitle={`${t("bills.subtitle")} ${bills.length ? t("bills.perMonth", { amount: fmt.money(Math.round(monthly)) }) : ""}`}
        actions={
          <>
            <DataToolbar slug={slug} dataset="bills" query="" result={result} canShare={canShare} />
            {canManage && (
              <Button onClick={() => setFormFor("new")}>
                <Plus className="size-4" /> {t("bills.add")}
              </Button>
            )}
          </>
        }
      />

      {bills.length === 0 ? (
        <EmptyState icon={<CalendarClock className="size-6" />} title={t("bills.emptyTitle")} body={t("bills.emptyBody")} action={canManage && <Button onClick={() => setFormFor("new")}><Plus className="size-4" /> {t("bills.add")}</Button>} />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("bills.upcoming", { n: fmt.number(30) })}</h2>
          {upcoming.length === 0 ? (
            <p className="mb-8 text-sm text-muted">{t("bills.none", { n: fmt.number(30) })}</p>
          ) : (
            <div className="mb-8 grid gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-3">
              {upcoming.map((b, i) => {
                const days = Math.ceil((new Date(b.due!.dueOn).getTime() - nowD.getTime()) / DAY);
                return (
                  <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Card lift className="flex h-full flex-col p-[var(--pad)]">
                      <div className="flex items-start gap-3">
                        <div className={cn("grid w-12 shrink-0 place-items-center rounded-xl py-1.5 text-center", days < 0 ? "bg-[color-mix(in_oklch,var(--danger)_14%,var(--surface))] text-danger" : days <= 3 ? "bg-accent-soft text-accent" : "bg-sunken text-muted")}>
                          <span className="text-[0.65rem] leading-none uppercase">{fmt.monthShort(b.due!.dueOn)}</span>
                          <span className="tabular text-lg leading-tight font-semibold">{fmt.number(Number(new Intl.DateTimeFormat("en", { day: "numeric", timeZone: "Asia/Qatar" }).format(new Date(b.due!.dueOn))))}</span>
                        </div>
                        <button type="button" onClick={() => router.replace(`/w/${slug}/bills?bill=${b.id}`, { scroll: false })} className="min-w-0 flex-1 text-start">
                          <p className="truncate font-medium">{pick(locale, b.name, b.nameAr)}</p>
                          <p className="truncate text-xs text-muted">
                            {b.provider} · {days < 0 ? t("bills.overdue") : t("bills.dueIn", { when: fmt.relative(b.due!.dueOn, nowD) })}
                          </p>
                        </button>
                        <div className="text-end">
                          <p className="tabular font-semibold">{fmt.money(b.due!.amount)}</p>
                          {b.autopay ? <Badge tone="success">{t("dashboard.autopay")}</Badge> : b.variable ? <span className="text-[0.7rem] text-subtle">{t("dashboard.estimate")}</span> : null}
                        </div>
                      </div>
                      {canManage && (
                        <div className="mt-4 flex gap-2 border-t border-line pt-3">
                          <Button size="sm" onClick={() => setPaying(b)}>
                            <Check className="size-3.5" /> {t("bills.markPaid")}
                          </Button>
                          <SkipButton slug={slug} bill={b} />
                        </div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          <h2 className="mb-3 text-sm font-semibold text-muted">{t("bills.all")}</h2>
          <div className="grid gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-4">
            {bills.map((b) => (
              <button key={b.id} type="button" onClick={() => router.replace(`/w/${slug}/bills?bill=${b.id}`, { scroll: false })} className={cn("lift rounded-[var(--radius-card)] border border-line bg-surface p-[var(--pad)] text-start shadow-card", !b.active && "opacity-60")}>
                <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: b.color }}>
                  <CategoryIcon icon={b.icon} className="size-4" />
                </span>
                <p className="mt-3 truncate font-medium">{pick(locale, b.name, b.nameAr)}</p>
                <p className="truncate text-xs text-muted">
                  {b.provider} · {t(`bills.${b.frequency}` as MessageKey)}
                </p>
                <p className="tabular mt-2 text-lg font-semibold">{fmt.money(b.amount)}</p>
                <p className="text-xs text-muted">{b.active ? t("bills.dueIn", { when: fmt.relative(b.nextDue, nowD) }) : t("bills.paused")}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <Sheet open onOpenChange={(o) => !o && close()} title={pick(locale, open.name, open.nameAr)} description={[open.provider, t(`bills.${open.frequency}` as MessageKey)].filter(Boolean).join(" · ")}>
          <BillDetail slug={slug} bill={open} now={nowD} canManage={canManage} onPay={() => setPaying(open)} onEdit={() => setFormFor(open)} onDeleted={close} />
        </Sheet>
      )}
      {paying && <PayModal slug={slug} bill={paying} onClose={() => setPaying(null)} />}
      {formFor && <BillForm slug={slug} bill={formFor === "new" ? null : formFor} categories={categories} onClose={() => setFormFor(null)} />}
    </div>
  );
}

function SkipButton({ slug, bill }: { slug: string; bill: Bill }) {
  const { t, fmt } = useI18n();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await skipBill(slug, bill.due!.id);
          if (res.ok) toast.success(t("bills.skipped", { date: fmt.date(res.nextDue) }));
        })
      }
    >
      <SkipForward className="size-3.5" /> {t("bills.skip")}
    </Button>
  );
}

function BillDetail({ slug, bill, now, canManage, onPay, onEdit, onDeleted }: { slug: string; bill: Bill; now: Date; canManage: boolean; onPay: () => void; onEdit: () => void; onDeleted: () => void }) {
  const { t, fmt } = useI18n();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted">{t("bills.amount")}</p>
          <p className="tabular text-3xl font-semibold">{fmt.money(bill.amount)}</p>
          {bill.variable && <p className="text-xs text-subtle">{t("dashboard.estimate")}</p>}
        </div>
        <div className="text-end text-sm">
          <p className="text-xs text-muted">{t("bills.nextDue")}</p>
          <p className="font-medium">{bill.active ? fmt.date(bill.nextDue, "long") : t("bills.paused")}</p>
          {bill.active && <p className="text-xs text-muted">{fmt.relative(bill.nextDue, now)}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {bill.autopay && <Badge tone="success">{t("dashboard.autopay")}</Badge>}
        <Badge>{t("bills.remindDays", { count: fmt.number(bill.remindDaysBefore) })}</Badge>
      </div>
      {bill.notes && <p className="rounded-xl bg-sunken/70 p-3 text-sm whitespace-pre-wrap">{bill.notes}</p>}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {bill.active && bill.due && (
            <Button onClick={onPay}>
              <Check className="size-4" /> {t("bills.markPaid")}
            </Button>
          )}
          {bill.active && bill.due && <SkipButton slug={slug} bill={bill} />}
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" /> {t("bills.edit")}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => void (await toggleBill(slug, bill.id, !bill.active)))}>
            {bill.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {bill.active ? t("bills.pause") : t("bills.resume")}
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm(true)}>
            <Trash2 className="size-3.5" /> {t("bills.delete")}
          </Button>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("bills.history")}</h3>
        {bill.history.length === 0 ? (
          <p className="text-sm text-muted">{t("bills.noHistory")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {bill.history.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>
                  {fmt.monthName(p.dueOn)}
                  {p.paidOn && <span className="block text-xs text-muted">{fmt.date(p.paidOn)}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular font-medium">{p.status === "paid" ? fmt.money(p.amount, { decimals: "auto" }) : "—"}</span>
                  <StatusBadge status={p.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={t("bills.deleteConfirm")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                start(async () => {
                  const res = await deleteBill(slug, bill.id);
                  if (res.ok) {
                    toast.success(t("bills.deleted"));
                    onDeleted();
                  }
                })
              }
            >
              {t("bills.delete")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function PayModal({ slug, bill, onClose }: { slug: string; bill: Bill; onClose: () => void }) {
  const { t, fmt, locale } = useI18n();
  const reduced = useReducedMotion();
  const [amount, setAmount] = useState(((bill.due?.amount ?? bill.amount) / 100).toFixed(2));
  const [paidOn, setPaidOn] = useState(ymd(new Date().toISOString()));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pay = () =>
    start(async () => {
      const res = await payBill(slug, bill.due!.id, amount, paidOn);
      if (!res.ok) return setError(t(res.error as MessageKey));
      celebrate(reduced);
      toast.success(t("bills.paid", { name: pick(locale, bill.name, bill.nameAr), date: fmt.date(res.nextDue) }));
      onClose();
    });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${t("bills.markPaid")}: ${pick(locale, bill.name, bill.nameAr)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={pay} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("bills.markPaid")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("bills.paidAmount")} error={error ?? undefined} htmlFor="p-amount">
          <Input id="p-amount" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" autoFocus={bill.variable} />
        </Field>
        <Field label={t("bills.paidOn")} htmlFor="p-date">
          <Input id="p-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function BillForm({ slug, bill, categories, onClose }: { slug: string; bill: Bill | null; categories: { id: string; name: string; nameAr: string; icon: string }[]; onClose: () => void }) {
  const { t, locale } = useI18n();
  const billsCat = categories.find((c) => c.name.toLowerCase().startsWith("bills"))?.id ?? categories[0]?.id ?? "";
  const [form, setForm] = useState<BillInput>(() => ({
    name: bill?.name ?? "",
    nameAr: bill?.nameAr ?? "",
    provider: bill?.provider ?? "",
    categoryId: bill?.categoryId ?? billsCat,
    amount: bill ? (bill.amount / 100).toFixed(2) : "",
    variable: bill?.variable ?? false,
    frequency: bill?.frequency ?? "monthly",
    nextDue: bill ? ymd(bill.nextDue) : ymd(new Date(Date.now() + 7 * DAY).toISOString()),
    remindDaysBefore: bill?.remindDaysBefore ?? 3,
    autopay: bill?.autopay ?? false,
    notes: bill?.notes ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await saveBill(slug, bill?.id ?? null, form);
      if (!res.ok) return setErrors({ [res.field ?? "name"]: t(res.error as MessageKey) });
      toast.success(t("bills.saved"));
      onClose();
    });
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={bill ? t("bills.edit") : t("bills.add")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("bills.name")} error={errors.name} htmlFor="bf-name">
            <Input id="bf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Electricity & water" />
          </Field>
          <Field label={t("bills.nameAr")} htmlFor="bf-nameAr">
            <Input id="bf-nameAr" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          </Field>
          <Field label={t("bills.provider")} htmlFor="bf-provider">
            <Input id="bf-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder={t("bills.providerPlaceholder")} />
          </Field>
          <Field label={t("claims.category")} htmlFor="bf-cat">
            <select id="bf-cat" className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name, c.nameAr)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("bills.amount")} error={errors.amount} htmlFor="bf-amount">
            <Input id="bf-amount" inputMode="decimal" dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="tabular" />
          </Field>
          <Field label={t("bills.nextDue")} htmlFor="bf-due">
            <Input id="bf-due" type="date" value={form.nextDue} onChange={(e) => setForm({ ...form, nextDue: e.target.value })} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("bills.frequency")}</p>
          <Segmented
            label={t("bills.frequency")}
            value={form.frequency}
            onChange={(frequency) => setForm({ ...form, frequency })}
            options={[
              { value: "monthly", label: t("bills.monthly") },
              { value: "quarterly", label: t("bills.quarterly") },
              { value: "yearly", label: t("bills.yearly") },
            ]}
          />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("bills.remind")}</p>
          <Segmented
            label={t("bills.remind")}
            value={form.remindDaysBefore}
            onChange={(remindDaysBefore) => setForm({ ...form, remindDaysBefore })}
            options={[1, 3, 7, 14].map((d) => ({ value: d, label: t("bills.remindDays", { count: d }) }))}
          />
        </div>
        <Switch label={t("bills.variable")} checked={form.variable} onChange={(variable) => setForm({ ...form, variable })} />
        <Switch label={t("bills.autopay")} checked={form.autopay} onChange={(autopay) => setForm({ ...form, autopay })} />
        <Field label={t("bills.notes")} htmlFor="bf-notes">
          <Textarea id="bf-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}
