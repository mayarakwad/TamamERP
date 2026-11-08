"use client";

import { AskFlow } from "@/components/flow/ask-flow";
import Link from "next/link";
import { motion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock,
  Hourglass,
  ShieldAlert,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { useI18n, usePrefs, useReducedMotion } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/ui/category-icon";
import { CountUp } from "@/components/motion/count-up";
import { LiveWallpaper } from "@/components/appearance/live-wallpaper";
import { pick } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { HomeDashboardData } from "@/lib/home/dashboard";
import type { DashboardLayout } from "@/app/actions/dashboard";
import { DashboardGrid, type Widget } from "./grid";

interface Props {
  slug: string;
  data: HomeDashboardData;
  now: string;
  greeting: "morning" | "afternoon" | "evening";
  firstName: string;
  canApprove: boolean;
  layout: DashboardLayout | null;
}

export function HomeDashboard({ slug, data, now, greeting, firstName, canApprove, layout }: Props) {
  const { t } = useI18n();
  const base = `/w/${slug}`;
  const widgets: Widget[] = [
    { id: "briefing", title: t("dashboard.briefing"), span: "half", node: <Briefing data={data} now={now} canApprove={canApprove} base={base} /> },
    { id: "pending", title: t("dashboard.pendingClaims"), span: "narrow", node: <PendingClaims data={data} now={now} base={base} /> },
    { id: "kpis", title: t("dashboard.spentThisMonth"), span: "full", node: <Kpis data={data} now={now} /> },
    { id: "trend", title: t("dashboard.spendingTrend"), span: "wide", node: <Trend data={data} /> },
    { id: "where", title: t("dashboard.byCategory"), span: "third", node: <WhereItWent data={data} /> },
    { id: "budgets", title: t("dashboard.budgetHealth"), span: "half", node: <Budgets data={data} /> },
    { id: "bills", title: t("dashboard.upcomingBills"), span: "narrow", node: <UpcomingBills data={data} now={now} /> },
    { id: "activity", title: t("dashboard.recentActivity"), span: "half", node: <Activity data={data} now={now} /> },
    { id: "warranties", title: t("dashboard.warranties"), span: "narrow", node: <Warranties data={data} now={now} /> },
  ];

  return (
    <>
      <LiveWallpaper scope="dashboard" />
      <DashboardGrid slug={slug} widgets={widgets} saved={layout} header={<Greeting greeting={greeting} firstName={firstName} now={now} />} />
    </>
  );
}

export function Greeting({ greeting, firstName, now }: { greeting: "morning" | "afternoon" | "evening"; firstName: string; now: string }) {
  const { t, fmt, locale } = useI18n();
  const { prefs } = usePrefs();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t(`greeting.${greeting}`)}
        {locale === "ar" ? "، " : ", "}
        {firstName}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {fmt.date(now, "full")}
        {prefs.showHijri && (
          <>
            <span className="mx-2 text-subtle">·</span>
            <span>{fmt.hijri(now)}</span>
          </>
        )}
      </p>
    </div>
  );
}

// ───────────────────────── Widgets ─────────────────────────

function Briefing({ data, now, canApprove, base }: { data: HomeDashboardData; now: string; canApprove: boolean; base: string }) {
  const { t, fmt, locale } = useI18n();
  const over = data.byCategory.filter((c) => c.budget > 0 && c.spent > c.budget);
  const nextWarranty = data.warranties[0];
  const items: { icon: React.ReactNode; text: string; href: string; tone: string }[] = [];

  if (data.pendingCount > 0) {
    items.push({
      icon: <Hourglass className="size-4" />,
      text: canApprove
        ? data.pendingCount === 1
          ? t("dashboard.claimWaiting")
          : t("dashboard.claimsWaiting", { count: fmt.number(data.pendingCount) })
        : data.pendingCount === 1
          ? t("dashboard.yourClaimWaiting")
          : t("dashboard.yourClaimsWaiting", { count: fmt.number(data.pendingCount) }),
      href: `${base}/claims`,
      tone: "text-accent bg-accent-soft",
    });
  }
  if (data.billsDueSoon > 0) {
    items.push({
      icon: <CalendarClock className="size-4" />,
      text: data.billsDueSoon === 1 ? t("dashboard.billThisWeek") : t("dashboard.billsThisWeek", { count: fmt.number(data.billsDueSoon) }),
      href: `${base}/bills`,
      tone: "text-info bg-[color-mix(in_oklch,var(--info)_12%,var(--surface))]",
    });
  }
  if (over.length === 1) {
    items.push({ icon: <AlertTriangle className="size-4" />, text: t("dashboard.budgetOver", { category: pick(locale, over[0].name, over[0].nameAr) }), href: `${base}/budgets`, tone: "text-danger bg-[color-mix(in_oklch,var(--danger)_12%,var(--surface))]" });
  } else if (over.length > 1) {
    items.push({ icon: <AlertTriangle className="size-4" />, text: t("dashboard.budgetsOver", { count: fmt.number(over.length) }), href: `${base}/budgets`, tone: "text-danger bg-[color-mix(in_oklch,var(--danger)_12%,var(--surface))]" });
  }
  if (nextWarranty) {
    items.push({
      icon: <ShieldAlert className="size-4" />,
      text: t("dashboard.warrantyEnding", { name: pick(locale, nextWarranty.name, nextWarranty.nameAr), when: fmt.relative(nextWarranty.warrantyUntil, new Date(now)) }),
      href: `${base}/things`,
      tone: "text-warning bg-[color-mix(in_oklch,var(--warning)_14%,var(--surface))]",
    });
  }

  return (
    <Card glass className="h-full overflow-hidden">
      <CardHeader title={t("dashboard.briefing")} icon={<Sparkles className="size-4" />} action={<AskFlow prompt="flow.s_attention" />} />
      <CardBody>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <CheckCircle2 className="size-4 text-success" /> {t("dashboard.allCaughtUp")}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: locale === "ar" ? 8 : -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07 }}>
                <Link href={it.href} className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-sunken">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", it.tone)}>{it.icon}</span>
                  <span className="text-sm text-fg">{it.text}</span>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const reduced = useReducedMotion();
  const max = Math.max(...values, 1);
  const w = 76;
  const h = 26;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - (v / max) * (h - 8)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible rtl:-scale-x-100" aria-hidden>
      <motion.path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeOut" }} />
      <motion.circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" initial={{ scale: reduced ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: reduced ? 0 : 1.1 }} />
    </svg>
  );
}

function Kpis({ data, now }: { data: HomeDashboardData; now: string }) {
  const { t, fmt, locale } = useI18n();
  const money = (n: number) => fmt.money(n);
  const left = data.totalBudget - data.totalSpent;
  const used = data.totalBudget ? data.totalSpent / data.totalBudget : 0;
  const change = data.lastMonthToDate ? (data.totalSpent - data.lastMonthToDate) / data.lastMonthToDate : 0;
  const pendingAmount = data.pendingClaims.reduce((s, c) => s + c.amount, 0);
  const nextBill = data.upcoming[0];

  const tiles: { label: string; icon: React.ReactNode; value: React.ReactNode; foot: React.ReactNode; corner?: React.ReactNode; bar?: React.ReactNode }[] = [
    {
      label: t("dashboard.spentThisMonth"),
      icon: <Wallet className="size-4" />,
      value: <CountUp value={data.totalSpent} format={money} />,
      foot: (
        <span className="inline-flex items-center gap-1">
          {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {t("dashboard.vsLastMonth", { change: fmt.percent(Math.abs(change)) })}
        </span>
      ),
      corner: <Sparkline values={data.trend.map((p) => p.amount)} />,
    },
    {
      label: left >= 0 ? t("dashboard.budgetLeft") : t("dashboard.overBudget"),
      icon: left >= 0 ? <Zap className="size-4" /> : <AlertTriangle className="size-4 text-danger" />,
      value: <CountUp value={Math.abs(left)} format={money} className={left < 0 ? "text-danger" : undefined} />,
      foot: t("dashboard.ofBudget", { amount: fmt.money(data.totalBudget) }),
      bar: (
        <div className="h-2 w-full overflow-hidden rounded-full bg-sunken" role="img" aria-label={fmt.percent(used)}>
          <motion.div className={cn("h-full rounded-full", used > 1 ? "bg-danger" : used > 0.85 ? "bg-warning" : "bg-accent")} initial={{ width: 0 }} animate={{ width: `${Math.min(100, used * 100)}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      ),
    },
    {
      label: t("dashboard.pendingClaims"),
      icon: <Hourglass className="size-4" />,
      value: <CountUp value={data.pendingCount} format={(n) => fmt.number(n)} />,
      foot: fmt.money(pendingAmount, { decimals: "auto" }),
    },
    {
      label: t("dashboard.billsDue"),
      icon: <BellRing className="size-4" />,
      value: <CountUp value={data.billsDueSoon} format={(n) => fmt.number(n)} />,
      foot: nextBill ? `${pick(locale, nextBill.name, nextBill.nameAr)} · ${fmt.relative(nextBill.dueOn, new Date(now))}` : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-[var(--gap)] xl:grid-cols-4">
      {tiles.map((tile, i) => (
        <Card key={i} glass lift className="flex flex-col p-[var(--pad)]">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-medium text-muted">
              <span className="text-subtle">{tile.icon}</span>
              {tile.label}
            </p>
            {tile.corner && <div className="hidden sm:block">{tile.corner}</div>}
          </div>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-[1.7rem]">{tile.value}</p>
          {tile.bar && <div className="mt-2.5">{tile.bar}</div>}
          <p className="mt-auto truncate pt-1.5 text-xs text-muted">{tile.foot}</p>
        </Card>
      ))}
    </div>
  );
}

function Trend({ data }: { data: HomeDashboardData }) {
  const { t, fmt, dir } = useI18n();
  const reduced = useReducedMotion();
  const points = data.trend.map((p) => ({ ...p, label: fmt.monthShort(p.date) }));
  return (
    <Card glass className="h-full">
      <CardHeader title={t("dashboard.spendingTrend")} />
      <CardBody className="pt-2">
        <div className="h-60" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.28 }} />
                  <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
              <XAxis dataKey="label" reversed={dir === "rtl"} axisLine={false} tickLine={false} tick={{ fill: "var(--subtle)", fontSize: 12 }} dy={6} />
              <YAxis
                orientation={dir === "rtl" ? "right" : "left"}
                axisLine={false}
                tickLine={false}
                width={64}
                tick={{ fill: "var(--subtle)", fontSize: 12 }}
                tickFormatter={(v: number) => fmt.money(v, { compact: true })}
              />
              <Tooltip
                cursor={{ stroke: "var(--accent-line)", strokeWidth: 1 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lift">
                      <p className="text-xs text-muted">{fmt.monthName(payload[0].payload.date)}</p>
                      <p className="tabular font-semibold">{fmt.money(payload[0].payload.amount)}</p>
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#trend-fill)"
                isAnimationActive={!reduced}
                animationDuration={1200}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2, fill: "var(--accent)" }}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}

function WhereItWent({ data }: { data: HomeDashboardData }) {
  const { t, fmt, locale } = useI18n();
  const withSpend = data.byCategory.filter((c) => c.spent > 0);
  const top = withSpend.slice(0, 5);
  const rest = withSpend.slice(5).reduce((s, c) => s + c.spent, 0);
  const rows = [...top.map((c) => ({ key: c.key, label: pick(locale, c.name, c.nameAr), icon: c.icon, spent: c.spent })), ...(rest ? [{ key: "rest", label: locale === "ar" ? "أخرى" : "Everything else", icon: "circle-ellipsis", spent: rest }] : [])];
  const max = Math.max(...rows.map((r) => r.spent), 1);
  const total = data.totalSpent || 1;
  return (
    <Card glass className="h-full">
      <CardHeader title={t("dashboard.byCategory")} />
      <CardBody>
        {rows.length === 0 && <EmptyNote>{t("dashboard.emptyWhere")}</EmptyNote>}
        <ul className="space-y-3.5">
          {rows.map((r, i) => (
            <li key={r.key}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryIcon icon={r.icon} className="size-4 shrink-0 text-muted" />
                  <span className="truncate">{r.label}</span>
                </span>
                <span className="tabular shrink-0 text-muted">
                  <span className="font-medium text-fg">{fmt.money(r.spent)}</span> · {fmt.percent(r.spent / total)}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
                <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(r.spent / max) * 100}%` }} transition={{ delay: 0.1 + i * 0.06, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function Budgets({ data }: { data: HomeDashboardData }) {
  const { t, fmt, locale } = useI18n();
  const rows = data.byCategory
    .filter((c) => c.budget > 0 && (c.spent > 0 || c.pending > 0))
    .map((c) => ({ ...c, used: c.spent / c.budget }))
    .sort((a, b) => b.used - a.used)
    .slice(0, 6);
  return (
    <Card glass className="h-full">
      <CardHeader title={t("dashboard.budgetHealth")} />
      <CardBody className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {rows.length === 0 && <EmptyNote className="sm:col-span-2">{t("dashboard.emptyBudgets")}</EmptyNote>}
        {rows.map((c, i) => {
          const over = c.used > 1;
          const near = !over && c.used >= 0.85;
          const pendingPct = Math.min(100 - Math.min(100, c.used * 100), (c.pending / c.budget) * 100);
          return (
            <div key={c.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sunken text-muted">
                    <CategoryIcon icon={c.icon} className="size-3.5" />
                  </span>
                  <span className="truncate font-medium">{pick(locale, c.name, c.nameAr)}</span>
                </span>
                {over ? (
                  <Badge tone="danger">
                    <AlertTriangle className="size-3" /> {t("dashboard.overBudget")}
                  </Badge>
                ) : near ? (
                  <Badge tone="warning">
                    <Clock className="size-3" /> {fmt.percent(c.used)}
                  </Badge>
                ) : (
                  <span className="tabular text-xs text-muted">{fmt.percent(c.used)}</span>
                )}
              </div>
              <div className="mt-2 flex h-2 gap-[2px] overflow-hidden rounded-full bg-sunken">
                <motion.div
                  className={cn("h-full rounded-full", over ? "bg-danger" : near ? "bg-warning" : "bg-accent")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, c.used * 100)}%` }}
                  transition={{ delay: 0.1 + i * 0.05, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                />
                {pendingPct > 0 && (
                  <motion.div
                    className="h-full rounded-full bg-[repeating-linear-gradient(135deg,var(--accent-line)_0_3px,transparent_3px_6px)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${pendingPct}%` }}
                    transition={{ delay: 0.6 + i * 0.05, duration: 0.6 }}
                    title={t("dashboard.pendingClaims")}
                  />
                )}
              </div>
              <p className="tabular mt-1.5 text-xs text-muted">
                {fmt.money(c.spent)} <span className="text-subtle">/ {fmt.money(c.budget)}</span>
              </p>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

function PendingClaims({ data, now, base }: { data: HomeDashboardData; now: string; base: string }) {
  const { t, fmt, locale } = useI18n();
  return (
    <Card glass className="h-full">
      <CardHeader
        title={t("dashboard.pendingClaims")}
        icon={<Hourglass className="size-4" />}
        action={
          <Link href={`${base}/claims`} className="text-xs font-medium text-accent hover:underline">
            {t("common.viewAll")}
          </Link>
        }
      />
      <CardBody className="pt-3">
        {data.pendingClaims.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted">
            <CheckCircle2 className="size-4 text-success" /> {t("dashboard.allCaughtUp")}
          </p>
        ) : (
          <ul className="-mx-2 divide-y divide-line">
            {data.pendingClaims.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-2 py-2.5">
                <Avatar name={c.by.name} color={c.by.avatarColor} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.merchant}</p>
                  <p className="truncate text-xs text-muted">
                    {pick(locale, c.by.name, c.by.nameAr).split(" ")[0]} · {pick(locale, c.category.name, c.category.nameAr)} · {fmt.relative(c.spentOn, new Date(now))}
                  </p>
                </div>
                <span className="tabular text-sm font-semibold">{fmt.money(c.amount, { decimals: "auto" })}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function UpcomingBills({ data, now }: { data: HomeDashboardData; now: string }) {
  const { t, fmt, locale } = useI18n();
  const nowD = new Date(now);
  return (
    <Card glass className="h-full">
      <CardHeader title={t("dashboard.upcomingBills")} icon={<CalendarClock className="size-4" />} />
      <CardBody className="pt-3">
        {data.upcoming.length === 0 && <EmptyNote>{t("dashboard.emptyBills")}</EmptyNote>}
        <ul className="-mx-2 divide-y divide-line">
          {data.upcoming.map((b) => {
            const days = Math.ceil((new Date(b.dueOn).getTime() - nowD.getTime()) / 86400_000);
            return (
              <li key={b.id} className="flex items-center gap-3 px-2 py-2.5">
                <div className={cn("grid w-11 shrink-0 place-items-center rounded-xl py-1 text-center", days <= 3 ? "bg-accent-soft text-accent" : "bg-sunken text-muted")}>
                  <span className="text-[0.65rem] leading-none uppercase">{fmt.monthShort(b.dueOn)}</span>
                  <span className="tabular text-base leading-tight font-semibold">{fmt.number(Number(new Intl.DateTimeFormat("en", { day: "numeric", timeZone: "Asia/Qatar" }).format(new Date(b.dueOn))))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pick(locale, b.name, b.nameAr)}</p>
                  <p className="truncate text-xs text-muted">
                    {b.provider} · {t("dashboard.dueIn", { when: fmt.relative(b.dueOn, nowD) })}
                  </p>
                </div>
                <div className="text-end">
                  <p className="tabular text-sm font-semibold">{fmt.money(b.amount)}</p>
                  {b.autopay ? <Badge tone="success">{t("dashboard.autopay")}</Badge> : b.variable ? <span className="text-[0.7rem] text-subtle">{t("dashboard.estimate")}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function Warranties({ data, now }: { data: HomeDashboardData; now: string }) {
  const { t, fmt, locale } = useI18n();
  const nowD = new Date(now);
  return (
    <Card glass className="h-full">
      <CardHeader title={t("dashboard.warranties")} icon={<ShieldAlert className="size-4" />} />
      <CardBody className="pt-3">
        {data.warranties.length === 0 && <EmptyNote>{t("dashboard.emptyWarranties")}</EmptyNote>}
        <ul className="space-y-2.5">
          {data.warranties.map((w) => {
            const days = Math.ceil((new Date(w.warrantyUntil).getTime() - nowD.getTime()) / 86400_000);
            return (
              <li key={w.id} className="flex items-center justify-between gap-3 rounded-xl bg-sunken/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{pick(locale, w.name, w.nameAr)}</p>
                  <p className="truncate text-xs text-muted">
                    {w.store} · {fmt.date(w.warrantyUntil)}
                  </p>
                </div>
                <Badge tone={days <= 30 ? "warning" : "neutral"}>{t("dashboard.expires", { when: fmt.relative(w.warrantyUntil, nowD) })}</Badge>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function Activity({ data, now }: { data: HomeDashboardData; now: string }) {
  const { t, fmt, locale } = useI18n();
  const nowD = new Date(now);
  const icon = (action: string) =>
    action.endsWith("approved") ? <CheckCircle2 className="size-3.5 text-success" /> : action.endsWith("rejected") ? <AlertTriangle className="size-3.5 text-danger" /> : <Clock className="size-3.5 text-subtle" />;
  return (
    <Card glass className="h-full">
      <CardHeader title={t("dashboard.recentActivity")} />
      <CardBody className="pt-3">
        {data.activity.length === 0 ? (
          <p className="text-sm text-muted">{t("dashboard.noActivity")}</p>
        ) : (
          <ol className="relative space-y-3 before:absolute before:inset-y-2 before:start-4 before:w-px before:bg-line">
            {data.activity.map((a) => (
              <li key={a.id} className="relative flex items-start gap-3">
                {a.user ? <Avatar name={a.user.name} color={a.user.avatarColor} size={32} className="ring-4 ring-[var(--surface)]" /> : <span className="size-8" />}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm">
                    <span className="font-medium">{a.user ? pick(locale, a.user.name, a.user.nameAr) : "—"}</span>
                    {locale === "ar" ? " · " : " "}
                    <span className="text-muted">{pick(locale, a.summary ?? a.action, a.summaryAr)}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-subtle">
                    {icon(a.action)} {fmt.relative(a.createdAt, nowD)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}


function EmptyNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted", className)}>{children}</p>;
}
