"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarClock, CheckCircle2, ClipboardList, Globe, GraduationCap, Loader2, Plus, Star, UserCheck, Users, XCircle } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Textarea, inputClass } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { Thread } from "@/components/records/thread";
import { Gallery, type GalleryFile } from "@/components/records/gallery";
import { DataToolbar } from "@/components/data/toolbar";
import { selectClass } from "@/components/business/list-view";
import { celebrate } from "@/components/motion/celebrate";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { NATIONALITIES, RELATIONS } from "@/lib/school/settings";
import type { ThreadItem } from "@/lib/thread";
import type { DatasetResult } from "@/lib/datasets/types";
import { enrollApplication, moveApplication, saveApplication, type ApplicationInput } from "@/app/actions/admissions";
import type { ClassOpt, StopOpt } from "./student-sheet";

const COLUMNS = ["applied", "assessment", "offered", "enrolled"] as const;
type Column = (typeof COLUMNS)[number];
const DAY = 86400_000;

export interface App {
  id: string;
  number: string;
  childName: string;
  childNameAr: string | null;
  gender: string;
  dob: string;
  nationality: string | null;
  previousSchool: string | null;
  guardianName: string;
  guardianNameAr: string | null;
  guardianRelation: string;
  guardianPhone: string;
  guardianEmail: string | null;
  guardianId: string | null;
  stage: string;
  stageAt: string;
  assessmentAt: string | null;
  assessmentScore: number | null;
  source: string;
  notes: string | null;
  studentId: string | null;
  yearId: string;
  campusId: string;
  campus: string;
  campusColor: string | null;
  gradeId: string;
  grade: string;
  createdAt: string;
}

const COL_ICON: Record<Column, typeof ClipboardList> = { applied: ClipboardList, assessment: CalendarClock, offered: Star, enrolled: UserCheck };

export function AdmissionsBoard(p: {
  slug: string;
  viewerId: string;
  now: string;
  yearId: string;
  currentYearId: string;
  years: { id: string; name: string }[];
  apps: App[];
  grades: { id: string; name: string; level: number }[];
  campuses: { id: string; name: string }[];
  classes: ClassOpt[];
  stops: StopOpt[];
  selected: { id: string; files: GalleryFile[]; thread: ThreadItem[] } | null;
  canShare: boolean;
  result: DatasetResult;
}) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [apps, setApps] = useState(p.apps);
  const [seen, setSeen] = useState(p.apps);
  if (seen !== p.apps) {
    setSeen(p.apps);
    setApps(p.apps);
  }
  const [dragging, setDragging] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<App | null>(null);
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const nowMs = new Date(p.now).getTime();
  const year = p.years.find((y) => y.id === p.yearId);
  const closed = apps.filter((a) => a.stage === "declined" || a.stage === "withdrawn");
  const openId = search.get("open");
  const openApp = apps.find((a) => a.id === openId) ?? null;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const id = String(e.active.id);
    const to = e.over?.id as Column | undefined;
    const app = apps.find((a) => a.id === id);
    if (!app || !to || app.stage === to || app.stage === "enrolled") return;
    if (to === "enrolled") return setEnrolling(app);
    setApps((list) => list.map((a) => (a.id === id ? { ...a, stage: to, stageAt: new Date().toISOString() } : a)));
    start(async () => {
      const res = await moveApplication(p.slug, id, to);
      if (!res.ok) {
        toast.error(t(res.error as MessageKey));
        setApps(p.apps);
      } else toast.success(t("admissions.moved", { stage: t(`admissions.stage_${to}` as MessageKey) }));
    });
  };

  const dragged = apps.find((a) => a.id === dragging);

  return (
    <div>
      <PageHeader
        title={t("admissions.title")}
        subtitle={t("admissions.subtitle", { count: fmt.number(apps.filter((a) => !["declined", "withdrawn"].includes(a.stage)).length), year: year?.name ?? "" })}
        actions={
          <>
            <DataToolbar slug={p.slug} dataset="applications" query={`year=${p.yearId}`} result={p.result} canShare={p.canShare} />
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {t("admissions.new")}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          {t("admissions.forYear")}
          <select className={selectClass} value={p.yearId} onChange={(e) => setParam("year", e.target.value)}>
            {p.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-subtle">{t("admissions.dragHint")}</p>
      </div>

      <DndContext id="admissions-board" sensors={sensors} onDragStart={(e) => setDragging(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="grid gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = apps.filter((a) => a.stage === col);
            return <BoardColumn key={col} col={col} items={items} nowMs={nowMs} onOpen={(id) => setParam("open", id)} dragging={dragging} />;
          })}
        </div>
        <DragOverlay>{dragged ? <AppCard app={dragged} nowMs={nowMs} overlay /> : null}</DragOverlay>
      </DndContext>

      {closed.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowClosed((v) => !v)} className="text-sm font-medium text-muted hover:text-fg">
            {showClosed ? "▾" : "▸"} {t("admissions.closed", { count: closed.length })}
          </button>
          {showClosed && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {closed.map((a) => (
                <button key={a.id} type="button" onClick={() => setParam("open", a.id)} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-start text-sm opacity-80 hover:opacity-100">
                  <span className="truncate">{pick(locale, a.childName, a.childNameAr)}</span>
                  <Badge tone={a.stage === "declined" ? "danger" : "neutral"}>{t(`admissions.stage_${a.stage}` as MessageKey)}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ApplicationSheet
        slug={p.slug}
        open={creating || !!openApp}
        app={creating ? null : openApp}
        details={openApp && p.selected?.id === openApp.id ? p.selected : null}
        onClose={() => (setCreating(false), setParam("open", null))}
        onEnroll={(a) => setEnrolling(a)}
        years={p.years}
        defaultYearId={p.yearId}
        grades={p.grades}
        campuses={p.campuses}
        viewerId={p.viewerId}
        now={p.now}
      />
      <EnrollModal slug={p.slug} app={enrolling} onClose={() => setEnrolling(null)} classes={p.classes} stops={p.stops} thisYear={enrolling?.yearId === p.currentYearId} yearName={p.years.find((y) => y.id === enrolling?.yearId)?.name ?? ""} />
    </div>
  );
}

function BoardColumn({ col, items, nowMs, onOpen, dragging }: { col: Column; items: App[]; nowMs: number; onOpen: (id: string) => void; dragging: string | null }) {
  const { t, fmt } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: col });
  const Icon = COL_ICON[col];
  return (
    <section ref={setNodeRef} className={cn("flex min-h-64 flex-col rounded-[var(--radius-card)] border border-line bg-sunken/60 p-2 transition", isOver && "border-accent-line bg-accent-soft/40", dragging && !isOver && "border-dashed")}>
      <header className="flex items-center justify-between px-2 py-1.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-muted" /> {t(`admissions.stage_${col}` as MessageKey)}
        </h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium tabular text-muted">{fmt.number(items.length)}</span>
      </header>
      <div className="mt-1 flex flex-1 flex-col gap-2">
        {items.map((a) => (
          <DraggableCard key={a.id} app={a} nowMs={nowMs} onOpen={() => onOpen(a.id)} />
        ))}
        {!items.length && <p className="grid flex-1 place-items-center py-8 text-xs text-subtle">{t("admissions.emptyColumn")}</p>}
      </div>
    </section>
  );
}

function DraggableCard({ app, nowMs, onOpen }: { app: App; nowMs: number; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id, disabled: app.stage === "enrolled" });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} className={cn("outline-none", isDragging && "opacity-30")}>
      <AppCard app={app} nowMs={nowMs} />
    </div>
  );
}

function AppCard({ app, nowMs, overlay }: { app: App; nowMs: number; overlay?: boolean }) {
  const { t, fmt, locale } = useI18n();
  const days = Math.floor((nowMs - new Date(app.stageAt).getTime()) / DAY);
  const stale = days > 10 && app.stage !== "enrolled";
  return (
    <motion.article layout={!overlay} className={cn("cursor-grab rounded-xl border border-line bg-surface p-3 text-sm shadow-sm transition hover:border-accent-line active:cursor-grabbing", overlay && "rotate-1 shadow-lift")}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">{pick(locale, app.childName, app.childNameAr)}</p>
        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: app.campusColor ?? "var(--accent)" }} title={app.campus} />
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {app.grade} · {app.campus}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {app.guardianId && (
          <Badge tone="info">
            <Users className="size-3" /> {t("admissions.sibling")}
          </Badge>
        )}
        {app.source === "web" && (
          <Badge>
            <Globe className="size-3" /> {t("admissions.source_web")}
          </Badge>
        )}
        {app.assessmentScore != null && <Badge tone={app.assessmentScore >= 70 ? "success" : app.assessmentScore >= 50 ? "warning" : "danger"}>{fmt.number(app.assessmentScore)}%</Badge>}
        {app.stage === "assessment" && app.assessmentAt && app.assessmentScore == null && (
          <Badge tone="accent">
            <CalendarClock className="size-3" /> {fmt.date(app.assessmentAt, "short")}
          </Badge>
        )}
        <span className={cn("ms-auto text-[0.7rem] tabular", stale ? "text-warning" : "text-subtle")}>{days <= 0 ? t("admissions.today") : t("admissions.days", { days: fmt.number(days) })}</span>
      </div>
    </motion.article>
  );
}

const blankApp = (yearId: string): ApplicationInput => ({
  yearId,
  campusId: "",
  gradeId: "",
  childName: "",
  childNameAr: "",
  gender: "m",
  dob: "",
  nationality: "QA",
  previousSchool: "",
  guardianName: "",
  guardianNameAr: "",
  guardianRelation: "father",
  guardianPhone: "",
  guardianEmail: "",
  source: "walkin",
  notes: "",
});

function ApplicationSheet({
  slug,
  open,
  app,
  details,
  onClose,
  onEnroll,
  years,
  defaultYearId,
  grades,
  campuses,
  viewerId,
  now,
}: {
  slug: string;
  open: boolean;
  app: App | null;
  details: { files: GalleryFile[]; thread: ThreadItem[] } | null;
  onClose: () => void;
  onEnroll: (a: App) => void;
  years: { id: string; name: string }[];
  defaultYearId: string;
  grades: { id: string; name: string }[];
  campuses: { id: string; name: string }[];
  viewerId: string;
  now: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const fromApp = (a: App | null): ApplicationInput =>
    a
      ? {
          yearId: a.yearId,
          campusId: a.campusId,
          gradeId: a.gradeId,
          childName: a.childName,
          childNameAr: a.childNameAr ?? "",
          gender: a.gender as "m" | "f",
          dob: a.dob,
          nationality: a.nationality ?? "",
          previousSchool: a.previousSchool ?? "",
          guardianName: a.guardianName,
          guardianNameAr: a.guardianNameAr ?? "",
          guardianRelation: a.guardianRelation as ApplicationInput["guardianRelation"],
          guardianPhone: a.guardianPhone,
          guardianEmail: a.guardianEmail ?? "",
          source: a.source as ApplicationInput["source"],
          notes: a.notes ?? "",
        }
      : { ...blankApp(defaultYearId), campusId: campuses[0]?.id ?? "" };
  const [form, setForm] = useState<ApplicationInput>(() => fromApp(app));
  const [assessAt, setAssessAt] = useState("");
  const [score, setScore] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);
  const cur = open ? (app?.id ?? "new") : null;
  if (cur !== key) {
    setKey(cur);
    setForm(fromApp(app));
    setAssessAt(app?.assessmentAt ? app.assessmentAt.slice(0, 16) : "");
    setScore(app?.assessmentScore != null ? String(app.assessmentScore) : "");
    setErrors({});
  }
  const set = <K extends keyof ApplicationInput>(k: K, v: ApplicationInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () =>
    start(async () => {
      const res = await saveApplication(slug, app?.id ?? null, form);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
        else toast.error(t(res.error as MessageKey));
        return;
      }
      toast.success(t("common.saved"));
      if (!app) onClose();
      router.refresh();
    });
  const move = (stage: "assessment" | "offered" | "declined" | "withdrawn" | "applied", extra: { assessmentAt?: string; score?: number | null } = {}) =>
    start(async () => {
      const res = await moveApplication(slug, app!.id, stage, extra);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("admissions.moved", { stage: t(`admissions.stage_${stage}` as MessageKey) }));
      router.refresh();
    });

  const editable = !app || app.stage !== "enrolled";
  const f = (k: keyof ApplicationInput, label: string, props: React.ComponentProps<"input"> = {}) => (
    <Field label={label} htmlFor={`ap-${k}`} error={errors[k]}>
      <Input id={`ap-${k}`} value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} aria-invalid={!!errors[k]} disabled={!editable} {...props} />
    </Field>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && !pending && onClose()}
      title={app ? `${pick(locale, app.childName, app.childNameAr)} · ${app.number}` : t("admissions.new")}
      footer={
        editable && (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {app && (
          <div className="rounded-2xl border border-line bg-sunken/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={app.stage === "enrolled" ? "success" : app.stage === "declined" ? "danger" : "accent"}>{t(`admissions.stage_${app.stage}` as MessageKey)}</Badge>
              {app.guardianId && <Badge tone="info">{t("admissions.existingFamily")}</Badge>}
              <Badge>{t(`admissions.source_${app.source}` as MessageKey)}</Badge>
            </div>
            {app.stage === "enrolled" && app.studentId ? (
              <Link href={`/w/${slug}/students/${app.studentId}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                <GraduationCap className="size-4" /> {t("admissions.viewStudent")}
              </Link>
            ) : (
              <div className="mt-3 space-y-3">
                {(app.stage === "applied" || app.stage === "assessment") && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
                    <Field label={t("admissions.assessmentAt")} htmlFor="ap-at">
                      <Input id="ap-at" type="datetime-local" value={assessAt} onChange={(e) => setAssessAt(e.target.value)} />
                    </Field>
                    <Field label={t("admissions.score")} htmlFor="ap-score">
                      <Input id="ap-score" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                    </Field>
                    <Button variant="secondary" disabled={pending || (!assessAt && !score)} onClick={() => move("assessment", { assessmentAt: assessAt ? new Date(assessAt).toISOString() : undefined, score: score ? Number(score) : null })}>
                      <CalendarClock className="size-4" /> {app.stage === "applied" ? t("admissions.scheduleAssessment") : t("admissions.recordScore")}
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {(app.stage === "assessment" || app.stage === "applied") && (
                    <Button size="sm" onClick={() => move("offered")} disabled={pending}>
                      <Star className="size-4" /> {t("admissions.makeOffer")}
                    </Button>
                  )}
                  {app.stage === "offered" && (
                    <Button size="sm" onClick={() => onEnroll(app)} disabled={pending}>
                      <CheckCircle2 className="size-4" /> {t("admissions.enroll")}
                    </Button>
                  )}
                  {["declined", "withdrawn"].includes(app.stage) ? (
                    <Button size="sm" variant="secondary" onClick={() => move("applied")} disabled={pending}>
                      {t("admissions.reopen")}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => move("declined")} disabled={pending}>
                        <XCircle className="size-4" /> {t("admissions.decline")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => move("withdrawn")} disabled={pending}>
                        {t("admissions.withdraw")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("apply.year")} htmlFor="ap-year">
            <select id="ap-year" className={inputClass} value={form.yearId} onChange={(e) => set("yearId", e.target.value)} disabled={!editable}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("apply.campus")} htmlFor="ap-campus" error={errors.campusId}>
            <select id="ap-campus" className={inputClass} value={form.campusId} onChange={(e) => set("campusId", e.target.value)} disabled={!editable}>
              <option value="">—</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("apply.grade")} htmlFor="ap-grade" error={errors.gradeId}>
            <select id="ap-grade" className={inputClass} value={form.gradeId} onChange={(e) => set("gradeId", e.target.value)} disabled={!editable}>
              <option value="">—</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <p className="text-sm font-semibold">{t("admissions.child")}</p>
        {f("childName", t("admissions.childName"))}
        {f("childNameAr", t("students.nameAr"), { dir: "rtl" })}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("students.gender")}</p>
            <Segmented label={t("students.gender")} value={form.gender} onChange={(v) => editable && set("gender", v)} options={[{ value: "m", label: t("school.gender_m") }, { value: "f", label: t("school.gender_f") }]} />
          </div>
          {f("dob", t("students.dob"), { type: "date" })}
          <Field label={t("students.nationality")} htmlFor="ap-nat">
            <select id="ap-nat" className={inputClass} value={form.nationality} onChange={(e) => set("nationality", e.target.value)} disabled={!editable}>
              {NATIONALITIES.map((c) => (
                <option key={c} value={c}>
                  {regions.of(c)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {f("previousSchool", t("students.previousSchool"))}

        <p className="text-sm font-semibold">{t("admissions.guardian")}</p>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          {f("guardianName", t("admissions.guardianName"))}
          <Field label={t("admissions.relation")} htmlFor="ap-rel">
            <select id="ap-rel" className={inputClass} value={form.guardianRelation} onChange={(e) => set("guardianRelation", e.target.value as ApplicationInput["guardianRelation"])} disabled={!editable}>
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {t(`school.relation_${r}` as MessageKey)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {f("guardianPhone", t("guardians.colPhone"), { dir: "ltr", inputMode: "tel" })}
          {f("guardianEmail", t("guardians.colEmail"), { dir: "ltr", type: "email" })}
        </div>
        {!app && (
          <Field label={t("admissions.source")} htmlFor="ap-src">
            <select id="ap-src" className={inputClass} value={form.source} onChange={(e) => set("source", e.target.value as ApplicationInput["source"])}>
              {["walkin", "referral", "sibling", "web"].map((s) => (
                <option key={s} value={s}>
                  {t(`admissions.source_${s}` as MessageKey)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("admissions.notes")} htmlFor="ap-notes">
          <Textarea id="ap-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={!editable} />
        </Field>

        {app && details && (
          <>
            <div>
              <p className="mb-2 text-sm font-semibold">{t("admissions.documents")}</p>
              <Gallery slug={slug} entityType="application" entityId={app.id} kind="file" files={details.files} canEdit emptyLabel={t("admissions.documentsEmpty")} addLabel={t("students.addDocument")} />
            </div>
            <Thread slug={slug} entityType="application" entityId={app.id} items={details.thread} now={now} viewerId={viewerId} />
          </>
        )}
      </div>
    </Sheet>
  );
}

function EnrollModal({ slug, app, onClose, classes, stops, thisYear, yearName }: { slug: string; app: App | null; onClose: () => void; classes: ClassOpt[]; stops: StopOpt[]; thisYear: boolean; yearName: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [pending, start] = useTransition();
  const options = useMemo(() => classes.filter((c) => app && c.campusId === app.campusId && c.grade === app.grade), [classes, app]);
  const [sectionId, setSectionId] = useState("");
  const [joinedOn, setJoinedOn] = useState("");
  const [busStopId, setBusStopId] = useState("");
  const [was, setWas] = useState<string | null>(null);
  if ((app?.id ?? null) !== was) {
    setWas(app?.id ?? null);
    const firstOpen = options.find((c) => c.count < c.capacity);
    setSectionId(firstOpen?.id ?? "");
    setJoinedOn(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date()));
    setBusStopId("");
  }
  if (!app) return null;
  const name = pick(locale, app.childName, app.childNameAr);
  const campusStops = stops.filter((s) => s.campusId === app.campusId);
  const submit = () =>
    start(async () => {
      const res = await enrollApplication(slug, app.id, { sectionId, joinedOn, busStopId });
      if (!res.ok) return void toast.error(t(res.error as MessageKey, { capacity: options.find((c) => c.id === sectionId)?.capacity ?? 0 }));
      celebrate(reduced);
      toast.success(t("admissions.enrolled", { name }));
      onClose();
      router.refresh();
    });
  return (
    <Modal
      open={!!app}
      onOpenChange={(o) => !o && onClose()}
      title={t("admissions.enrollTitle", { name })}
      description={thisYear ? t("admissions.enrollBody") : t("admissions.enrollNextYear", { name, year: yearName })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || (thisYear && !sectionId)}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {t("admissions.enroll")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {thisYear && (
          <Field label={t("admissions.pickClass")} htmlFor="en-class">
            <select id="en-class" className={inputClass} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {options.map((c) => (
                <option key={c.id} value={c.id} disabled={c.count >= c.capacity}>
                  {c.label} · {t("school.capacity", { count: c.count, capacity: c.capacity })}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("admissions.joinOn")} htmlFor="en-join">
          <Input id="en-join" type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />
        </Field>
        {campusStops.length > 0 && (
          <Field label={t("students.busStop")} htmlFor="en-bus">
            <select id="en-bus" className={inputClass} value={busStopId} onChange={(e) => setBusStopId(e.target.value)}>
              <option value="">{t("students.noBus")}</option>
              {[...new Set(campusStops.map((s) => s.route))].map((r) => (
                <optgroup key={r} label={r}>
                  {campusStops
                    .filter((s) => s.route === r)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
