"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { BookOpen, Bus, CalendarCheck, CheckCircle2, Clock, FileText, GraduationCap, Landmark, Phone, Printer, Receipt, UserRoundCheck, XCircle } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { pick, type MessageKey } from "@/lib/i18n";
import type { AttendanceSummary, SubjectResult } from "@/lib/school/profile";
import { AttendanceCard, ResultsCard, type FeeSummary } from "./student-detail";
import { TimetableGrid, type GridSlot } from "./timetable-grid";

interface Child {
  id: string;
  name: string;
  plainName: string;
  color: string | null;
  status: string;
  className: string;
  campus: string;
  homeroom: string | null;
  today: string;
  attendance: AttendanceSummary;
  results: SubjectResult[];
  fees: FeeSummary;
  reports: { id: string; term: string; termAr: string | null; year: string; publishedAt: string | null }[];
  bus: { route: string; stop: string; pickup: string | null; dropoff: string | null; driver: string | null; driverPhone: string | null; attendant: string | null; attendantPhone: string | null; color: string | null } | null;
  loans: { id: string; title: string; due: string; overdue: boolean }[];
  timetable: GridSlot[];
}

const TODAY: Record<string, { icon: typeof CheckCircle2; cls: string; key: MessageKey }> = {
  present: { icon: CheckCircle2, cls: "text-success", key: "children.present" },
  absent: { icon: XCircle, cls: "text-danger", key: "children.absent" },
  late: { icon: Clock, cls: "text-warning", key: "children.late" },
  excused: { icon: CalendarCheck, cls: "text-info", key: "children.excused" },
  notTaken: { icon: Clock, cls: "text-muted", key: "children.notTaken" },
  noSchool: { icon: CalendarCheck, cls: "text-muted", key: "children.noSchool" },
};

export function ChildrenView({ slug, termName, kids: children, settings, weekday, nowTime, bank, partyId }: { slug: string; termName: string; kids: Child[]; settings: { days: number[]; periods: { start: string; end: string }[]; breaks: { after: number; label: string; labelAr: string }[] }; weekday: number; nowTime: string; bank: { name: string; iban: string } | null; partyId: string | null }) {
  const { t, fmt, locale } = useI18n();
  const [active, setActive] = useState(children[0]?.id ?? null);
  const c = children.find((x) => x.id === active) ?? null;
  if (!c) return <EmptyState icon={<UserRoundCheck className="size-6" />} title={t("children.title")} body={t("children.noChildren")} />;
  const today = TODAY[c.today] ?? TODAY.notTaken;
  const periodNow = settings.periods.findIndex((p) => nowTime >= p.start && nowTime < p.end) + 1 || null;
  const todays = c.timetable.filter((x) => x.day === weekday).sort((a, b) => a.period - b.period);
  const next = todays.find((x) => settings.periods[x.period - 1] && settings.periods[x.period - 1].start > nowTime);
  return (
    <div className="space-y-[var(--gap)]">
      <PageHeader title={t("children.title")} subtitle={t("children.subtitle")} />
      {children.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-2">
          {children.map((k) => (
            <button key={k.id} role="tab" aria-selected={k.id === active} onClick={() => setActive(k.id)} className={cn("flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-start transition", k.id === active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent-line")}>
              <Avatar name={k.plainName} color={k.color} size={36} />
              <span>
                <span className="block text-sm font-semibold">{k.name.split(" ")[0]}</span>
                <span className="block text-xs text-muted">{k.className}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-[var(--gap)]">
        <Card glass>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={c.plainName} color={c.color} size={64} />
              <div>
                <h2 className="text-xl font-semibold">{c.name}</h2>
                <p className="text-sm text-muted">
                  {c.className} · {c.campus}
                  {c.homeroom ? ` · ${t("children.homeroom")}: ${c.homeroom}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={cn("flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 text-sm font-medium shadow-sm", today.cls)}>
                <today.icon className="size-5" />
                <span>
                  <span className="block text-[0.7rem] font-normal text-muted">{t("children.today")}</span>
                  {t(today.key)}
                </span>
              </div>
              {next && settings.periods[next.period - 1] && (
                <div className="rounded-2xl bg-surface px-3 py-2 text-sm shadow-sm">
                  <span className="block text-[0.7rem] text-muted">{t("timetable.next")}</span>
                  {t("children.nextLesson", { subject: next.title, time: settings.periods[next.period - 1].start })}
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-[var(--gap)] lg:grid-cols-3">
          <div className="space-y-[var(--gap)] lg:col-span-2">
            <AttendanceCard a={c.attendance} termName={termName} compact />
            <ResultsCard results={c.results} termName={termName} />
          </div>
          <div className="space-y-[var(--gap)]">
            <Card>
              <CardHeader title={t("children.fees")} icon={<Receipt className="size-4" />} action={partyId && <a href={`/api/w/${slug}/export/statement?party=${partyId}&format=print`} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">{t("children.statement")}</a>} />
              <CardBody className="space-y-3">
                <p className={cn("text-2xl font-semibold tabular", c.fees.overdue > 0 ? "text-danger" : c.fees.balance > 0 ? "" : "text-success")}>{c.fees.balance > 0 ? fmt.money(c.fees.balance) : t("children.allPaid")}</p>
                {c.fees.overdue > 0 && <Badge tone="danger">{t("children.overdue", { amount: fmt.money(c.fees.overdue) })}</Badge>}
                <ul className="divide-y divide-line text-sm">
                  {c.fees.invoices.slice(0, 5).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                      <a href={`/api/w/${slug}/export/document?id=${d.id}&format=print`} target="_blank" rel="noreferrer" className="min-w-0 hover:text-accent">
                        <span className="block font-mono text-xs">{d.number}</span>
                        <span className="block text-xs text-muted">{d.due ? fmt.date(d.due, "short") : fmt.date(d.date, "short")}</span>
                      </a>
                      <span className="flex items-center gap-2">
                        <span className="tabular">{fmt.money(d.status === "paid" ? d.total : d.total - d.paid)}</span>
                        <StatusBadge status={d.status} />
                      </span>
                    </li>
                  ))}
                </ul>
                {bank && c.fees.balance > 0 && (
                  <p className="flex gap-2 rounded-xl bg-sunken p-3 text-xs text-muted">
                    <Landmark className="size-4 shrink-0" />
                    <span>
                      {t("children.payBank", { bank: bank.name })}
                      <span dir="ltr" className="mt-1 block font-mono text-[0.7rem] text-fg">
                        {bank.iban}
                      </span>
                    </span>
                  </p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("children.bus")} icon={<Bus className="size-4" />} />
              <CardBody className="text-sm">
                {c.bus ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="size-2.5 rounded-full" style={{ background: c.bus.color ?? "var(--accent)" }} />
                      {c.bus.route}
                    </p>
                    <p>{t("children.pickupAt", { time: c.bus.pickup ?? "—", stop: c.bus.stop })}</p>
                    <p className="text-muted">{t("children.dropoffAt", { time: c.bus.dropoff ?? "—" })}</p>
                    {[[c.bus.driver, c.bus.driverPhone, t("transport.driver")], [c.bus.attendant, c.bus.attendantPhone, t("transport.attendant")]].map(([n, ph, label]) =>
                      n ? (
                        <p key={label} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted">
                            {label}: {n}
                          </span>
                          {ph && (
                            <a href={`tel:${ph.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-accent" dir="ltr">
                              <Phone className="size-3" /> {ph}
                            </a>
                          )}
                        </p>
                      ) : null,
                    )}
                  </div>
                ) : (
                  <p className="text-muted">{t("children.noBus")}</p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("children.reportCards")} icon={<FileText className="size-4" />} />
              <CardBody>
                {c.reports.length ? (
                  <div className="grid gap-2">
                    {c.reports.slice(0, 6).map((r) => (
                      <a key={r.id} href={`/api/w/${slug}/export/report-card?id=${r.id}&format=print`} target="_blank" rel="noreferrer" className="lift flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                        <Printer className="size-4 text-accent" />
                        <span className="flex-1">{pick(locale, r.term, r.termAr)}</span>
                        <span className="text-xs text-muted">{r.year}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t("children.noReports")}</p>
                )}
              </CardBody>
            </Card>
            {c.loans.length > 0 && (
              <Card>
                <CardHeader title={t("children.library")} icon={<BookOpen className="size-4" />} />
                <CardBody className="space-y-1.5 text-sm">
                  {c.loans.map((l) => (
                    <p key={l.id} className="flex items-center justify-between gap-2">
                      <span className="truncate" dir="auto">
                        {l.title}
                      </span>
                      <Badge tone={l.overdue ? "danger" : "neutral"}>{t(l.overdue ? "library.overdue" : "library.due", { date: fmt.date(l.due, "short") })}</Badge>
                    </p>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
        </div>

        {c.timetable.length > 0 && (
          <Card>
            <CardHeader title={t("children.week")} icon={<GraduationCap className="size-4" />} />
            <CardBody>
              <TimetableGrid days={settings.days} periods={settings.periods} breaks={settings.breaks} slots={c.timetable} now={{ day: weekday, period: periodNow }} compact />
            </CardBody>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
