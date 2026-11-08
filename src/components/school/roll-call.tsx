"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, CalendarCheck, CalendarX, Check, CheckCheck, Clock, HeartPulse, Loader2, ShieldCheck, Users } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { selectClass } from "@/components/business/list-view";
import { celebrate } from "@/components/motion/celebrate";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import { takeRoll } from "@/app/actions/academics";

type Status = "present" | "absent" | "late" | "excused";
const NEXT: Record<Status, Status> = { present: "absent", absent: "late", late: "excused", excused: "present" };
const STYLE: Record<Status, string> = {
  present: "border-line bg-surface",
  absent: "border-danger bg-[color-mix(in_oklch,var(--danger)_10%,var(--surface))]",
  late: "border-warning bg-[color-mix(in_oklch,var(--warning)_12%,var(--surface))]",
  excused: "border-info bg-[color-mix(in_oklch,var(--info)_10%,var(--surface))]",
};

interface SectionRow {
  id: string;
  label: string;
  campus: string;
  homeroom: string | null;
  size: number;
  roll: { absent: number; late: number; excused: number; size: number; at: string } | null;
  mine: boolean;
}

export function RollCall(p: {
  slug: string;
  date: string;
  today: string;
  schoolDay: boolean;
  canManage: boolean;
  sections: SectionRow[];
  selected: {
    id: string;
    label: string;
    canEdit: boolean;
    taken: { at: string; by: string | null } | null;
    students: { id: string; name: string; plainName: string; color: string | null; medical: string | null }[];
    marks: { studentId: string; status: "absent" | "late" | "excused"; minutes: number | null; note: string | null }[];
  } | null;
  absentToday: { id: string; name: string; className: string; note: string | null }[];
  frequent: { id: string; name: string; className: string; days: number }[];
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  const taken = p.sections.filter((x) => x.roll);
  const onRoll = taken.reduce((s, x) => s + x.roll!.size, 0);
  const away = taken.reduce((s, x) => s + x.roll!.absent + x.roll!.excused, 0);
  return (
    <div>
      <PageHeader
        title={t("roll.title")}
        subtitle={t("roll.subtitle", { date: fmt.date(`${p.date}T12:00:00+03:00`, "full") })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label={t("roll.subtitle", { date: "" })} max={p.today} value={p.date} onChange={(e) => setParam({ date: e.target.value === p.today ? null : e.target.value })} className={selectClass} />
            <select aria-label={t("roll.pickClass")} className={selectClass} value={p.selected?.id ?? ""} onChange={(e) => setParam({ section: e.target.value || null })}>
              {p.canManage && <option value="">{t("roll.overview")}</option>}
              {p.sections.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                  {new Set(p.sections.map((y) => y.campus)).size > 1 ? ` · ${x.campus}` : ""}
                </option>
              ))}
            </select>
          </div>
        }
      />
      {!p.schoolDay ? (
        <EmptyState icon={<CalendarX className="size-6" />} title={t("roll.noSchool")} />
      ) : p.selected ? (
        <Roll key={`${p.selected.id}-${p.date}`} slug={p.slug} date={p.date} section={p.selected} />
      ) : (
        <div className="grid gap-[var(--gap)] lg:grid-cols-3">
          <div className="space-y-[var(--gap)] lg:col-span-2">
            <div className="grid gap-[var(--gap)] sm:grid-cols-3">
              <Stat label={t("roll.classesTaken", { taken: taken.length, total: p.sections.length })} value={p.sections.length ? taken.length / p.sections.length : 0} />
              <Stat label={t("roll.rate", { pct: "" })} value={onRoll ? (onRoll - away) / onRoll : 0} tone="success" />
              <Card>
                <CardBody>
                  <p className="text-xs text-muted">{t("roll.absentToday")}</p>
                  <p className="mt-1 text-3xl font-semibold tabular">{fmt.number(p.absentToday.length)}</p>
                </CardBody>
              </Card>
            </div>
            <Card>
              <CardHeader title={t("roll.overview")} icon={<CalendarCheck className="size-4" />} />
              <CardBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {p.sections.map((x) => (
                  <button key={x.id} type="button" onClick={() => setParam({ section: x.id })} className={cn("flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start text-sm transition hover:border-accent-line", x.roll ? "border-line" : "border-dashed border-danger/60")}>
                    <span className="min-w-0">
                      <span className="block font-semibold tabular">{x.label}</span>
                      <span className="block truncate text-xs text-muted">{x.homeroom ?? x.campus}</span>
                    </span>
                    {x.roll ? (
                      <span className="text-end text-xs">
                        <span className={cn("block font-medium tabular", x.roll.absent ? "text-warning" : "text-success")}>{x.roll.absent ? `${x.roll.absent} ${t("roll.absent")}` : <Check className="ms-auto size-4" />}</span>
                        <span className="block text-subtle">{fmt.time(x.roll.at)}</span>
                      </span>
                    ) : (
                      <Badge tone="danger">{t("roll.notTaken")}</Badge>
                    )}
                  </button>
                ))}
              </CardBody>
            </Card>
          </div>
          <div className="space-y-[var(--gap)]">
            {p.frequent.length > 0 && (
              <Card>
                <CardHeader title={t("roll.frequent")} icon={<AlertTriangle className="size-4 text-warning" />} />
                <CardBody className="space-y-1.5">
                  {p.frequent.map((f) => (
                    <Link key={f.id} href={`/w/${p.slug}/students/${f.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken">
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {f.className} · <span className="font-semibold text-danger">{f.days}</span>
                      </span>
                    </Link>
                  ))}
                </CardBody>
              </Card>
            )}
            <Card>
              <CardHeader title={t("roll.absentToday")} icon={<Users className="size-4" />} />
              <CardBody className="max-h-[28rem] space-y-1 overflow-y-auto">
                {p.absentToday.length ? (
                  p.absentToday.map((a) => (
                    <Link key={a.id} href={`/w/${p.slug}/students/${a.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken">
                      <span className="truncate">{a.name}</span>
                      <span className="shrink-0 text-xs text-muted">{a.note ? `${a.note} · ` : ""}{a.className}</span>
                    </Link>
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-muted">—</p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" }) {
  const { fmt } = useI18n();
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-muted">{label}</p>
        <p className={cn("mt-1 text-3xl font-semibold tabular", tone === "success" && "text-success")}>{fmt.percent(value)}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
          <motion.div className={cn("h-full rounded-full", tone === "success" ? "bg-success" : "bg-accent")} initial={{ width: 0 }} animate={{ width: `${value * 100}%` }} transition={{ duration: 0.8 }} />
        </div>
      </CardBody>
    </Card>
  );
}

function Roll({ slug, date, section }: { slug: string; date: string; section: NonNullable<Parameters<typeof RollCall>[0]["selected"]> }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [pending, start] = useTransition();
  const [state, setState] = useState<Record<string, Status>>(() => Object.fromEntries(section.students.map((st) => [st.id, (section.marks.find((m) => m.studentId === st.id)?.status ?? "present") as Status])));
  const [minutes, setMinutes] = useState<Record<string, number>>(() => Object.fromEntries(section.marks.filter((m) => m.minutes).map((m) => [m.studentId, m.minutes!])));
  const counts = { absent: 0, late: 0, excused: 0, present: 0 } as Record<Status, number>;
  for (const v of Object.values(state)) counts[v]++;
  const save = () =>
    start(async () => {
      const entries = Object.entries(state)
        .filter(([, v]) => v !== "present")
        .map(([studentId, status]) => ({ studentId, status: status as "absent" | "late" | "excused", minutes: status === "late" ? (minutes[studentId] ?? 10) : null, note: section.marks.find((m) => m.studentId === studentId)?.note ?? "" }));
      const res = await takeRoll(slug, section.id, { date, entries });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      if (!res.absent && !res.late) celebrate(reduced);
      toast.success(res.absent || res.late ? t("roll.saved", { absent: res.absent, late: res.late }) : t("roll.savedAll"));
      router.refresh();
    });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tabular">{section.label}</h2>
          <p className="text-sm text-muted">
            {section.taken ? (section.taken.by ? t("roll.takenBy", { time: fmt.time(section.taken.at), name: section.taken.by }) : t("roll.takenByTeacher", { time: fmt.time(section.taken.at) })) : t("roll.tapHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="success">
            {t("roll.present")} {counts.present}
          </Badge>
          <Badge tone="danger">
            {t("roll.absent")} {counts.absent}
          </Badge>
          <Badge tone="warning">
            {t("roll.late")} {counts.late}
          </Badge>
          <Badge tone="info">
            {t("roll.excused")} {counts.excused}
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {section.students.map((st, i) => {
          const s = state[st.id];
          return (
            <motion.button
              key={st.id}
              type="button"
              disabled={!section.canEdit || pending}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i, 20) * 0.015 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setState((x) => ({ ...x, [st.id]: NEXT[x[st.id]] }))}
              aria-label={`${st.name}: ${t(`roll.${s}` as MessageKey)}`}
              className={cn("relative flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-start transition", STYLE[s])}
            >
              <Avatar name={st.plainName} color={s === "present" ? st.color : null} size={36} className={cn(s === "absent" && "grayscale")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{st.name}</span>
                <AnimatePresence mode="wait">
                  <motion.span key={s} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("block text-xs", s === "present" ? "text-success" : s === "absent" ? "text-danger" : s === "late" ? "text-warning" : "text-info")}>
                    {t(`roll.${s}` as MessageKey)}
                    {s === "late" && ` · ${minutes[st.id] ?? 10}′`}
                  </motion.span>
                </AnimatePresence>
              </span>
              {st.medical && <HeartPulse className="absolute end-2 top-2 size-3.5 text-danger" aria-label={t("school.medicalFlag")} />}
              {s === "late" && section.canEdit && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMinutes((m) => ({ ...m, [st.id]: ((m[st.id] ?? 10) % 30) + 5 }));
                  }}
                  className="absolute bottom-1.5 end-2 rounded bg-surface px-1 text-[0.65rem] text-muted"
                  title={t("roll.minutes")}
                >
                  <Clock className="inline size-3" />
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      {section.canEdit && (
        <div className="no-print sticky bottom-4 z-20 flex justify-end">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-glass p-2 shadow-lift backdrop-blur-xl">
            <span className="hidden px-2 text-xs text-muted sm:inline">
              <ShieldCheck className="me-1 inline size-3.5" />
              {t("roll.notifyParents")}
            </span>
            <Button variant="ghost" onClick={() => setState(Object.fromEntries(section.students.map((st) => [st.id, "present" as Status])))} disabled={pending}>
              <CheckCheck className="size-4" /> {t("roll.allPresent")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("roll.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
