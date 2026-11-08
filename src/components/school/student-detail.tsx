"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, Bus, CalendarCheck, FileText, GraduationCap, HeartPulse, IdCard, Pencil, Phone, Printer, Receipt, Repeat, Star, UserMinus, UserPlus, Users } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { inputClass } from "@/components/ui/input";
import { Thread } from "@/components/records/thread";
import { Gallery, type GalleryFile } from "@/components/records/gallery";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { ThreadItem } from "@/lib/thread";
import type { AttendanceSummary, SubjectResult } from "@/lib/school/profile";
import { moveStudent, setStudentStatus } from "@/app/actions/school";
import { StudentSheet, type ClassOpt, type StopOpt, type StudentData } from "./student-sheet";

const DAY = 86400_000;

type Tab = "overview" | "attendance" | "grades" | "fees" | "library" | "documents";

export interface FeeSummary {
  invoices: { id: string; number: string; date: string; due: string | null; total: number; paid: number; installment: string | null; status: string }[];
  balance: number;
  overdue: number;
  payments: { number: string; date: string; method: string; amount: number; invoice: string }[];
}

export function StudentDetail(p: {
  slug: string;
  viewerId: string;
  now: string;
  student: StudentData & { number: string; status: string; avatarColor: string | null; leftOn: string | null };
  className: string;
  gradeName: string;
  campusName: string;
  homeroom: string | null;
  bus: { route: string; stop: string; pickup: string | null; dropoff: string | null; driver: string | null; driverPhone: string | null } | null;
  family: { id: string; name: string; relation: string; primary: boolean; phone: string | null; email: string | null; employer: string | null }[];
  siblings: { id: string; name: string; className: string }[];
  attendance: AttendanceSummary;
  termName: string;
  results: SubjectResult[];
  reports: { id: string; term: string; termAr: string | null; year: string; publishedAt: string | null }[];
  fees: FeeSummary | null;
  loans: { id: string; title: string; author: string | null; borrowedOn: string; dueOn: string; returnedOn: string | null }[];
  files: GalleryFile[];
  thread: ThreadItem[];
  canManage: boolean;
  canComment: boolean;
  classes: ClassOpt[];
  stops: StopOpt[];
}) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const st = p.student;
  const name = pick(locale, st.name, st.nameAr);
  const age = Math.floor((new Date(p.now).getTime() - new Date(st.dob).getTime()) / (365.25 * DAY));
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const a = p.attendance;

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "overview", label: t("students.overview"), icon: Users },
    { id: "attendance", label: t("students.attendanceTab"), icon: CalendarCheck },
    { id: "grades", label: t("students.gradesTab"), icon: GraduationCap },
    ...(p.fees ? [{ id: "fees" as Tab, label: t("students.feesTab"), icon: Receipt }] : []),
    { id: "library", label: t("students.libraryTab"), icon: BookOpen },
    ...(p.canManage ? [{ id: "documents" as Tab, label: t("students.documentsTab"), icon: FileText }] : []),
  ];

  const move = () =>
    start(async () => {
      const res = await moveStudent(p.slug, st.id, target);
      if (!res.ok) return void toast.error(t(res.error as MessageKey, { capacity: p.classes.find((c) => c.id === target)?.capacity ?? 0 }));
      toast.success(t("students.moved", { section: p.classes.find((c) => c.id === target)?.label ?? "" }));
      setMoveOpen(false);
      router.refresh();
    });
  const toggle = () =>
    start(async () => {
      const res = await setStudentStatus(p.slug, st.id, st.status === "active" ? "withdrawn" : "active");
      setLeaveOpen(false);
      if (!res.ok) toast.error(t(res.error as MessageKey));
      else router.refresh();
    });

  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${p.slug}/students`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("students.title")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={st.name} color={st.avatarColor} size={72} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="text-muted">
              {p.className} · {p.campusName} · {t("school.age", { years: fmt.number(age) })}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge className="font-mono">{st.number}</Badge>
              {st.status !== "active" ? <Badge tone={st.status === "upcoming" ? "info" : "neutral"}>{st.status === "upcoming" ? t("students.viewUpcoming") : t("students.withdrawn")}</Badge> : <StatusBadge status="active" />}
              {st.nationality && <Badge>{regions.of(st.nationality)}</Badge>}
              {st.medical && (
                <Badge tone="danger">
                  <HeartPulse className="size-3" /> {t("school.medicalFlag")}
                </Badge>
              )}
              {st.discountKind && <Badge tone="info">{st.discountKind === "staff" ? t("students.discountStaff") : `${t("students.discountScholarship")} ${fmt.percent(st.discountPct / 10000)}`}</Badge>}
            </div>
          </div>
        </div>
        {p.canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> {t("common.edit")}
            </Button>
            {st.status === "active" && (
              <Button variant="ghost" onClick={() => (setTarget(st.sectionId ?? ""), setMoveOpen(true))}>
                <Repeat className="size-4" /> {t("students.move")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setLeaveOpen(true)}>
              {st.status === "active" ? <UserMinus className="size-4" /> : <UserPlus className="size-4" />}
              {st.status === "active" ? t("students.withdraw") : t("students.reinstate")}
            </Button>
          </div>
        )}
      </div>

      <div role="tablist" className="no-print flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn("relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition", tab === x.id ? "text-fg" : "text-muted hover:text-fg")}
          >
            <x.icon className="size-4" /> {x.label}
            {tab === x.id && <motion.span layoutId="student-tab" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-[var(--gap)] lg:grid-cols-3">
          <div className="space-y-[var(--gap)] lg:col-span-2">
            <Card>
              <CardHeader title={t("students.guardiansTitle")} icon={<Users className="size-4" />} />
              <CardBody className="grid gap-3 sm:grid-cols-2">
                {p.family.map((g) => (
                  <div key={g.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {p.canManage ? (
                          <Link href={`/w/${p.slug}/guardians/${g.id}`} className="font-medium hover:text-accent">
                            {g.name}
                          </Link>
                        ) : (
                          <p className="font-medium">{g.name}</p>
                        )}
                        <p className="text-xs text-muted">
                          {t(`school.relation_${g.relation}` as MessageKey)}
                          {g.employer ? ` · ${g.employer}` : ""}
                        </p>
                      </div>
                      {g.primary && (
                        <Badge tone="accent">
                          <Star className="size-3 fill-current" /> {t("students.primary")}
                        </Badge>
                      )}
                    </div>
                    {g.phone && (
                      <a href={`tel:${g.phone.replace(/\s/g, "")}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent" dir="ltr">
                        <Phone className="size-3.5" /> {g.phone}
                      </a>
                    )}
                    {g.email && <p className="truncate text-xs text-subtle" dir="ltr">{g.email}</p>}
                  </div>
                ))}
              </CardBody>
            </Card>
            <AttendanceCard a={a} termName={p.termName} compact />
            <ResultsCard results={p.results} termName={p.termName} compact />
          </div>
          <div className="space-y-[var(--gap)]">
            <Card>
              <CardHeader title={t("students.profile")} icon={<IdCard className="size-4" />} />
              <CardBody className="space-y-2 text-sm">
                <Info label={t("students.dob")} value={fmt.date(st.dob)} />
                <Info label={t("school.homeroom")} value={p.homeroom ?? "—"} />
                <Info label={t("students.joinedOn")} value={fmt.date(st.joinedOn)} />
                <Info label={t("students.qid")} value={st.qid ?? "—"} mono />
                {st.qidExpiry && <Info label={t("students.qidExpiry")} value={fmt.date(st.qidExpiry)} warn={new Date(st.qidExpiry).getTime() < new Date(p.now).getTime() + 30 * DAY} />}
                <Info label={t("students.passport")} value={st.passportNumber ?? "—"} mono />
                <Info label={t("students.bloodGroup")} value={st.bloodGroup ?? "—"} />
                {st.previousSchool && <Info label={t("students.previousSchool")} value={st.previousSchool} />}
              </CardBody>
            </Card>
            {st.medical && (
              <Card className="border-[color-mix(in_oklch,var(--danger)_40%,var(--line))]">
                <CardHeader title={t("students.medical")} icon={<HeartPulse className="size-4 text-danger" />} />
                <CardBody className="text-sm">{st.medical}</CardBody>
              </Card>
            )}
            <Card>
              <CardHeader title={t("students.busStop")} icon={<Bus className="size-4" />} />
              <CardBody className="text-sm">
                {p.bus ? (
                  <div className="space-y-1.5">
                    <p className="font-medium">{p.bus.route}</p>
                    <p className="text-muted">
                      {p.bus.stop} · {p.bus.pickup} → {p.bus.dropoff}
                    </p>
                    {p.bus.driver && (
                      <p className="text-xs text-subtle">
                        {p.bus.driver} · <span dir="ltr">{p.bus.driverPhone}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted">{t("students.noBus")}</p>
                )}
              </CardBody>
            </Card>
            {p.siblings.length > 0 && (
              <Card>
                <CardHeader title={t("students.siblings")} icon={<Users className="size-4" />} />
                <CardBody className="space-y-1.5">
                  {p.siblings.map((s) => (
                    <Link key={s.id} href={`/w/${p.slug}/students/${s.id}`} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-sunken">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted">{s.className}</span>
                    </Link>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
          {p.canComment && (
            <div className="lg:col-span-3">
              <Card>
                <CardBody>
                  <Thread slug={p.slug} entityType="student" entityId={st.id} items={p.thread} now={p.now} viewerId={p.viewerId} />
                </CardBody>
              </Card>
            </div>
          )}
        </div>
      )}

      {tab === "attendance" && <AttendanceCard a={a} termName={p.termName} />}
      {tab === "grades" && (
        <div className="space-y-[var(--gap)]">
          <ResultsCard results={p.results} termName={p.termName} />
          <ReportsCard slug={p.slug} reports={p.reports} />
        </div>
      )}
      {tab === "fees" && p.fees && <FeesCard slug={p.slug} fees={p.fees} />}
      {tab === "library" && (
        <Card>
          <CardBody>
            {p.loans.length ? (
              <ul className="divide-y divide-line">
                {p.loans.map((l) => {
                  const late = !l.returnedOn && new Date(l.dueOn).getTime() < new Date(p.now).getTime();
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.title}</p>
                        <p className="truncate text-xs text-muted">{l.author}</p>
                      </div>
                      <div className="text-end text-xs">
                        <p className="text-muted">{fmt.date(l.borrowedOn)}</p>
                        {l.returnedOn ? <Badge tone="success">{t("library.returned")}</Badge> : <Badge tone={late ? "danger" : "warning"}>{t(late ? "library.overdue" : "library.due", { date: fmt.date(l.dueOn) })}</Badge>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted">{t("students.loansEmpty")}</p>
            )}
          </CardBody>
        </Card>
      )}
      {tab === "documents" && (
        <Card>
          <CardHeader title={t("students.documents")} icon={<FileText className="size-4" />} />
          <CardBody>
            <Gallery slug={p.slug} entityType="student" entityId={st.id} kind="file" files={p.files} canEdit={p.canManage} emptyLabel={t("students.documentsEmpty")} addLabel={t("students.addDocument")} />
          </CardBody>
        </Card>
      )}

      {p.canManage && (
        <>
          <StudentSheet slug={p.slug} open={editOpen} onOpenChange={setEditOpen} initial={st} classes={p.classes} stops={p.stops} />
          <Modal
            open={moveOpen}
            onOpenChange={setMoveOpen}
            title={t("students.moveTitle", { name })}
            footer={
              <>
                <Button variant="ghost" onClick={() => setMoveOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={move} disabled={pending || !target || target === st.sectionId}>
                  {t("students.move")}
                </Button>
              </>
            }
          >
            <select aria-label={t("school.section")} className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
              {p.classes.map((c) => (
                <option key={c.id} value={c.id} disabled={c.count >= c.capacity && c.id !== st.sectionId}>
                  {c.label} · {c.campus} · {t("school.capacity", { count: c.count, capacity: c.capacity })}
                </option>
              ))}
            </select>
          </Modal>
          <Modal
            open={leaveOpen}
            onOpenChange={setLeaveOpen}
            title={st.status === "active" ? t("students.withdrawTitle", { name }) : t("students.reinstate")}
            description={st.status === "active" ? t("students.withdrawBody") : undefined}
            footer={
              <>
                <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant={st.status === "active" ? "danger" : "primary"} onClick={toggle} disabled={pending}>
                  {st.status === "active" ? t("students.withdraw") : t("students.reinstate")}
                </Button>
              </>
            }
          />
        </>
      )}
    </div>
  );
}

function Info({ label, value, mono, warn }: { label: string; value: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={cn("text-end", mono && "font-mono text-xs", warn && "text-warning")}>{value}</span>
    </div>
  );
}

export function AttendanceCard({ a, termName, compact }: { a: AttendanceSummary; termName: string; compact?: boolean }) {
  const { t, fmt } = useI18n();
  const tone = (s: string) => (s === "absent" ? "danger" : s === "late" ? "warning" : "info");
  return (
    <Card>
      <CardHeader title={`${t("students.attendanceTab")} · ${termName}`} icon={<CalendarCheck className="size-4" />} action={a.rate != null && <span className="text-sm font-semibold tabular">{t("students.rate", { pct: fmt.percent(a.rate) })}</span>} />
      <CardBody>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: t("students.present"), value: a.present, cls: "text-success" },
            { label: t("students.absent"), value: a.absent, cls: "text-danger" },
            { label: t("students.late"), value: a.late, cls: "text-warning" },
            { label: t("students.excused"), value: a.excused, cls: "text-info" },
          ].map((x) => (
            <div key={x.label} className="rounded-xl bg-sunken py-2.5">
              <p className={cn("text-xl font-semibold tabular", x.cls)}>{fmt.number(x.value)}</p>
              <p className="text-xs text-muted">{x.label}</p>
            </div>
          ))}
        </div>
        {a.days > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <motion.div className="h-full rounded-full bg-success" initial={{ width: 0 }} animate={{ width: `${(a.rate ?? 0) * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
          </div>
        )}
        {!compact &&
          (a.exceptions.length ? (
            <ul className="mt-4 divide-y divide-line">
              {a.exceptions.map((e) => (
                <li key={e.date} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{fmt.date(e.date, "full")}</span>
                  <span className="flex items-center gap-2">
                    {e.note && <span className="text-xs text-muted">{e.note}</span>}
                    <Badge tone={tone(e.status)}>
                      {t(`students.${e.status}` as MessageKey)}
                      {e.minutes ? ` · ${e.minutes}′` : ""}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-center text-sm text-muted">{t("students.noAbsences")}</p>
          ))}
      </CardBody>
    </Card>
  );
}

export function ResultsCard({ results, termName, compact }: { results: SubjectResult[]; termName: string; compact?: boolean }) {
  const { t, fmt, locale } = useI18n();
  const marked = results.filter((r) => r.percent != null);
  return (
    <Card>
      <CardHeader title={`${t("students.termResults")} · ${termName}`} icon={<GraduationCap className="size-4" />} />
      <CardBody>
        {marked.length ? (
          <ul className="space-y-2.5">
            {(compact ? marked.slice(0, 6) : results).map((r, i) => (
              <li key={r.subjectId}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color ?? "var(--accent)" }} />
                    <span className="truncate font-medium">{pick(locale, r.name, r.nameAr)}</span>
                    {!compact && r.teacher && <span className="hidden truncate text-xs text-subtle sm:inline">{r.teacher}</span>}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2 tabular">
                    {r.classAverage != null && !compact && <span className="text-xs text-subtle">{t("exams.classAvg", { pct: fmt.number(r.classAverage) })}</span>}
                    <span className="font-semibold">{r.percent != null ? `${fmt.number(r.percent)}%` : "—"}</span>
                    {r.letter && <Badge tone={r.letter === "F" ? "danger" : r.letter === "A" ? "success" : "neutral"}>{r.letter}</Badge>}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <motion.div className="h-full rounded-full" style={{ background: r.color ?? "var(--accent)" }} initial={{ width: 0 }} animate={{ width: `${r.percent ?? 0}%` }} transition={{ duration: 0.7, delay: i * 0.04, ease: "easeOut" }} />
                </div>
                {!compact && r.assessments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.assessments.map((x) => (
                      <span key={x.id} className="rounded-md bg-sunken px-1.5 py-0.5 text-[0.7rem] text-muted">
                        {pick(locale, x.name, x.nameAr)}: {x.absent ? t("students.absent") : x.score != null ? `${fmt.number(x.score / 100)}/${x.max}` : "—"}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-muted">{t("students.noMarks")}</p>
        )}
      </CardBody>
    </Card>
  );
}

export function ReportsCard({ slug, reports }: { slug: string; reports: { id: string; term: string; termAr: string | null; year: string; publishedAt: string | null }[] }) {
  const { t, locale } = useI18n();
  if (!reports.length) return null;
  return (
    <Card>
      <CardHeader title={t("students.reportCards")} icon={<FileText className="size-4" />} />
      <CardBody className="grid gap-2 sm:grid-cols-3">
        {reports.map((r) => (
          <a key={r.id} href={`/api/w/${slug}/export/report-card?id=${r.id}&format=print`} target="_blank" rel="noreferrer" className="lift flex items-center gap-3 rounded-xl border border-line p-3 text-sm">
            <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
              <Printer className="size-4" />
            </span>
            <span>
              <span className="block font-medium">{pick(locale, r.term, r.termAr)}</span>
              <span className="block text-xs text-muted">{r.year}</span>
            </span>
          </a>
        ))}
      </CardBody>
    </Card>
  );
}

export function FeesCard({ slug, fees, canPay }: { slug: string; fees: FeeSummary; canPay?: boolean }) {
  const { t, fmt } = useI18n();
  void canPay;
  return (
    <div className="grid gap-[var(--gap)] lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title={t("students.feesTab")} icon={<Receipt className="size-4" />} />
        <CardBody>
          <ul className="divide-y divide-line">
            {fees.invoices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <a href={`/api/w/${slug}/export/document?id=${d.id}&format=print`} target="_blank" rel="noreferrer" className="min-w-0 hover:text-accent">
                  <span className="block font-mono text-xs">{d.number}</span>
                  <span className="block text-xs text-muted">
                    {fmt.date(d.date)}
                    {d.due ? ` · ${t("docs.colDue")} ${fmt.date(d.due)}` : ""}
                  </span>
                </a>
                <span className="flex items-center gap-2">
                  <span className="text-end tabular">
                    <span className="block font-medium">{fmt.money(d.total)}</span>
                    {d.paid > 0 && d.paid < d.total && <span className="block text-xs text-muted">{fmt.money(d.total - d.paid)}</span>}
                  </span>
                  <StatusBadge status={d.status} />
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <div className="space-y-[var(--gap)]">
        <Card>
          <CardBody className="space-y-3">
            <div>
              <p className="text-xs text-muted">{t("students.feeBalance")}</p>
              <p className={cn("text-2xl font-semibold tabular", fees.overdue > 0 && "text-danger")}>{fmt.money(fees.balance)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("students.paidThisYear")}</p>
              <p className="text-lg font-semibold tabular text-success">{fmt.money(fees.payments.reduce((s, x) => s + x.amount, 0))}</p>
            </div>
          </CardBody>
        </Card>
        {fees.payments.length > 0 && (
          <Card>
            <CardHeader title={t("nav.paymentsIn")} icon={<Receipt className="size-4" />} />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {fees.payments.slice(0, 8).map((x, i) => (
                  <li key={`${x.number}-${i}`} className="flex justify-between gap-2">
                    <span className="text-muted">{fmt.date(x.date)}</span>
                    <span className="tabular font-medium">{fmt.money(x.amount)}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
