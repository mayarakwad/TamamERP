"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, CalendarCheck, Eraser, HeartPulse, Loader2, Pencil, Phone, Plus, Printer, Sparkles, Trash2, Users, Wand2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import { autoFillTimetable, clearTimetable, placeSlot, removeAssignment, saveAssignment } from "@/app/actions/academics";
import { TimetableGrid } from "./timetable-grid";
import { SectionModal, type SectionCard } from "./classes-view";

type Tab = "students" | "timetable" | "subjects" | "attendance";

interface Assignment {
  subjectId: string;
  code: string;
  subject: string;
  color: string | null;
  teacherId: string | null;
  teacher: string | null;
  periods: number;
  placed: number;
}

export function ClassDetail(p: {
  slug: string;
  section: SectionCard;
  students: { id: string; name: string; plainName: string; number: string; color: string | null; medical: string | null; gender: string; phone: string | null }[];
  assignments: Assignment[];
  slots: { day: number; period: number; subjectId: string; title: string; sub: string | null; color: string | null }[];
  elsewhere: { teacherId: string; day: number; period: number; label: string }[];
  subjects: { id: string; name: string }[];
  staff: { id: string; name: string; title: string | null; department: string | null }[];
  settings: { days: number[]; periods: { start: string; end: string }[]; breaks: { after: number; label: string; labelAr: string }[] };
  register: { month: string; days: string[]; rolls: string[]; marks: { studentId: string; date: string; status: string }[] };
  grades: { id: string; name: string }[];
  campuses: { id: string; name: string }[];
  canManage: boolean;
  canTeach: boolean;
  termId: string;
}) {
  const { t, dir } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(p.canManage ? "timetable" : "students");
  const [editing, setEditing] = useState(false);
  const [cell, setCell] = useState<{ day: number; period: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const s = p.section;
  const left = p.assignments.reduce((x, a) => x + Math.max(0, a.periods - a.placed), 0);

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "students", label: `${t("classes.students")} · ${p.students.length}`, icon: Users },
    { id: "timetable", label: t("classes.timetable"), icon: CalendarCheck },
    { id: "subjects", label: t("classes.subjects"), icon: BookOpen },
    { id: "attendance", label: t("classes.attendance"), icon: CalendarCheck },
  ];

  const fill = () =>
    start(async () => {
      const res = await autoFillTimetable(p.slug, s.id);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(res.left ? t("timetable.autoFilledSome", { placed: res.placed, left: res.left }) : t("timetable.autoFilled", { placed: res.placed }));
      router.refresh();
    });
  const clear = () =>
    start(async () => {
      const res = await clearTimetable(p.slug, s.id);
      setConfirmClear(false);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      router.refresh();
    });

  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${p.slug}/classes`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("classes.title")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <span className="tabular">{s.label}</span>
            <span className="size-3 rounded-full" style={{ background: s.campusColor ?? "var(--accent)" }} />
          </h1>
          <p className="mt-1 text-muted">
            {s.grade} · {s.campus}
            {s.room ? ` · ${t("school.room")} ${s.room}` : ""} · {s.homeroom ?? t("classes.noHomeroom")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.canTeach && (
            <Link href={`/w/${p.slug}/attendance?section=${s.id}`} className={buttonClass("primary")}>
              <CalendarCheck className="size-4" /> {t("roll.takeRoll")}
            </Link>
          )}
          <a href={`/api/w/${p.slug}/export/timetable?section=${s.id}&format=print`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Printer className="size-4" /> {t("classes.printTimetable")}
          </a>
          {p.canManage && (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> {t("common.edit")}
            </Button>
          )}
        </div>
      </div>

      <div role="tablist" className="no-print flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={cn("relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition", tab === x.id ? "text-fg" : "text-muted hover:text-fg")}>
            <x.icon className="size-4" /> {x.label}
            {tab === x.id && <motion.span layoutId="class-tab" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "students" && (
        <Card>
          <CardHeader
            title={t("classes.roster")}
            icon={<Users className="size-4" />}
            action={
              <a href={`/api/w/${p.slug}/export/students?section=${s.id}&format=print`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                <Printer className="size-4" /> {t("classes.roster")}
              </a>
            }
          />
          <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {p.students.map((st) => (
              <Link key={st.id} href={`/w/${p.slug}/students/${st.id}`} className="flex items-center gap-3 rounded-xl border border-line p-2.5 transition hover:border-accent-line">
                <Avatar name={st.plainName} color={st.color} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {st.name}
                    {st.medical && <HeartPulse className="size-3.5 shrink-0 text-danger" aria-label={t("school.medicalFlag")} />}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {st.number}
                    {st.phone && (
                      <span dir="ltr" className="ms-2 inline-flex items-center gap-1">
                        <Phone className="size-3" /> {st.phone}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === "timetable" && (
        <div className="space-y-3">
          {p.canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{left ? `${t("timetable.toPlace")}: ${left}` : t("timetable.allPlaced")} · <span className="text-subtle">{t("timetable.dragHint")}</span></p>
              <div className="flex gap-2">
                <Button size="sm" onClick={fill} disabled={pending || !left}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} {t("timetable.autoFill")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)} disabled={pending || !p.slots.length}>
                  <Eraser className="size-4" /> {t("timetable.clear")}
                </Button>
              </div>
            </div>
          )}
          {p.canManage && left > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.assignments
                .filter((a) => a.periods > a.placed)
                .map((a) => (
                  <span key={a.subjectId} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs">
                    <span className="size-2 rounded-full" style={{ background: a.color ?? "var(--accent)" }} />
                    {a.subject} <span className="tabular text-muted">×{a.periods - a.placed}</span>
                  </span>
                ))}
            </div>
          )}
          <TimetableGrid days={p.settings.days} periods={p.settings.periods} breaks={p.settings.breaks} slots={p.slots} onCell={p.canManage ? (day, period) => setCell({ day, period }) : undefined} />
        </div>
      )}

      {tab === "subjects" && <AssignmentsEditor slug={p.slug} sectionId={s.id} assignments={p.assignments} subjects={p.subjects} staff={p.staff} canManage={p.canManage} canTeach={p.canTeach} termId={p.termId} />}

      {tab === "attendance" && <Register slug={p.slug} students={p.students} register={p.register} />}

      {p.canManage && (
        <>
          <SlotPicker slug={p.slug} sectionId={s.id} cell={cell} onClose={() => setCell(null)} assignments={p.assignments} slots={p.slots} elsewhere={p.elsewhere} />
          <SectionModal slug={p.slug} editing={editing ? s : null} onClose={() => setEditing(false)} grades={p.grades} campuses={p.campuses} staff={p.staff.map((e) => ({ ...e, campusId: s.campusId }))} />
          <Modal
            open={confirmClear}
            onOpenChange={setConfirmClear}
            title={t("timetable.clearTitle")}
            description={t("timetable.clearBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" onClick={clear} disabled={pending}>
                  {t("timetable.clear")}
                </Button>
              </>
            }
          />
        </>
      )}
    </div>
  );
}

function SlotPicker({ slug, sectionId, cell, onClose, assignments, slots, elsewhere }: { slug: string; sectionId: string; cell: { day: number; period: number } | null; onClose: () => void; assignments: Assignment[]; slots: { day: number; period: number; subjectId: string }[]; elsewhere: { teacherId: string; day: number; period: number; label: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!cell) return null;
  const current = slots.find((x) => x.day === cell.day && x.period === cell.period);
  const pick = (subjectId: string | null) =>
    start(async () => {
      const res = await placeSlot(slug, sectionId, cell.day, cell.period, subjectId);
      if (!res.ok) {
        const clash = (res as { clash?: { teacher: string; section: string } }).clash;
        return void toast.error(clash ? t("timetable.clashTeacher", { teacher: clash.teacher, class: clash.section }) : t(res.error as MessageKey));
      }
      onClose();
      router.refresh();
    });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t("timetable.pickSubject", { day: t(`timetable.day_${cell.day}` as MessageKey), n: cell.period })}>
      <div className="grid gap-1.5">
        {assignments.map((a) => {
          const busy = a.teacherId ? elsewhere.find((e) => e.teacherId === a.teacherId && e.day === cell.day && e.period === cell.period) : null;
          const full = a.placed >= a.periods && current?.subjectId !== a.subjectId;
          return (
            <button
              key={a.subjectId}
              type="button"
              disabled={pending || !!busy}
              onClick={() => pick(a.subjectId)}
              className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 text-start text-sm transition", current?.subjectId === a.subjectId ? "border-accent bg-accent-soft" : "border-line hover:border-accent-line", busy && "cursor-not-allowed opacity-50")}
            >
              <span className="size-3 shrink-0 rounded-full" style={{ background: a.color ?? "var(--accent)" }} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{a.subject}</span>
                <span className={cn("block truncate text-xs", busy ? "text-danger" : "text-muted")}>{busy ? t("timetable.clashTeacher", { teacher: a.teacher ?? "", class: busy.label }) : (a.teacher ?? t("classes.noTeacher"))}</span>
              </span>
              <span className={cn("text-xs tabular", full ? "text-subtle" : "text-muted")}>
                {a.placed}/{a.periods}
              </span>
            </button>
          );
        })}
        {current && (
          <Button variant="ghost" className="mt-1 justify-start text-danger" onClick={() => pick(null)} disabled={pending}>
            <Trash2 className="size-4" /> {t("timetable.empty")}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function AssignmentsEditor({ slug, sectionId, assignments, subjects, staff, canManage, canTeach, termId }: { slug: string; sectionId: string; assignments: Assignment[]; subjects: { id: string; name: string }[]; staff: { id: string; name: string; title: string | null; department: string | null }[]; canManage: boolean; canTeach: boolean; termId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState("");
  const save = (a: { subjectId: string; teacherId: string | null; periods: number }) =>
    start(async () => {
      const res = await saveAssignment(slug, sectionId, { subjectId: a.subjectId, teacherId: a.teacherId ?? "", periods: a.periods });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("common.saved"));
      router.refresh();
    });
  const remove = (subjectId: string) =>
    start(async () => {
      await removeAssignment(slug, sectionId, subjectId);
      router.refresh();
    });
  const free = subjects.filter((x) => !assignments.some((a) => a.subjectId === x.id));
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="hidden grid-cols-[1fr_1.4fr_6rem_auto] gap-3 px-1 text-xs text-muted sm:grid">
          <span>{t("school.subject")}</span>
          <span>{t("school.teacher")}</span>
          <span>{t("school.periods")}</span>
          <span />
        </div>
        {assignments.map((a) => (
          <div key={a.subjectId} className="grid items-center gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_1.4fr_6rem_auto] sm:gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="size-2.5 rounded-full" style={{ background: a.color ?? "var(--accent)" }} />
              {a.subject}
            </span>
            {canManage ? (
              <select aria-label={t("school.teacher")} className={`${inputClass} h-9 text-sm`} defaultValue={a.teacherId ?? ""} onChange={(e) => save({ ...a, teacherId: e.target.value || null })} disabled={pending}>
                <option value="">{t("classes.noTeacher")}</option>
                {staff.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.department ? ` · ${e.department}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-muted">{a.teacher ?? t("classes.noTeacher")}</span>
            )}
            {canManage ? (
              <input aria-label={t("school.periods")} inputMode="numeric" className={`${inputClass} h-9 text-sm`} defaultValue={a.periods} onBlur={(e) => Number(e.target.value) !== a.periods && save({ ...a, periods: Number(e.target.value.replace(/\D/g, "")) || 0 })} disabled={pending} />
            ) : (
              <span className="text-sm tabular">{a.periods}</span>
            )}
            <span className="flex items-center gap-1">
              {canTeach && (
                <Link href={`/w/${slug}/exams/gradebook?section=${sectionId}&subject=${a.subjectId}&term=${termId}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-accent hover:bg-accent-soft">
                  <Sparkles className="size-3.5" /> {t("classes.gradebook")}
                </Link>
              )}
              {canManage && (
                <button type="button" aria-label={t("classes.remove")} onClick={() => remove(a.subjectId)} className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-sunken hover:text-danger" disabled={pending}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </span>
          </div>
        ))}
        {canManage && free.length > 0 && (
          <div className="flex items-center gap-2 pt-2">
            <select aria-label={t("classes.addSubject")} className={`${inputClass} h-9 max-w-xs text-sm`} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">{t("classes.addSubject")}</option>
              {free.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" disabled={!adding || pending} onClick={() => (save({ subjectId: adding, teacherId: null, periods: 2 }), setAdding(""))}>
              <Plus className="size-4" />
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const CODE: Record<string, { label: string; cls: string }> = {
  absent: { label: "A", cls: "bg-[color-mix(in_oklch,var(--danger)_16%,var(--surface))] text-danger" },
  late: { label: "L", cls: "bg-[color-mix(in_oklch,var(--warning)_18%,var(--surface))] text-warning" },
  excused: { label: "E", cls: "bg-[color-mix(in_oklch,var(--info)_16%,var(--surface))] text-info" },
};

function Register({ students, register }: { slug: string; students: { id: string; name: string }[]; register: { month: string; days: string[]; rolls: string[]; marks: { studentId: string; date: string; status: string }[] } }) {
  const { t, fmt } = useI18n();
  const rolls = new Set(register.rolls);
  const marks = new Map(register.marks.map((m) => [`${m.studentId}|${m.date}`, m.status]));
  const schoolDays = register.days.filter((d) => rolls.has(d));
  return (
    <Card>
      <CardHeader
        title={`${t("roll.register")} · ${fmt.monthName(`${register.month}-15T12:00:00+03:00`)}`}
        icon={<CalendarCheck className="size-4" />}
      />
      <CardBody className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky start-0 bg-surface px-2 py-1 text-start font-medium text-muted">{t("roll.colStudent")}</th>
              {schoolDays.map((d) => (
                <th key={d} className="px-0.5 py-1 text-center font-medium tabular text-subtle">
                  {Number(d.slice(8))}
                </th>
              ))}
              <th className="px-2 py-1 text-end font-medium text-muted">{t("roll.colRate")}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((st) => {
              const absent = schoolDays.filter((d) => ["absent", "excused"].includes(marks.get(`${st.id}|${d}`) ?? "")).length;
              const rate = schoolDays.length ? (schoolDays.length - absent) / schoolDays.length : null;
              return (
                <tr key={st.id} className="border-t border-line">
                  <td className="sticky start-0 max-w-44 truncate bg-surface px-2 py-1 font-medium">{st.name}</td>
                  {schoolDays.map((d) => {
                    const m = marks.get(`${st.id}|${d}`);
                    return (
                      <td key={d} className="px-0.5 py-1 text-center">
                        {m ? <span className={cn("inline-grid size-5 place-items-center rounded font-semibold", CODE[m].cls)}>{CODE[m].label}</span> : <span className="text-success">·</span>}
                      </td>
                    );
                  })}
                  <td className={cn("px-2 py-1 text-end tabular", rate != null && rate < 0.9 && "font-semibold text-danger")}>{rate != null ? fmt.percent(rate) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
