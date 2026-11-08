"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, BookOpen, CalendarRange, Coins, FileClock, LineChart, Package, PieChart, Scale, Users, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CountUp } from "@/components/motion/count-up";
import { DataTable } from "@/components/data/data-table";
import { DataToolbar } from "@/components/data/toolbar";
import type { DatasetResult } from "@/lib/datasets/types";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { InOutChart } from "./charts";
import { selectClass, useQueryParam } from "./list-view";

export const REPORT_META: Record<string, { title: MessageKey; desc: MessageKey; icon: LucideIcon; period: "range" | "asOf" | "none" }> = {
  pl: { title: "reports.pl", desc: "reports.plDesc", icon: LineChart, period: "range" },
  bs: { title: "reports.bs", desc: "reports.bsDesc", icon: Scale, period: "asOf" },
  cf: { title: "reports.cf", desc: "reports.cfDesc", icon: Coins, period: "range" },
  "ar-aging": { title: "reports.arAging", desc: "reports.arAgingDesc", icon: FileClock, period: "asOf" },
  "ap-aging": { title: "reports.apAging", desc: "reports.apAgingDesc", icon: CalendarRange, period: "asOf" },
  "sales-by-customer": { title: "reports.salesByCustomer", desc: "reports.salesByCustomerDesc", icon: Users, period: "range" },
  "sales-by-item": { title: "reports.salesByItem", desc: "reports.salesByItemDesc", icon: PieChart, period: "range" },
  "stock-valuation": { title: "reports.stockValuation", desc: "reports.stockValuationDesc", icon: Package, period: "none" },
  tb: { title: "reports.tb", desc: "reports.tbDesc", icon: BookOpen, period: "asOf" },
  ledger: { title: "reports.ledger", desc: "reports.ledgerDesc", icon: BarChart3, period: "range" },
};

/** Report cards with a headline number each. */
export function ReportsIndex({ slug, headlines, hide = [] }: { slug: string; headlines: Record<string, { value: number; hint?: string }>; hide?: string[] }) {
  const { t, fmt } = useI18n();
  return (
    <div className="space-y-[var(--gap)]">
      <PageHeader title={t("nav.reports")} subtitle={t("reports.subtitle")} />
      <div className="grid gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(REPORT_META)
          .filter(([id]) => id !== "ledger" && !hide.includes(id))
          .map(([id, m]) => {
            const h = headlines[id];
            return (
              <Link key={id} href={`/w/${slug}/reports/${id}`}>
                <Card lift className="h-full p-[var(--pad)]">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <m.icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{t(m.title)}</p>
                      <p className="text-sm text-muted">{t(m.desc)}</p>
                    </div>
                  </div>
                  {h && (
                    <div className="mt-4">
                      <p className={cn("tabular text-2xl font-semibold", h.value < 0 && "text-danger")}>
                        <CountUp value={h.value} format={(n) => fmt.money(Math.round(n))} />
                      </p>
                      {h.hint && <p className="text-xs text-muted">{h.hint}</p>}
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
      </div>
    </div>
  );
}

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(d);

function presets(today: string, fyStart: number) {
  const [y, m] = today.split("-").map(Number);
  const mm = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mo: number) => new Date(Date.UTC(yy, mo, 0)).getUTCDate();
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const q = Math.floor((m - 1) / 3);
  const fyY = m >= fyStart ? y : y - 1;
  return {
    thisMonth: { from: `${y}-${mm(m)}-01`, to: today },
    lastMonth: { from: `${prevY}-${mm(prevM)}-01`, to: `${prevY}-${mm(prevM)}-${lastDay(prevY, prevM)}` },
    thisQuarter: { from: `${y}-${mm(q * 3 + 1)}-01`, to: today },
    thisYear: { from: `${fyY}-${mm(fyStart)}-01`, to: today },
    lastYear: { from: `${fyY - 1}-${mm(fyStart)}-01`, to: ymd(new Date(new Date(`${fyY}-${mm(fyStart)}-01T12:00:00+03:00`).getTime() - 86400_000)) },
  };
}

/** One report: period picker, export toolbar, the table (and a chart where it helps). */
export function ReportView({ slug, id, query, result, canShare, fyStart, months, accounts }: { slug: string; id: string; query: string; result: DatasetResult; canShare: boolean; fyStart: number; months?: { month: string; inflow: number; outflow: number }[]; accounts?: { id: string; label: string }[] }) {
  const { t } = useI18n();
  const { params, setMany, set } = useQueryParam(query);
  const meta = REPORT_META[id];
  const today = ymd(new Date());
  const p = presets(today, fyStart);
  const from = params.get("from") ?? p.thisYear.from;
  const to = params.get("to") ?? today;
  const active = (Object.entries(p).find(([, v]) => v.from === from && v.to === to)?.[0] ?? "custom") as keyof typeof p | "custom";
  const [custom, setCustom] = useState(active === "custom");
  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/reports`} className="text-sm text-muted hover:text-fg">
        ← {t("nav.reports")}
      </Link>
      <PageHeader title={result.title} subtitle={result.subtitle} actions={<DataToolbar slug={slug} dataset={id} query={query} result={result} canShare={canShare} />} />
      <div className="flex flex-wrap items-center gap-2">
        {id === "ledger" && accounts && (
          <select aria-label={t("reports.colAccount")} className={cn(selectClass, "min-w-64")} value={params.get("account") ?? ""} onChange={(e) => set("account", e.target.value || null)}>
            <option value="">{t("reports.pickAccount")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        {meta.period === "range" && (
          <>
            <div className="flex flex-wrap gap-1 rounded-xl bg-sunken p-1 text-sm">
              {(Object.keys(p) as (keyof typeof p)[]).map((k) => (
                <button key={k} type="button" onClick={() => (setCustom(false), setMany({ from: p[k].from, to: p[k].to }))} aria-pressed={active === k && !custom} className={cn("rounded-lg px-3 py-1.5", active === k && !custom ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg")}>
                  {t(`reports.p_${k}` as MessageKey)}
                </button>
              ))}
              <button type="button" onClick={() => setCustom(true)} aria-pressed={custom || active === "custom"} className={cn("rounded-lg px-3 py-1.5", custom || active === "custom" ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg")}>
                {t("reports.p_custom")}
              </button>
            </div>
            {(custom || active === "custom") && (
              <div className="flex items-center gap-2">
                <Input type="date" value={from} max={to} onChange={(e) => set("from", e.target.value)} className="h-9 w-40 text-sm" aria-label={t("hr.colFrom")} />
                <span className="text-muted">→</span>
                <Input type="date" value={to} min={from} onChange={(e) => set("to", e.target.value)} className="h-9 w-40 text-sm" aria-label={t("hr.colTo")} />
              </div>
            )}
          </>
        )}
        {meta.period === "asOf" && (
          <label className="flex items-center gap-2 text-sm text-muted">
            {t("reports.asOfLabel")}
            <Input type="date" value={to} max={today} onChange={(e) => set("to", e.target.value)} className="h-9 w-40 text-sm" />
          </label>
        )}
      </div>
      {id === "cf" && months && months.length > 1 && (
        <Card>
          <CardBody>
            <InOutChart data={months} inLabel={t("reports.moneyIn")} outLabel={t("reports.moneyOut")} />
          </CardBody>
        </Card>
      )}
      <DataTable slug={slug} result={result} empty={<EmptyState icon={<BarChart3 className="size-6" />} title={id === "ledger" && !params.get("account") ? t("reports.pickAccount") : t("reports.empty")} />} />
    </div>
  );
}
