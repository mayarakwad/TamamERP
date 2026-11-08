"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Eye } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/motion/count-up";
import { cn } from "@/lib/cn";
import { setCampus } from "@/app/actions/school";

interface Campus {
  id: string;
  name: string;
  code: string;
  color: string | null;
  students: number;
  capacity: number;
  classes: number;
  staff: number;
  attendance: number | null;
  trend: number[];
  billed: number;
  collected: number;
  overdue: number;
  buses: number;
  applications: number;
  average: number | null;
}

/** Every campus in its own column, the same measures lined up, so the group director can compare at a glance. */
export function CampusesView({ slug, campuses, days, selected }: { slug: string; campuses: Campus[]; days: string[]; selected: string | null }) {
  const { t, fmt } = useI18n();
  const reduced = useReducedMotion();
  const router = useRouter();
  const [pending, start] = useTransition();
  const focus = (id: string) =>
    start(async () => {
      await setCampus(slug, id);
      router.push(`/w/${slug}`);
    });
  const best = (f: (c: Campus) => number | null) => {
    const vals = campuses.map(f).filter((x): x is number => x != null);
    return vals.length ? Math.max(...vals) : null;
  };
  const rows: { label: string; value: (c: Campus) => number | null; show: (c: Campus) => string; bar?: (c: Campus) => number; highlight?: boolean }[] = [
    { label: t("campusesPage.students"), value: (c) => c.students, show: (c) => `${fmt.number(c.students)} / ${fmt.number(c.capacity)}`, bar: (c) => (c.capacity ? c.students / c.capacity : 0) },
    { label: t("campusesPage.attendance"), value: (c) => c.attendance, show: (c) => (c.attendance != null ? fmt.percent(c.attendance, 1) : "—"), bar: (c) => c.attendance ?? 0, highlight: true },
    { label: t("campusesPage.feesCollected"), value: (c) => (c.billed ? c.collected / c.billed : null), show: (c) => (c.billed ? `${fmt.percent(c.collected / c.billed)} · ${fmt.money(c.collected, { compact: true })}` : "—"), bar: (c) => (c.billed ? c.collected / c.billed : 0), highlight: true },
    { label: t("campusesPage.overdue"), value: (c) => -c.overdue, show: (c) => fmt.money(c.overdue, { compact: true }) },
    { label: t("campusesPage.average"), value: (c) => c.average, show: (c) => (c.average != null ? `${fmt.number(c.average)}%` : "—"), bar: (c) => (c.average ?? 0) / 100, highlight: true },
    { label: t("campusesPage.classes"), value: () => null, show: (c) => fmt.number(c.classes) },
    { label: t("campusesPage.staff"), value: () => null, show: (c) => fmt.number(c.staff) },
    { label: t("campusesPage.buses"), value: () => null, show: (c) => fmt.number(c.buses) },
    { label: t("campusesPage.applications"), value: () => null, show: (c) => fmt.number(c.applications) },
  ];
  // One line per campus on the same chart.
  const w = 640;
  const h = 170;
  const all = campuses.flatMap((c) => c.trend.filter((x) => x > 0));
  const min = Math.min(0.9, ...all);
  const span = Math.max(0.02, 1 - min);
  // Days a campus took no roll (rare) borrow the previous day's figure, so lines don't dip to the floor.
  const line = (raw: number[]) => raw.map((v, i) => v || raw.slice(0, i).reverse().find((x) => x > 0) || min).map((v, i, vals) => `${i ? "L" : "M"}${((i / Math.max(1, vals.length - 1)) * w).toFixed(1)},${(h - ((Math.max(v, min) - min) / span) * (h - 16) - 8).toFixed(1)}`).join(" ");
  return (
    <div className="space-y-[var(--gap)]">
      <PageHeader title={t("campusesPage.title")} subtitle={t("campusesPage.subtitle", { count: campuses.length })} />
      <div className={cn("grid gap-[var(--gap)]", campuses.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
        {campuses.map((c, i) => (
          <motion.div key={c.id} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className={cn("h-full overflow-hidden", selected === c.id && "border-accent")}>
              <div className="h-1.5" style={{ background: c.color ?? "var(--accent)" }} />
              <CardBody className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{c.name}</p>
                    <p className="font-mono text-xs text-subtle">{c.code}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => focus(c.id)} disabled={pending}>
                    <Eye className="size-4" /> {t("campusesPage.open")}
                  </Button>
                </div>
                <p className="text-3xl font-semibold tabular">
                  <CountUp value={c.students} format={(n) => fmt.number(Math.round(n))} />
                  <span className="ms-1.5 text-sm font-normal text-muted">{t("campusesPage.students")}</span>
                </p>
                <dl className="space-y-3 text-sm">
                  {rows.slice(1).map((r) => {
                    const v = r.value(c);
                    const top = r.highlight && v != null && v === best(r.value) && campuses.length > 1;
                    return (
                      <div key={r.label}>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-muted">{r.label}</dt>
                          <dd className={cn("font-medium tabular", top && "text-success")}>
                            {r.show(c)}
                            {top && " ★"}
                          </dd>
                        </div>
                        {r.bar && (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                            <motion.div className="h-full rounded-full" style={{ background: c.color ?? "var(--accent)" }} initial={reduced ? false : { width: 0 }} animate={{ width: `${Math.min(1, r.bar(c)) * 100}%` }} transition={{ duration: 0.9, delay: 0.15 + i * 0.08 }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </dl>
              </CardBody>
            </Card>
          </motion.div>
        ))}
      </div>
      {days.length > 1 && (
        <Card>
          <CardHeader title={t("campusesPage.trend")} />
          <CardBody>
            <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-44 w-full overflow-visible" role="img" aria-label={t("campusesPage.trend")}>
              {campuses.map((c, i) => (
                <motion.path key={c.id} d={line(c.trend)} fill="none" stroke={c.color ?? "var(--accent)"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay: i * 0.15 }} />
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
              {campuses.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5">
                  <span className="h-1 w-4 rounded-full" style={{ background: c.color ?? "var(--accent)" }} />
                  {c.name}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
