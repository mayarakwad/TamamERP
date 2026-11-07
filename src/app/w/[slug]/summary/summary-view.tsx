"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Printer, Sparkles } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { CategoryIcon } from "@/components/ui/category-icon";
import { CountUp } from "@/components/motion/count-up";
import { DataToolbar } from "@/components/data/toolbar";
import { addMonths, monthStart } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { DatasetResult } from "@/lib/datasets/types";

interface Props {
  slug: string;
  month: string;
  currentMonth: string;
  result: DatasetResult;
  canShare: boolean;
  categories: { id: string; name: string; nameAr: string; icon: string; color: string; spent: number; budget: number; last: number }[];
  people: { id: string; name: string; nameAr: string | null; avatarColor: string | null; amount: number; count: number }[];
  biggest: { id: string; merchant: string; amount: number; spentOn: string; by: string; byAr: string | null; icon: string }[];
  bills: { id: string; name: string; nameAr: string | null; amount: number; paidOn: string }[];
  daily: number[];
  claimCount: number;
}

export function SummaryView(p: Props) {
  const { t, fmt, locale, dir } = useI18n();
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const monthName = fmt.monthName(monthStart(p.month));
  const prevName = fmt.monthName(monthStart(addMonths(p.month, -1)));
  const total = p.categories.reduce((s, c) => s + c.spent, 0);
  const budget = p.categories.reduce((s, c) => s + c.budget, 0);
  const last = p.categories.reduce((s, c) => s + c.last, 0);
  const change = last ? (total - last) / last : 0;
  const ranked = p.categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const over = p.categories.filter((c) => c.budget > 0 && c.spent > c.budget);
  const billsTotal = p.bills.reduce((s, b) => s + b.amount, 0);
  const maxDay = Math.max(...p.daily, 1);

  const story: string[] = [];
  if (last) story.push(change <= 0 ? t("summary.storyLess", { pct: fmt.percent(Math.abs(change)), month: prevName }) : t("summary.storyMore", { pct: fmt.percent(change), month: prevName }));
  if (ranked[0]) story.push(t("summary.storyBiggest", { category: pick(locale, ranked[0].name, ranked[0].nameAr), share: fmt.percent(ranked[0].spent / (total || 1)) }));
  if (p.biggest[0]) story.push(t("summary.storyPurchase", { amount: fmt.money(p.biggest[0].amount, { decimals: "auto" }), merchant: p.biggest[0].merchant }));
  const topClaimer = [...p.people].sort((a, b) => b.count - a.count)[0];
  if (topClaimer) story.push(t("summary.storyPeople", { name: pick(locale, topClaimer.name, topClaimer.nameAr).split(" ")[0], count: fmt.number(topClaimer.count) }));
  if (p.bills.length) story.push(t("summary.storyBills", { count: fmt.number(p.bills.length), amount: fmt.money(billsTotal) }));
  story.push(over.length ? t("summary.storyOver", { count: fmt.number(over.length) }) : t("summary.storyUnder"));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("summary.title")}
        actions={
          <>
            <DataToolbar slug={p.slug} dataset="summary" query={`month=${p.month}`} result={p.result} canShare={p.canShare} />
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" /> {t("summary.print")}
            </Button>
          </>
        }
      />
      <div className="no-print mb-5 flex items-center gap-1">
        <Link href={`?month=${addMonths(p.month, -1)}`} scroll={false} className={buttonClass("ghost", "icon")} aria-label={t("budgets.prevMonth")}>
          <Prev className="size-4" />
        </Link>
        <span className="min-w-40 text-center font-semibold">{monthName}</span>
        <Link href={`?month=${addMonths(p.month, 1)}`} scroll={false} className={cn(buttonClass("ghost", "icon"), p.month >= p.currentMonth && "pointer-events-none opacity-30")} aria-label={t("budgets.nextMonth")}>
          <Next className="size-4" />
        </Link>
      </div>

      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="absolute -end-20 -top-20 size-72 rounded-full bg-accent-soft blur-2xl" />
        <p className="relative text-sm font-medium text-accent">{t("summary.heading", { month: monthName })}</p>
        <p className="relative mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          <CountUp value={total} format={(n) => fmt.money(n)} duration={1.4} />
        </p>
        <div className="relative mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {budget > 0 && <span>{t("summary.ofBudget", { amount: fmt.money(budget) })}</span>}
          {last > 0 && (
            <span className={cn("inline-flex items-center gap-1", change <= 0 ? "text-success" : "text-warning")}>
              {change <= 0 ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
              {t("summary.vsLast", { change: fmt.percent(Math.abs(change)), month: prevName })}
            </span>
          )}
          <span>{t("summary.claims", { count: fmt.number(p.claimCount) })}</span>
        </div>
        {total === 0 ? (
          <p className="relative mt-6 text-muted">{t("summary.nothing", { month: monthName })}</p>
        ) : (
          <ul className="relative mt-6 space-y-2">
            {story.map((s, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: dir === "rtl" ? 8 : -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }} className="flex items-start gap-2.5 text-base">
                <Sparkles className="mt-1 size-4 shrink-0 text-accent" />
                {s}
              </motion.li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-[var(--gap)] grid gap-[var(--gap)] md:grid-cols-2">
        <Card>
          <CardHeader title={t("summary.categories")} />
          <CardBody>
            <ul className="space-y-3">
              {ranked.map((c, i) => (
                <li key={c.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <CategoryIcon icon={c.icon} className="size-4 text-muted" />
                      {pick(locale, c.name, c.nameAr)}
                    </span>
                    <span className="tabular text-muted">
                      <span className="font-medium text-fg">{fmt.money(c.spent)}</span> · {fmt.percent(c.spent / (total || 1))}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
                    <motion.div className={cn("h-full rounded-full", c.budget && c.spent > c.budget ? "bg-danger" : "bg-accent")} initial={{ width: 0 }} animate={{ width: `${(c.spent / ranked[0].spent) * 100}%` }} transition={{ delay: 0.1 + i * 0.05, duration: 0.8 }} />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("summary.people")} />
          <CardBody>
            <ul className="space-y-3">
              {p.people.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  <Avatar name={u.name} color={u.avatarColor} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{pick(locale, u.name, u.nameAr)}</span>
                      <span className="tabular font-medium">{fmt.money(u.amount)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                        <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(u.amount / (p.people[0]?.amount || 1)) * 100}%` }} transition={{ duration: 0.8 }} />
                      </div>
                      <span className="text-xs text-muted">{t("summary.claims", { count: fmt.number(u.count) })}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("summary.biggest")} />
          <CardBody className="pt-3">
            <ul className="-mx-2 divide-y divide-line">
              {p.biggest.map((b) => (
                <li key={b.id}>
                  <Link href={`/w/${p.slug}/claims/${b.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-sunken">
                    <CategoryIcon icon={b.icon} className="size-4 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{b.merchant}</span>
                      <span className="block text-xs text-muted">
                        {fmt.date(b.spentOn)} · {pick(locale, b.by, b.byAr).split(" ")[0]}
                      </span>
                    </span>
                    <span className="tabular text-sm font-semibold">{fmt.money(b.amount, { decimals: "auto" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("summary.billsPaid")} action={<span className="tabular text-sm font-semibold">{fmt.money(billsTotal)}</span>} />
          <CardBody className="pt-3">
            <ul className="divide-y divide-line">
              {p.bills.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {pick(locale, b.name, b.nameAr)} <span className="text-xs text-muted">· {fmt.date(b.paidOn)}</span>
                  </span>
                  <span className="tabular">{fmt.money(b.amount, { decimals: "auto" })}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-[var(--gap)]">
        <CardHeader title={t("summary.daily")} />
        <CardBody>
          <div className="flex h-36 items-end gap-[3px]" dir="ltr" role="img" aria-label={t("summary.daily")}>
            {p.daily.map((v, i) => (
              <motion.div
                key={i}
                title={`${i + 1}: ${fmt.money(v)}`}
                className="min-w-0 flex-1 rounded-t-[3px] bg-accent/80 hover:bg-accent"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(v ? 4 : 1, (v / maxDay) * 100)}%` }}
                transition={{ delay: i * 0.012, duration: 0.5 }}
                style={{ opacity: v ? 1 : 0.25 }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[0.7rem] text-subtle" dir="ltr">
            <span>1</span>
            <span>{Math.ceil(p.daily.length / 2)}</span>
            <span>{p.daily.length}</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
