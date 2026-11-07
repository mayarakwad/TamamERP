"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Loader2, Plus } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { CategoryIcon } from "@/components/ui/category-icon";
import { CountUp } from "@/components/motion/count-up";
import { DataToolbar } from "@/components/data/toolbar";
import { addMonths, monthStart } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { copyBudgets, createCategory, setBudget } from "@/app/actions/home";

const ICONS = ["shopping-cart", "utensils", "fuel", "receipt", "pencil-ruler", "baby", "heart-pulse", "smartphone", "sofa", "wrench", "gift", "circle-ellipsis"];
const COLOURS = ["#2E9E6B", "#D9644A", "#5A6B7A", "#2F7DB8", "#E0A030", "#C4467A", "#C2362F", "#8E5CC9", "#B5541C", "#7A6553"];

export function BudgetsView({ slug, month, currentMonth, result, canManage, canShare }: { slug: string; month: string; currentMonth: string; result: DatasetResult; canManage: boolean; canShare: boolean }) {
  const { t, fmt, dir } = useI18n();
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const sum = (k: string) => result.rows.reduce((s, r) => s + (Number(r.cells[k]) || 0), 0);
  const [budget, spent, pend] = [sum("budget"), sum("spent"), sum("pending")];
  const used = budget ? spent / budget : 0;
  const monthName = fmt.monthName(monthStart(month));

  return (
    <div>
      <PageHeader
        title={t("budgets.title")}
        subtitle={t("budgets.subtitle")}
        actions={
          <>
            <DataToolbar slug={slug} dataset="budgets" query={`month=${month}`} result={result} canShare={canShare} />
            {canManage && (
              <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" /> {t("budgets.addCategory")}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={`?month=${addMonths(month, -1)}`} scroll={false} className={buttonClass("ghost", "icon")} aria-label={t("budgets.prevMonth")}>
            <Prev className="size-4" />
          </Link>
          <h2 className="min-w-40 text-center text-lg font-semibold">{monthName}</h2>
          <Link href={`?month=${addMonths(month, 1)}`} scroll={false} className={cn(buttonClass("ghost", "icon"), month >= currentMonth && "pointer-events-none opacity-30")} aria-label={t("budgets.nextMonth")}>
            <Next className="size-4" />
          </Link>
        </div>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await copyBudgets(slug, addMonths(month, -1), month);
                if (res.ok) toast.success(t("budgets.copied", { month: fmt.monthName(monthStart(addMonths(month, -1))) }));
              })
            }
          >
            <Copy className="size-3.5" /> {t("budgets.copyLast")}
          </Button>
        )}
      </div>

      <Card className="mb-6 p-[var(--pad)] sm:p-6">
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: t("budgets.totalBudget"), value: budget },
            { label: t("budgets.spent"), value: spent },
            { label: t("budgets.pending"), value: pend },
            { label: t("budgets.left"), value: budget - spent, danger: budget - spent < 0 },
          ].map((k) => (
            <div key={k.label}>
              <p className="text-xs text-muted">{k.label}</p>
              <p className={cn("mt-1 text-2xl font-semibold tracking-tight", k.danger && "text-danger")}>
                <CountUp value={k.value} format={(n) => fmt.money(n)} />
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex h-3 gap-[2px] overflow-hidden rounded-full bg-sunken">
          <motion.div className={cn("h-full rounded-full", used > 1 ? "bg-danger" : used > 0.85 ? "bg-warning" : "bg-accent")} initial={{ width: 0 }} animate={{ width: `${Math.min(100, used * 100)}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
          {budget > 0 && pend > 0 && <motion.div className="h-full rounded-full bg-[repeating-linear-gradient(135deg,var(--accent-line)_0_3px,transparent_3px_6px)]" initial={{ width: 0 }} animate={{ width: `${Math.min(100 - Math.min(100, used * 100), (pend / budget) * 100)}%` }} transition={{ delay: 0.6 }} />}
        </div>
        <p className="mt-2 text-xs text-muted">{fmt.percent(used)} · {canManage && t("budgets.editHint")}</p>
      </Card>

      <div className="grid gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-3">
        {result.rows.map((r, i) => {
          const b = Number(r.cells.budget);
          const s = Number(r.cells.spent);
          const p = Number(r.cells.pending);
          const u = b ? s / b : 0;
          const over = b > 0 && s > b;
          return (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card lift className="h-full p-[var(--pad)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: String(r.meta?.color) }}>
                      <CategoryIcon icon={String(r.meta?.icon)} className="size-4" />
                    </span>
                    <span className="truncate font-medium">{r.cells.category}</span>
                  </span>
                  {over ? (
                    <Badge tone="danger">
                      <AlertTriangle className="size-3" /> {t("budgets.over", { amount: fmt.money(s - b) })}
                    </Badge>
                  ) : b > 0 ? (
                    <span className="tabular text-xs text-muted">{fmt.percent(u)}</span>
                  ) : null}
                </div>
                <div className="mt-4 flex h-2 gap-[2px] overflow-hidden rounded-full bg-sunken">
                  <motion.div className={cn("h-full rounded-full", over ? "bg-danger" : u > 0.85 ? "bg-warning" : "bg-accent")} initial={{ width: 0 }} animate={{ width: `${b ? Math.min(100, u * 100) : s ? 100 : 0}%` }} transition={{ delay: 0.15 + i * 0.03, duration: 0.8 }} />
                  {p > 0 && b > 0 && <div className="h-full rounded-full bg-[repeating-linear-gradient(135deg,var(--accent-line)_0_3px,transparent_3px_6px)]" style={{ width: `${Math.min(100 - Math.min(100, u * 100), (p / b) * 100)}%` }} />}
                </div>
                <div className="mt-3 flex items-end justify-between gap-2 text-sm">
                  <div>
                    <p className="tabular font-semibold">{fmt.money(s)}</p>
                    {p > 0 && <p className="tabular text-xs text-muted">+ {fmt.money(p)} {t("budgets.pending").toLowerCase()}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => setEditing(r)}
                    className={cn("rounded-lg px-2 py-1 text-end text-xs text-muted transition", canManage && "hover:bg-sunken hover:text-fg")}
                  >
                    <span className="block">{t("budgets.totalBudget")}</span>
                    <span className="tabular text-sm font-medium text-fg">{b ? fmt.money(b) : t("budgets.noBudget")}</span>
                    {r.meta?.source === "month" && <span className="block text-[0.65rem] text-accent">{t("budgets.overrideHint")}</span>}
                  </button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {editing && <EditBudget key={editing.id} slug={slug} month={month} monthName={monthName} row={editing} onClose={() => setEditing(null)} />}
      <AddCategory slug={slug} open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function EditBudget({ slug, month, monthName, row, onClose }: { slug: string; month: string; monthName: string; row: Row; onClose: () => void }) {
  const { t } = useI18n();
  const [scope, setScope] = useState<"default" | "month">(row.meta?.source === "month" ? "month" : "default");
  const [amount, setAmount] = useState(String((Number(row.cells.budget) || 0) / 100));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = () =>
    start(async () => {
      const res = await setBudget(slug, row.id, scope === "default" ? "default" : month, amount);
      if (res.ok) {
        toast.success(t("budgets.saved"));
        onClose();
      } else setError(t(res.error as MessageKey));
    });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={String(row.cells.category)}
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
        <Field label={t("budgets.monthlyBudget")} error={error ?? undefined} htmlFor="b-amount">
          <Input id="b-amount" autoFocus inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="tabular text-lg" />
        </Field>
        <Segmented
          label={t("budgets.monthlyBudget")}
          value={scope}
          onChange={setScope}
          options={[
            { value: "default", label: t("budgets.everyMonth") },
            { value: "month", label: t("budgets.thisMonthOnly", { month: monthName }) },
          ]}
        />
      </div>
    </Modal>
  );
}

function AddCategory({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", nameAr: "", icon: ICONS[0], color: COLOURS[0], budget: "" });
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await createCategory(slug, form);
      if (res.ok) {
        toast.success(t("budgets.categoryAdded"));
        onOpenChange(false);
        setForm({ name: "", nameAr: "", icon: ICONS[0], color: COLOURS[0], budget: "" });
      } else toast.error(t(res.error as MessageKey));
    });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("budgets.addCategory")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={pending || !form.name.trim()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("budgets.categoryName")} htmlFor="cat-name">
            <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t("budgets.categoryNameAr")} htmlFor="cat-nameAr">
            <Input id="cat-nameAr" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("budgets.icon")}</p>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((ic) => (
              <button key={ic} type="button" aria-pressed={form.icon === ic} onClick={() => setForm({ ...form, icon: ic })} className={cn("grid size-9 place-items-center rounded-lg border", form.icon === ic ? "border-accent bg-accent-soft text-accent" : "border-line text-muted")}>
                <CategoryIcon icon={ic} className="size-4" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("budgets.colour")}</p>
          <div className="flex flex-wrap gap-2">
            {COLOURS.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={form.color === c} onClick={() => setForm({ ...form, color: c })} className={cn("size-8 rounded-full transition-transform hover:scale-110", form.color === c && "ring-2 ring-offset-2 ring-offset-surface")} style={{ background: c, ["--tw-ring-color" as string]: c }} />
            ))}
          </div>
        </div>
        <Field label={t("budgets.monthlyBudget")} htmlFor="cat-budget">
          <Input id="cat-budget" inputMode="decimal" dir="ltr" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0" />
        </Field>
      </div>
    </Modal>
  );
}
