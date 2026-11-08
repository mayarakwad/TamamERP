"use client";

import { AskFlow } from "@/components/flow/ask-flow";
import Link from "next/link";
import { motion } from "motion/react";
import { AlertTriangle, BadgeDollarSign, CalendarCheck, Clock, FileClock, HandCoins, IdCard, Inbox, Package, PartyPopper, Plane, Receipt, Sparkles, TrendingDown, TrendingUp, Trophy, Wallet } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LiveWallpaper } from "@/components/appearance/live-wallpaper";
import { CountUp } from "@/components/motion/count-up";
import { InOutChart, MonthBars } from "@/components/business/charts";
import { monthStart } from "@/lib/format";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { BizDashboardData, BriefKind } from "@/lib/biz-dashboard";
import type { DashboardLayout } from "@/app/actions/dashboard";
import { DashboardGrid, type Widget } from "./grid";
import { Greeting } from "./home-dashboard";

const BRIEF_ICON: Record<BriefKind, typeof Sparkles> = { overdue: FileClock, stock: Package, doc: IdCard, payroll: BadgeDollarSign, approve: Inbox, received: HandCoins, leave: Plane, good: PartyPopper };
const BRIEF_TONE: Record<BriefKind, string> = { overdue: "text-danger bg-danger/10", stock: "text-warning bg-warning/15", doc: "text-warning bg-warning/15", payroll: "text-accent bg-accent-soft", approve: "text-accent bg-accent-soft", received: "text-success bg-success/15", leave: "text-info bg-info/15", good: "text-success bg-success/15" };
const WAIT_ICON: Record<string, typeof Inbox> = { claims: Receipt, leave: Plane, receive: Package, drafts: FileClock, bills: Wallet };

export function BusinessDashboard({ slug, data, now, greeting, firstName, layout }: { slug: string; data: BizDashboardData; now: string; greeting: "morning" | "afternoon" | "evening"; firstName: string; layout: DashboardLayout | null }) {
  const { t, fmt, locale } = useI18n();
  const reduced = useReducedMotion();
  const base = `/w/${slug}`;
  const f = data.finance;
  const nowMs = new Date(now).getTime();

  const briefText = (b: BizDashboardData["brief"][number]) => {
    const v = b.vars;
    switch (b.kind) {
      case "overdue":
        return t("bizdash.briefOverdue", { count: fmt.number(Number(v.count)), amount: fmt.money(Number(v.amount)) });
      case "received":
        return t("bizdash.briefReceived", { amount: fmt.money(Number(v.amount)), count: fmt.number(Number(v.count)) });
      case "stock":
        return t(Number(v.count) > 1 ? "bizdash.briefStock" : "bizdash.briefStockOne", { name: String(locale === "ar" ? v.firstAr : v.first), count: fmt.number(Number(v.count) - 1) });
      case "doc":
        return t(v.doc === "qid" ? "bizdash.briefQid" : "bizdash.briefPassport", { name: String(locale === "ar" ? v.nameAr : v.name), days: fmt.number(Number(v.days)) });
      case "payroll":
        return t("bizdash.briefPayroll", { month: fmt.monthName(monthStart(String(v.month))) });
      case "approve":
        return t("bizdash.briefApprove", { count: fmt.number(Number(v.count)) });
      case "leave":
        return t("bizdash.briefLeave", { date: fmt.date(String(v.date)), days: fmt.number(Number(v.days)) });
      default:
        return t("bizdash.briefGood");
    }
  };

  const widgets: Widget[] = [
    {
      id: "briefing",
      title: t("dashboard.briefing"),
      span: "half",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("dashboard.briefing")} icon={<Sparkles className="size-4" />} action={<AskFlow prompt="flow.s_attention" />} />
          <CardBody className="space-y-2">
            {data.brief.map((b, i) => {
              const Icon = BRIEF_ICON[b.kind];
              const inner = (
                <>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", BRIEF_TONE[b.kind])}>
                    <Icon className="size-4" />
                  </span>
                  <span className="text-sm">{briefText(b)}</span>
                </>
              );
              return (
                <motion.div key={i} initial={reduced ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }}>
                  {b.href ? (
                    <Link href={`${base}/${b.href}`} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-sunken">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 p-1.5">{inner}</div>
                  )}
                </motion.div>
              );
            })}
          </CardBody>
        </Card>
      ),
    },
    {
      id: "waiting",
      title: t("bizdash.waiting"),
      span: "narrow",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("bizdash.waiting")} icon={<Inbox className="size-4" />} />
          <CardBody className="space-y-1">
            {data.waiting.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t("bizdash.nothingWaiting")}</p>
            ) : (
              data.waiting.map((w) => {
                const Icon = WAIT_ICON[w.key] ?? Inbox;
                return (
                  <Link key={w.key} href={`${base}/${w.href}`} className="flex items-center gap-3 rounded-xl p-2 text-sm transition hover:bg-sunken">
                    <Icon className="size-4 text-muted" />
                    <span className="flex-1">{t(`bizdash.wait_${w.key}` as MessageKey)}</span>
                    {w.amount != null && <span className="tabular text-xs text-muted">{fmt.money(w.amount)}</span>}
                    <span className="grid min-w-7 place-items-center rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg tabular">{fmt.number(w.count)}</span>
                  </Link>
                );
              })
            )}
          </CardBody>
        </Card>
      ),
    },
  ];

  if (data.me) {
    const me = data.me;
    widgets.push({
      id: "me",
      title: t("bizdash.myDay"),
      span: "narrow",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("bizdash.myDay")} icon={<CalendarCheck className="size-4" />} />
          <CardBody className="space-y-3 text-sm">
            <Link href={`${base}/hr/attendance`} className="flex items-center gap-3 rounded-xl bg-sunken/60 p-3 hover:bg-sunken">
              <Clock className="size-5 text-accent" />
              <span className="flex-1">{me.checkIn ? (me.checkOut ? t("hr.workedFromTo", { from: me.checkIn, to: me.checkOut }) : t("hr.atWorkSince", { time: me.checkIn })) : t("hr.notCheckedIn")}</span>
              {!me.checkIn && <span className="text-xs font-medium text-accent">{t("hr.checkIn")} →</span>}
            </Link>
            <div className="grid grid-cols-2 gap-3">
              <Link href={`${base}/hr/leave`} className="rounded-xl border border-line p-3 hover:bg-sunken">
                <p className="tabular text-2xl font-semibold">{fmt.number(me.leaveLeft)}</p>
                <p className="text-xs text-muted">{t("hr.daysLeft")}</p>
              </Link>
              <Link href={`${base}/hr/payslips`} className="rounded-xl border border-line p-3 hover:bg-sunken">
                <p className="tabular text-lg font-semibold">{me.lastPayslip ? fmt.money(me.lastPayslip.net) : "—"}</p>
                <p className="text-xs text-muted">{me.lastPayslip ? fmt.monthName(monthStart(me.lastPayslip.month)) : t("payroll.noPayslipsYet")}</p>
              </Link>
            </div>
          </CardBody>
        </Card>
      ),
    });
  }

  if (f) {
    const change = f.revenueLast ? (f.revenue - f.revenueLast) / f.revenueLast : null;
    const tiles = [
      { label: t("bizdash.revenueMonth"), value: f.revenue, hint: change != null ? t("bizdash.vsLastMonth", { pct: `${change >= 0 ? "+" : ""}${fmt.percent(change)}` }) : undefined, up: change != null ? change >= 0 : null, href: "reports/pl" },
      { label: t("bizdash.cash"), value: f.cash, hint: t("bizdash.cashHint"), href: "reports/cf" },
      { label: t("bizdash.receivable"), value: f.receivable, hint: f.overdue ? t("bizdash.overdueHint", { amount: fmt.money(f.overdue), count: fmt.number(f.overdueCount) }) : t("bizdash.allCurrent"), danger: f.overdue > 0, href: "reports/ar-aging" },
      { label: t("bizdash.payableSoon"), value: f.payableSoon, hint: t("bizdash.payableHint"), href: "reports/ap-aging" },
      { label: t("bizdash.profitYear"), value: f.netProfit, hint: f.grossMargin != null ? t("bizdash.marginHint", { pct: fmt.percent(f.grossMargin) }) : undefined, href: "reports/pl" },
    ];
    widgets.push(
      {
        id: "kpis",
        title: t("bizdash.kpis"),
        span: "full",
        node: (
          <div className="grid grid-cols-2 gap-[var(--gap)] lg:grid-cols-5">
            {tiles.map((k, i) => (
              <motion.div key={k.label} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                <Link href={`${base}/${k.href}`}>
                  <Card glass lift className="h-full p-[var(--pad)]">
                    <p className="text-xs font-medium text-muted">{k.label}</p>
                    <p className={cn("tabular mt-1 text-xl font-semibold sm:text-2xl", k.value < 0 && "text-danger")}>
                      <CountUp value={k.value} format={(n) => fmt.money(Math.round(n))} />
                    </p>
                    {k.hint && (
                      <p className={cn("mt-0.5 flex items-center gap-1 text-xs", k.danger ? "text-danger" : k.up === true ? "text-success" : k.up === false ? "text-danger" : "text-muted")}>
                        {k.up === true && <TrendingUp className="size-3" />}
                        {k.up === false && <TrendingDown className="size-3" />}
                        {k.danger && <AlertTriangle className="size-3" />}
                        {k.hint}
                      </p>
                    )}
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        ),
      },
      {
        id: "sales",
        title: t("bizdash.salesTrend"),
        span: "wide",
        node: (
          <Card glass className="h-full">
            <CardHeader title={t("bizdash.salesTrend")} icon={<TrendingUp className="size-4" />} />
            <CardBody className="pt-2">
              <MonthBars data={f.sales} height={240} />
            </CardBody>
          </Card>
        ),
      },
      {
        id: "top",
        title: t("bizdash.topCustomers"),
        span: "third",
        node: (
          <Card glass className="h-full">
            <CardHeader title={t("bizdash.topCustomers")} icon={<Trophy className="size-4" />} />
            <CardBody className="space-y-3">
              {f.topCustomers.map((c, i) => (
                <Link key={c.id} href={`${base}/sales/customers/${c.id}`} className="block">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{pick(locale, c.name, c.nameAr)}</span>
                    <span className="tabular font-medium">{fmt.money(c.total, { compact: true })}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <motion.div className="h-full rounded-full bg-accent" initial={reduced ? false : { width: 0 }} animate={{ width: `${(c.total / Math.max(1, f.topCustomers[0].total)) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 * i }} />
                  </div>
                </Link>
              ))}
            </CardBody>
          </Card>
        ),
      },
      {
        id: "cash",
        title: t("bizdash.cashInOut"),
        span: "half",
        node: (
          <Card glass className="h-full">
            <CardHeader title={t("bizdash.cashInOut")} icon={<Wallet className="size-4" />} />
            <CardBody className="pt-2">
              <InOutChart data={f.cashMonths} height={220} inLabel={t("reports.moneyIn")} outLabel={t("reports.moneyOut")} />
            </CardBody>
          </Card>
        ),
      },
    );
  }

  if (data.lowStock) {
    widgets.push({
      id: "stock",
      title: t("bizdash.lowStock"),
      span: "narrow",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("bizdash.lowStock")} icon={<Package className="size-4" />} action={<Link href={`${base}/inventory/items?low=1`} className="text-sm font-medium text-accent hover:underline">{t("common.viewAll")}</Link>} />
          <CardBody className="space-y-2">
            {data.lowStock.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t("bizdash.stockOk")}</p>
            ) : (
              data.lowStock.map((i) => (
                <Link key={i.id} href={`${base}/inventory/items/${i.id}`} className="flex items-center gap-3 rounded-xl p-1.5 text-sm hover:bg-sunken">
                  <span className={cn("grid size-8 place-items-center rounded-lg", i.qty <= 0 ? "bg-danger/10 text-danger" : "bg-warning/15 text-warning")}>
                    <Package className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{pick(locale, i.name, i.nameAr)}</span>
                    <span className="text-xs text-muted">{t("items.reorderAt", { qty: fmt.number(i.reorder / 100), unit: i.unit })}</span>
                  </span>
                  <span className="tabular font-semibold">{fmt.number(i.qty / 100)}</span>
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      ),
    });
  }

  if (data.expiring || data.payroll) {
    widgets.push({
      id: "people",
      title: t("bizdash.people"),
      span: "half",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("bizdash.people")} icon={<IdCard className="size-4" />} />
          <CardBody className="space-y-4">
            {data.payroll && (
              <Link href={`${base}/hr/payroll`} className="flex items-center gap-3 rounded-xl bg-sunken/60 p-3 text-sm hover:bg-sunken">
                <BadgeDollarSign className="size-5 text-accent" />
                <span className="flex-1">
                  {t("bizdash.payrollFor", { month: fmt.monthName(monthStart(data.payroll.month)) })}
                  {data.payroll.status && <span className="block text-xs text-muted">{fmt.money(data.payroll.net)}</span>}
                </span>
                {data.payroll.status ? <StatusBadge status={data.payroll.status} /> : <span className="text-xs font-medium text-accent">{t("bizdash.prepare")} →</span>}
              </Link>
            )}
            {data.expiring && (
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{t("hr.expiringSoon")}</p>
                {data.expiring.length === 0 ? (
                  <p className="text-sm text-muted">{t("bizdash.docsOk")}</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.expiring.slice(0, 5).map((e) => {
                      const days = Math.ceil((new Date(e.date).getTime() - nowMs) / 86400_000);
                      return (
                        <li key={`${e.id}-${e.doc}`}>
                          <Link href={`${base}/hr/employees/${e.id}`} className="flex items-center gap-2 hover:text-accent">
                            <span className="flex-1 truncate">
                              {pick(locale, e.name, e.nameAr)} · {t(e.doc === "qid" ? "hr.qid" : "hr.passport")}
                            </span>
                            <span className={cn("text-xs tabular", days < 0 ? "text-danger" : days < 30 ? "text-warning" : "text-muted")}>{days < 0 ? t("hr.expiredAgo", { days: fmt.number(-days) }) : t("hr.expiresIn", { days: fmt.number(days) })}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      ),
    });
  }

  return (
    <>
      <LiveWallpaper scope="dashboard" />
      <DashboardGrid slug={slug} widgets={widgets} saved={layout} header={<Greeting greeting={greeting} firstName={firstName} now={now} />} />
    </>
  );
}
