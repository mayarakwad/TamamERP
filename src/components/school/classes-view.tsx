"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { CalendarCheck, CalendarX, CheckCircle2, Clock, DoorOpen, Loader2, Plus, School } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, inputClass } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import { saveSection, type SectionInput } from "@/app/actions/academics";

export interface SectionCard {
  id: string;
  label: string;
  name: string;
  level: number;
  grade: string;
  gradeId: string;
  campusId: string;
  campus: string;
  campusColor: string | null;
  room: string | null;
  capacity: number;
  homeroomId: string | null;
  homeroom: string | null;
  students: number;
  placed: number;
  needed: number;
  roll: { absent: number } | null;
  homeroomMine: boolean;
}

export function ClassesView({ slug, yearName, canManage, mine, sections, grades, campuses, staff, schoolDay }: { slug: string; yearName: string; canManage: boolean; mine: boolean; sections: SectionCard[]; grades: { id: string; name: string }[]; campuses: { id: string; name: string }[]; staff: { id: string; name: string; title: string | null; campusId: string | null }[]; schoolDay: boolean }) {
  const { t, fmt } = useI18n();
  const [editing, setEditing] = useState<SectionCard | "new" | null>(null);
  const byCampus = campuses.map((c) => ({ ...c, items: sections.filter((s) => s.campusId === c.id) })).filter((c) => c.items.length || canManage);
  return (
    <div>
      <PageHeader
        title={mine ? t("classes.mine") : t("classes.title")}
        subtitle={t("classes.subtitle", { count: fmt.number(sections.length), year: yearName })}
        actions={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> {t("classes.new")}
            </Button>
          )
        }
      />
      {!sections.length ? (
        <EmptyState icon={<School className="size-6" />} title={t("classes.emptyTitle")} body={t("classes.emptyBody")} />
      ) : (
        <div className="space-y-8">
          {byCampus.map((c) => (
            <section key={c.id}>
              {byCampus.length > 1 && <h2 className="mb-3 text-sm font-semibold text-muted">{c.name}</h2>}
              <div className="grid gap-[var(--gap)] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {c.items.map((s, i) => (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
                    <Link href={`/w/${slug}/classes/${s.id}`} className="lift block rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xl font-semibold tabular tracking-tight">{s.label}</p>
                          <p className="text-xs text-muted">{s.grade}</p>
                        </div>
                        {s.homeroomMine && <Badge tone="accent">{t("school.homeroom")}</Badge>}
                      </div>
                      <p className="mt-3 truncate text-sm">{s.homeroom ?? <span className="text-subtle">{t("classes.noHomeroom")}</span>}</p>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-muted">
                          <span>{t("classes.students")}</span>
                          <span className="tabular">{t("school.capacity", { count: s.students, capacity: s.capacity })}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                          <div className={cn("h-full rounded-full", s.students >= s.capacity ? "bg-warning" : "bg-accent")} style={{ width: `${Math.min(100, (s.students / s.capacity) * 100)}%` }} />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                        {s.room && (
                          <Badge>
                            <DoorOpen className="size-3" /> {s.room}
                          </Badge>
                        )}
                        {schoolDay &&
                          (s.roll ? (
                            <Badge tone={s.roll.absent ? "warning" : "success"}>
                              <CalendarCheck className="size-3" /> {t("classes.todayTaken", { absent: s.roll.absent })}
                            </Badge>
                          ) : (
                            <Badge tone="danger">
                              <CalendarX className="size-3" /> {t("classes.todayNotTaken")}
                            </Badge>
                          ))}
                        {canManage &&
                          (s.placed >= s.needed && s.needed > 0 ? (
                            <Badge tone="success">
                              <CheckCircle2 className="size-3" /> {t("classes.complete")}
                            </Badge>
                          ) : (
                            <Badge tone="info">
                              <Clock className="size-3" /> {t("classes.scheduled", { placed: s.placed, needed: s.needed })}
                            </Badge>
                          ))}
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {canManage && <SectionModal slug={slug} editing={editing} onClose={() => setEditing(null)} grades={grades} campuses={campuses} staff={staff} />}
    </div>
  );
}

export function SectionModal({ slug, editing, onClose, grades, campuses, staff }: { slug: string; editing: SectionCard | "new" | null; onClose: () => void; grades: { id: string; name: string }[]; campuses: { id: string; name: string }[]; staff: { id: string; name: string; title: string | null; campusId: string | null }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = (): SectionInput => (editing && editing !== "new" ? { campusId: editing.campusId, gradeId: editing.gradeId, name: editing.name, room: editing.room ?? "", capacity: editing.capacity, homeroomId: editing.homeroomId ?? "" } : { campusId: campuses[0]?.id ?? "", gradeId: "", name: "A", room: "", capacity: 24, homeroomId: "" });
  const [form, setForm] = useState<SectionInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [was, setWas] = useState<typeof editing>(null);
  if (editing !== was) {
    setWas(editing);
    setForm(blank());
    setErrors({});
  }
  const submit = () =>
    start(async () => {
      const res = await saveSection(slug, editing && editing !== "new" ? editing.id : null, form);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
        else toast.error(t(res.error as MessageKey));
        return;
      }
      toast.success(t("classes.saved"));
      onClose();
      router.refresh();
    });
  const teachers = staff.filter((e) => !form.campusId || e.campusId === form.campusId);
  return (
    <Modal
      open={!!editing}
      onOpenChange={(o) => !o && onClose()}
      title={editing === "new" ? t("classes.new") : t("classes.edit")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("school.campus")} htmlFor="sc-campus" error={errors.campusId}>
            <select id="sc-campus" className={inputClass} value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("school.grade")} htmlFor="sc-grade" error={errors.gradeId}>
            <select id="sc-grade" className={inputClass} value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })}>
              <option value="">—</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("classes.letter")} htmlFor="sc-name" error={errors.name} hint={t("classes.letterHint")}>
            <Input id="sc-name" dir="ltr" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })} />
          </Field>
          <Field label={t("school.room")} htmlFor="sc-room">
            <Input id="sc-room" dir="ltr" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          </Field>
          <Field label={t("classes.capacity")} htmlFor="sc-cap">
            <Input id="sc-cap" inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
        </div>
        <Field label={t("school.homeroom")} htmlFor="sc-home">
          <select id="sc-home" className={inputClass} value={form.homeroomId} onChange={(e) => setForm({ ...form, homeroomId: e.target.value })}>
            <option value="">—</option>
            {teachers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.title ? ` · ${e.title}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
