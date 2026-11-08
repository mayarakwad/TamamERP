"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { CalendarPlus, ClipboardCheck, FileText, Loader2, NotebookPen } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import { scheduleExam } from "@/app/actions/exams";

export function ExamsOverview(p: {
  slug: string;
  term: { id: string; name: string };
  yearName: string;
  manage: boolean;
  books: { sectionId: string; subjectId: string; section: string; subject: string; color: string | null; done: number; total: number; next: { name: string; date: string } | null }[];
  series: { name: string; from: string; to: string; total: number; marked: number }[];
  classes: { id: string; label: string; homeroom: string | null; marked: number; due: number; published: number; drafts: number; students: number; mine: boolean }[];
  grades: { id: string; name: string }[];
}) {
  const { t, fmt } = useI18n();
  const [scheduling, setScheduling] = useState(false);
  const mineFirst = !p.manage;
  return (
    <div className="space-y-[var(--gap)]">
      <PageHeader
        title={t("exams.title")}
        subtitle={t("exams.subtitle", { term: p.term.name, year: p.yearName })}
        actions={
          p.manage && (
            <Button onClick={() => setScheduling(true)}>
              <CalendarPlus className="size-4" /> {t("exams.newSeries")}
            </Button>
          )
        }
      />

      {p.manage && p.series.length > 0 && (
        <div className="grid gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-3">
          {p.series.map((x) => (
            <Card key={x.name}>
              <CardBody>
                <p className="font-semibold">{x.name}</p>
                <p className="text-xs text-muted">
                  {fmt.date(x.from, "short")}
                  {x.to.slice(0, 10) !== x.from.slice(0, 10) ? ` – ${fmt.date(x.to, "short")}` : ""}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{t("exams.progress")}</span>
                  <span className="tabular">{t("exams.marked", { done: x.marked, total: x.total })}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${x.total ? (x.marked / x.total) * 100 : 0}%` }} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {(mineFirst || p.books.length > 0) && !p.manage && (
        <Card>
          <CardHeader title={t("exams.myGradebooks")} icon={<NotebookPen className="size-4" />} />
          <CardBody>
            {p.books.length ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {p.books.map((b) => (
                  <Link key={`${b.sectionId}${b.subjectId}`} href={`/w/${p.slug}/exams/gradebook?section=${b.sectionId}&subject=${b.subjectId}&term=${p.term.id}`} className="lift rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="size-2.5 rounded-full" style={{ background: b.color ?? "var(--accent)" }} />
                        {b.subject}
                      </span>
                      <span className="font-semibold tabular">{b.section}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className={cn(b.done < b.total ? "text-warning" : "text-success")}>{b.total ? t("exams.marked", { done: b.done, total: b.total }) : t("exams.noneYet")}</span>
                      {b.next && <span className="text-subtle">{t("exams.nextUp", { name: b.next.name, date: fmt.date(b.next.date, "short") })}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={<NotebookPen className="size-6" />} title={t("exams.emptyTitle")} body={t("exams.emptyBody")} />
            )}
          </CardBody>
        </Card>
      )}

      {p.classes.length > 0 && (
        <Card>
          <CardHeader title={p.manage ? t("exams.allClasses") : t("exams.reportCards")} icon={<ClipboardCheck className="size-4" />} />
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-2 text-start font-medium">{t("school.section")}</th>
                  <th className="py-2 text-start font-medium">{t("school.homeroom")}</th>
                  <th className="py-2 text-start font-medium">{t("exams.progress")}</th>
                  <th className="py-2 text-start font-medium">{t("exams.reportCards")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.classes.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-2 font-semibold tabular">{c.label}</td>
                    <td className="py-2 text-muted">{c.homeroom ?? "—"}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-sunken">
                          <div className={cn("h-full rounded-full", c.marked < c.due ? "bg-warning" : "bg-success")} style={{ width: `${c.due ? (c.marked / c.due) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs tabular text-muted">{t("exams.marked", { done: c.marked, total: c.due })}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      {c.published ? <Badge tone="success">{t("reportCards.status_published")} {c.published}</Badge> : c.drafts ? <Badge tone="warning">{t("reportCards.status_draft")} {c.drafts}/{c.students}</Badge> : <Badge>{t("reportCards.status_none")}</Badge>}
                    </td>
                    <td className="py-2 text-end">
                      <Link href={`/w/${p.slug}/exams/report-cards?section=${c.id}&term=${p.term.id}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                        <FileText className="size-4" /> {t("exams.reportCards")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {p.manage && <ScheduleModal slug={p.slug} open={scheduling} onClose={() => setScheduling(false)} termId={p.term.id} grades={p.grades} />}
    </div>
  );
}

function ScheduleModal({ slug, open, onClose, termId, grades }: { slug: string; open: boolean; onClose: () => void; termId: string; grades: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "End-of-term exam", nameAr: "اختبار نهاية الفصل", date: "", maxScore: 100, weight: 35, gradeIds: [] as string[] });
  const submit = () =>
    start(async () => {
      const res = await scheduleExam(slug, { ...form, termId });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("common.saved"));
      onClose();
      router.refresh();
    });
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("exams.seriesTitle")}
      description={t("exams.seriesBody")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !form.date || !form.gradeIds.length}>
            {pending && <Loader2 className="size-4 animate-spin" />} {t("exams.newSeries")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("gradebook.name")} htmlFor="ex-name">
            <Input id="ex-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t("students.nameAr")} htmlFor="ex-name-ar">
            <Input id="ex-name-ar" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("gradebook.date")} htmlFor="ex-date">
            <Input id="ex-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label={t("gradebook.maxScore")} htmlFor="ex-max">
            <Input id="ex-max" inputMode="numeric" value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
          <Field label={t("gradebook.weight")} htmlFor="ex-weight">
            <Input id="ex-weight" inputMode="numeric" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("exams.grades")}</p>
          <div className="flex flex-wrap gap-1.5">
            {grades.map((g) => {
              const on = form.gradeIds.includes(g.id);
              return (
                <button key={g.id} type="button" aria-pressed={on} onClick={() => setForm({ ...form, gradeIds: on ? form.gradeIds.filter((x) => x !== g.id) : [...form.gradeIds, g.id] })} className={cn("rounded-full border px-3 py-1 text-xs transition", on ? "border-accent bg-accent-soft text-accent" : "border-line hover:border-accent-line")}>
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
