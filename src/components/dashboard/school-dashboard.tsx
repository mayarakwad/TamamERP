"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { AlertTriangle, Bus, Cake, CalendarCheck, CheckCircle2, ClipboardList, Clock, FileText, GraduationCap, IdCard, Inbox, Megaphone, NotebookPen, PartyPopper, Pin, Plane, Receipt, School, Sparkles, UserRoundCheck, Users, XCircle } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { LiveWallpaper } from "@/components/appearance/live-wallpaper";
import { CountUp } from "@/components/motion/count-up";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import type { SchoolBriefKind, SchoolDashboardData } from "@/lib/school/dashboard";
import type { DashboardLayout } from "@/app/actions/dashboard";
import { DashboardGrid, type Widget } from "./grid";
import { Greeting } from "./home-dashboard";

const BRIEF_ICON: Record<SchoolBriefKind, typeof Sparkles> = { roll: CalendarCheck, bus: Bus, fees: Receipt, applications: ClipboardList, birthday: Cake, absent: XCircle, doc: IdCard, marks: NotebookPen, comments: FileText, child: AlertTriangle, good: PartyPopper };
const BRIEF_TONE: Record<SchoolBriefKind, string> = { roll: "text-warning bg-warning/15", bus: "text-warning bg-warning/15", fees: "text-danger bg-danger/10", applications: "text-accent bg-accent-soft", birthday: "text-accent bg-accent-soft", absent: "text-danger bg-danger/10", doc: "text-warning bg-warning/15", marks: "text-info bg-info/15", comments: "text-info bg-info/15", child: "text-danger bg-danger/10", good: "text-success bg-success/15" };
const WAIT_ICON: Record<string, typeof Inbox> = { applications: ClipboardList, leave: Plane, claims: Receipt, reports: FileText };
const TODAY_TONE: Record<string, string> = { present: "text-success", absent: "text-danger", late: "text-warning", excused: "text-info", notTaken: "text-muted", noSchool: "text-muted" };

export function SchoolDashboard({ slug, data, now, greeting, firstName, layout }: { slug: string; data: SchoolDashboardData; now: string; greeting: "morning" | "afternoon" | "evening"; firstName: string; layout: DashboardLayout | null }) {
  const { t, fmt } = useI18n();
  const reduced = useReducedMotion();
  const base = `/w/${slug}`;
  const k = data.kpis;
  const nowTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(now));

  const briefText = (b: SchoolDashboardData["brief"][number]) => {
    const v = b.vars;
    switch (b.kind) {
      case "roll":
        return Number(v.count) > 1 ? t("schooldash.briefRollMany", { count: fmt.number(Number(v.count)), first: String(v.first), rest: String(v.rest) }) : t("schooldash.briefRoll", { first: String(v.first) });
      case "bus":
        return t("schooldash.briefBus", { name: String(v.name) });
      case "fees":
        return data.children ? t("schooldash.briefFeesMine", { amount: fmt.money(Number(v.amount)) }) : t("schooldash.briefFees", { count: fmt.number(Number(v.count)), amount: fmt.money(Number(v.amount)) });
      case "applications":
        return t("schooldash.briefApplications", { count: fmt.number(Number(v.count)) });
      case "birthday":
        return Number(v.count) > 1 ? t("schooldash.briefBirthday", { first: String(v.first), count: fmt.number(Number(v.count)) }) : t("schooldash.briefBirthdayOne", { first: String(v.first) });
      case "doc":
        return t("schooldash.briefDoc", { count: fmt.number(Number(v.count)) });
      case "marks":
        return t("schooldash.briefMarks", { name: String(v.name), className: String(v.className) });
      case "comments":
        return t("schooldash.briefComments", { done: fmt.number(Number(v.done)), total: fmt.number(Number(v.total)) });
      case "child":
        return t("schooldash.briefChild", { name: String(v.name) });
      default:
        return t("schooldash.briefGood");
    }
  };

  const widgets: Widget[] = [
    {
      id: "briefing",
      title: t("dashboard.briefing"),
      span: "half",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("dashboard.briefing")} icon={<Sparkles className="size-4" />} />
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
  ];

  if (data.waiting.length || k) {
    widgets.push({
      id: "waiting",
      title: t("schooldash.waiting"),
      span: "narrow",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("schooldash.waiting")} icon={<Inbox className="size-4" />} />
          <CardBody className="space-y-1">
            {data.waiting.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t("schooldash.nothingWaiting")}</p>
            ) : (
              data.waiting.map((w) => {
                const Icon = WAIT_ICON[w.key] ?? Inbox;
                return (
                  <Link key={w.key} href={`${base}/${w.href}`} className="flex items-center gap-3 rounded-xl p-2 text-sm transition hover:bg-sunken">
                    <Icon className="size-4 text-muted" />
                    <span className="flex-1">{t(`schooldash.wait_${w.key}` as MessageKey)}</span>
                    <span className="grid min-w-7 place-items-center rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg tabular">{fmt.number(w.count)}</span>
                  </Link>
                );
              })
            )}
          </CardBody>
        </Card>
      ),
    });
  }

  if (data.children) {
    widgets.push({
      id: "children",
      title: t("schooldash.children"),
      span: "full",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("schooldash.children")} icon={<UserRoundCheck className="size-4" />} action={<Link href={`${base}/children`} className="text-sm text-accent hover:underline">{t("common.viewAll")}</Link>} />
          <CardBody className="grid gap-[var(--gap)] sm:grid-cols-2">
            {data.children.map((c, i) => (
              <motion.div key={c.id} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <Link href={`${base}/children`} className="lift flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
                  <Avatar name={c.plainName} color={c.color} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold">{c.name.split(" ")[0]}</p>
                    <p className="text-sm text-muted">{c.className}</p>
                    <p className={cn("mt-1 text-sm font-medium", TODAY_TONE[c.today])}>{t(`children.${c.today}` as MessageKey)}</p>
                    {c.nextLesson && <p className="text-xs text-subtle">{t("children.nextLesson", { subject: c.nextLesson.subject, time: c.nextLesson.time })}</p>}
                  </div>
                  {c.due > 0 && (
                    <div className="text-end">
                      <p className={cn("text-sm font-semibold tabular", c.overdue ? "text-danger" : "")}>{fmt.money(c.due)}</p>
                      <p className="text-xs text-muted">{t("children.fees")}</p>
                    </div>
                  )}
                </Link>
              </motion.div>
            ))}
          </CardBody>
        </Card>
      ),
    });
  }

  if (data.teacher) {
    const tch = data.teacher;
    const current = tch.lessons.find((l) => nowTime >= l.start && nowTime < l.end);
    widgets.push({
      id: "myday",
      title: t("schooldash.myDay"),
      span: "half",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("schooldash.lessons")} icon={<Clock className="size-4" />} action={<Link href={`${base}/classes`} className="text-sm text-accent hover:underline">{t("timetable.myWeek")}</Link>} />
          <CardBody className="space-y-3">
            {tch.homeroom && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-sunken px-3 py-2.5">
                <span className="text-sm font-medium">{t("schooldash.homeroom", { class: tch.homeroom.label })}</span>
                {tch.homeroom.taken ? (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3" /> {t("schooldash.rollDone", { absent: tch.homeroom.absent })}
                  </Badge>
                ) : (
                  <Link href={`${base}/attendance?section=${tch.homeroom.id}`} className={buttonClass("primary", "sm")}>
                    <CalendarCheck className="size-4" /> {t("schooldash.takeRoll")}
                  </Link>
                )}
              </div>
            )}
            {tch.lessons.length ? (
              <ol className="space-y-1.5">
                {tch.lessons.map((l) => {
                  const past = l.end <= nowTime;
                  const isNow = current?.period === l.period;
                  return (
                    <li key={l.period}>
                      <Link href={`${base}/classes/${l.sectionId}`} className={cn("flex items-center gap-3 rounded-xl border-s-[3px] px-3 py-2 text-sm transition hover:bg-sunken", past && "opacity-50", isNow && "bg-accent-soft")} style={{ borderInlineStartColor: l.color ?? "var(--accent)" }}>
                        <span className="w-12 shrink-0 text-xs tabular text-muted" dir="ltr">
                          {l.start}
                        </span>
                        <span className="flex-1 font-medium">{l.subject}</span>
                        <span className="tabular text-muted">{l.className}</span>
                        {isNow && <Badge tone="accent">{t("timetable.now")}</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="py-4 text-center text-sm text-muted">{t("schooldash.noLessons")}</p>
            )}
          </CardBody>
        </Card>
      ),
    });
    widgets.push({
      id: "tomark",
      title: t("schooldash.toMark"),
      span: "narrow",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("schooldash.toMark")} icon={<NotebookPen className="size-4" />} />
          <CardBody className="space-y-1.5">
            {tch.toMark.length ? (
              tch.toMark.map((m) => (
                <Link key={`${m.sectionId}${m.subjectId}${m.name}`} href={`${base}/exams/gradebook?section=${m.sectionId}&subject=${m.subjectId}`} className="block rounded-xl p-2 text-sm transition hover:bg-sunken">
                  <span className="block font-medium">{m.name}</span>
                  <span className="block text-xs text-muted">
                    {m.label} · {fmt.date(m.date, "short")}
                  </span>
                </Link>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted">
                <CheckCircle2 className="mx-auto mb-1 size-5 text-success" />
                {t("schooldash.allMarked")}
              </p>
            )}
            {tch.comments && (
              <Link href={`${base}/exams/report-cards?section=${tch.homeroom?.id ?? ""}`} className="mt-2 block rounded-xl bg-sunken p-2.5 text-xs">
                {t("schooldash.briefComments", { done: tch.comments.done, total: tch.comments.total })}
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${tch.comments.total ? (tch.comments.done / tch.comments.total) * 100 : 0}%` }} />
                </div>
              </Link>
            )}
          </CardBody>
        </Card>
      ),
    });
  }

  if (k) {
    const tiles = [
      { label: t("schooldash.students"), value: k.students, money: false, hint: undefined as string | undefined, icon: GraduationCap },
      { label: t("schooldash.attendanceToday"), value: (k.attendance ?? 0) * 1000, pct: true, hint: t("schooldash.rolls", { taken: k.rollsTaken, total: k.sections }), icon: CalendarCheck },
      ...(k.billed ? [{ label: t("schooldash.feesCollected"), value: k.collected, money: true, hint: t("schooldash.ofBilled", { amount: fmt.money(k.billed, { compact: true }) }), icon: Receipt }] : []),
      ...(k.billed ? [{ label: t("schooldash.overdue"), value: k.overdue, money: true, tone: "text-danger", icon: AlertTriangle }] : []),
      { label: t("schooldash.applications"), value: k.applications, icon: ClipboardList },
      { label: t("schooldash.staff"), value: k.staff, icon: Users },
    ] as { label: string; value: number; money?: boolean; pct?: boolean; hint?: string; tone?: string; icon: typeof Users }[];
    widgets.push({
      id: "kpis",
      title: t("schooldash.students"),
      span: "full",
      node: (
        <div className="grid gap-[var(--gap)] sm:grid-cols-3 2xl:grid-cols-6">
          {tiles.map((x, i) => (
            <motion.div key={x.label} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card glass lift className="h-full">
                <CardBody>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <x.icon className="size-3.5" /> {x.label}
                  </p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular", x.tone)}>
                    <CountUp value={x.value} format={(n) => (x.pct ? fmt.percent(n / 1000, 1) : x.money ? fmt.money(Math.round(n), { compact: n >= 1_000_000 }) : fmt.number(Math.round(n)))} />
                  </p>
                  {x.hint && <p className="mt-0.5 truncate text-xs text-subtle">{x.hint}</p>}
                </CardBody>
              </Card>
            </motion.div>
          ))}
        </div>
      ),
    });
  }

  if (data.trend.length > 1) {
    const min = Math.min(...data.trend.map((d) => d.rate), 0.9);
    const span = Math.max(0.02, 1 - min);
    const w = 600;
    const h = 150;
    const pts = data.trend.map((d, i) => [(i / (data.trend.length - 1)) * w, h - ((d.rate - min) / span) * (h - 16) - 8] as const);
    const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const avg = data.trend.reduce((s, d) => s + d.rate, 0) / data.trend.length;
    widgets.push({
      id: "trend",
      title: t("schooldash.trend"),
      span: "half",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("schooldash.trend")} icon={<CalendarCheck className="size-4" />} action={<span className="text-sm font-semibold tabular">{fmt.percent(avg, 1)}</span>} />
          <CardBody>
            <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img" aria-label={t("schooldash.trend")}>
              <defs>
                <linearGradient id="sd-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#sd-fill)" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
              <motion.path d={path} fill="none" stroke="var(--accent)" vectorEffect="non-scaling-stroke" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeOut" }} />
            </svg>
          </CardBody>
        </Card>
      ),
    });
  }

  if (data.byGrade.length) {
    const max = Math.max(...data.byGrade.map((g) => g.count));
    widgets.push({
      id: "grades",
      title: t("schooldash.byGrade"),
      span: "narrow",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("schooldash.byGrade")} icon={<GraduationCap className="size-4" />} />
          <CardBody>
            <div className="flex h-40 items-end gap-1">
              {data.byGrade.map((g, i) => (
                <div key={g.name} className="flex flex-1 flex-col items-center gap-1" title={`${g.name}: ${g.count}`}>
                  <span className="text-[0.6rem] tabular text-muted">{g.count}</span>
                  <motion.div className="w-full rounded-t-md bg-accent" initial={reduced ? false : { height: 0 }} animate={{ height: `${(g.count / max) * 110}px` }} transition={{ duration: 0.6, delay: i * 0.03 }} />
                  <span className="text-[0.6rem] text-subtle">{g.name}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ),
    });
  }

  if (data.campuses.length) {
    widgets.push({
      id: "campuses",
      title: t("schooldash.campuses"),
      span: "full",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("schooldash.campuses")} icon={<School className="size-4" />} action={<Link href={`${base}/campuses`} className="text-sm text-accent hover:underline">{t("common.viewAll")}</Link>} />
          <CardBody className="grid gap-[var(--gap)] md:grid-cols-3">
            {data.campuses.map((c, i) => (
              <motion.div key={c.id} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="rounded-2xl border border-line bg-surface p-4">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="size-3 rounded-full" style={{ background: c.color ?? "var(--accent)" }} />
                  {c.name}
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  {[
                    [t("schooldash.students"), `${fmt.number(c.students)} / ${fmt.number(c.capacity)}`, c.capacity ? c.students / c.capacity : 0],
                    [t("schooldash.attendanceToday"), c.attendance != null ? fmt.percent(c.attendance, 1) : "—", c.attendance ?? 0],
                    [t("schooldash.feesCollected"), c.billed ? fmt.percent(c.collected / c.billed) : "—", c.billed ? c.collected / c.billed : 0],
                  ].map(([label, value, pct]) => (
                    <div key={String(label)}>
                      <div className="flex justify-between">
                        <dt className="text-muted">{label}</dt>
                        <dd className="font-medium tabular">{value}</dd>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                        <motion.div className="h-full rounded-full" style={{ background: c.color ?? "var(--accent)" }} initial={reduced ? false : { width: 0 }} animate={{ width: `${Number(pct) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 + i * 0.08 }} />
                      </div>
                    </div>
                  ))}
                </dl>
              </motion.div>
            ))}
          </CardBody>
        </Card>
      ),
    });
  }

  widgets.push({
    id: "announcements",
    title: t("schooldash.announcements"),
    span: data.children ? "full" : "half",
    node: (
      <Card glass className="h-full">
        <CardHeader title={t("schooldash.announcements")} icon={<Megaphone className="size-4" />} action={<Link href={`${base}/announcements`} className="text-sm text-accent hover:underline">{t("common.viewAll")}</Link>} />
        <CardBody className="space-y-3">
          {data.announcements.map((a) => (
            <Link key={a.id} href={`${base}/announcements`} className="block rounded-xl p-2 transition hover:bg-sunken">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {a.pinned && <Pin className="size-3.5 text-accent" />}
                {a.title}
              </p>
              <p className="line-clamp-2 text-xs text-muted">{a.body}</p>
              <p className="mt-0.5 text-[0.7rem] text-subtle">{fmt.date(a.publishedAt, "short")}</p>
            </Link>
          ))}
        </CardBody>
      </Card>
    ),
  });

  return (
    <>
      <LiveWallpaper scope="dashboard" />
      <DashboardGrid slug={slug} widgets={widgets} saved={layout} header={<Greeting greeting={greeting} firstName={firstName} now={now} />} />
    </>
  );
}
