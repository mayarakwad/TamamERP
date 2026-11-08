"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Lightbulb, Loader2, Printer, Send, Undo2 } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { selectClass } from "@/components/business/list-view";
import { celebrate } from "@/components/motion/celebrate";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import { principalLine, suggestComments } from "@/lib/school/report-card";
import { publishReportCards, saveReportComment, unpublishReportCard } from "@/app/actions/exams";

interface Row {
  id: string;
  cardId: string | null;
  name: string;
  plainName: string;
  firstName: string;
  gender: string;
  color: string | null;
  status: string;
  teacherComment: string;
  principalComment: string;
  average: number | null;
  subjects: { subject: string; color: string | null; percent: number | null; letter: string | null }[];
  attendance: { days: number; away: number };
}

const TONE: Record<string, "neutral" | "warning" | "success"> = { none: "neutral", draft: "warning", published: "success" };

export function ReportCards(p: { slug: string; section: { id: string; label: string; campus: string; homeroom: string | null }; term: { id: string; name: string }; terms: { id: string; name: string }[]; students: Row[]; canTeacher: boolean; canPrincipal: boolean; passMark: number }) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const reduced = useReducedMotion();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const [selected, setSelected] = useState<string | null>(p.students.find((s) => !s.teacherComment)?.id ?? p.students[0]?.id ?? null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const done = p.students.filter((s) => s.teacherComment).length;
  const unpublished = p.students.filter((s) => s.status !== "published").length;
  const st = p.students.find((s) => s.id === selected) ?? null;

  const publish = () =>
    start(async () => {
      const res = await publishReportCards(p.slug, p.section.id, p.term.id);
      setConfirm(false);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      celebrate(reduced);
      toast.success(t("reportCards.published", { count: res.count }));
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Link href={`/w/${p.slug}/exams`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("exams.title")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("reportCards.title")}</h1>
          <p className="text-sm text-muted">
            {t("reportCards.subtitle", { class: p.section.label, term: p.term.name })} · {p.section.campus}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t("school.term")} className={selectClass} value={p.term.id} onChange={(e) => router.replace(`${pathname}?${new URLSearchParams({ ...Object.fromEntries(search.entries()), term: e.target.value })}`)}>
            {p.terms.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <a href={`/api/w/${p.slug}/export/report-cards?section=${p.section.id}&term=${p.term.id}&format=print`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Printer className="size-4" /> {t("reportCards.printAll")}
          </a>
          {p.canPrincipal && unpublished > 0 && (
            <Button onClick={() => setConfirm(true)}>
              <Send className="size-4" /> {t("reportCards.publishAll", { count: unpublished })}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
          <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${p.students.length ? (done / p.students.length) * 100 : 0}%` }} />
        </div>
        <span className="text-sm text-muted">{t("reportCards.progress", { done, total: p.students.length })}</span>
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <CardBody className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
            {p.students.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelected(s.id)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start text-sm transition", selected === s.id ? "bg-accent-soft" : "hover:bg-sunken")}>
                <Avatar name={s.plainName} color={s.color} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block text-xs text-muted tabular">{s.average != null ? `${fmt.number(s.average)}%` : "—"}</span>
                </span>
                {s.teacherComment ? <Check className="size-4 text-success" /> : null}
                <Badge tone={TONE[s.status]}>{t(`reportCards.status_${s.status}` as MessageKey)}</Badge>
              </button>
            ))}
          </CardBody>
        </Card>
        {st ? <Editor key={st.id} slug={p.slug} row={st} termId={p.term.id} canTeacher={p.canTeacher} canPrincipal={p.canPrincipal} passMark={p.passMark} locale={locale} /> : <p className="text-muted">{t("reportCards.pickStudent")}</p>}
      </div>

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={t("reportCards.publishTitle", { class: p.section.label })}
        description={t("reportCards.publishBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={publish} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("reportCards.publishAll", { count: unpublished })}
            </Button>
          </>
        }
      />
    </div>
  );
}

function Editor({ slug, row, termId, canTeacher, canPrincipal, passMark, locale }: { slug: string; row: Row; termId: string; canTeacher: boolean; canPrincipal: boolean; passMark: number; locale: "en" | "ar" }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [teacher, setTeacher] = useState(row.teacherComment);
  const [principal, setPrincipal] = useState(row.principalComment);
  const [pending, start] = useTransition();
  const published = row.status === "published";
  const ideas = suggestComments(row.average, row.firstName, locale, row.gender);
  const save = () =>
    start(async () => {
      const res = await saveReportComment(slug, { studentId: row.id, termId, ...(canTeacher ? { teacherComment: teacher } : {}), ...(canPrincipal ? { principalComment: principal } : {}) });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("reportCards.saved"));
      router.refresh();
    });
  const unpublish = () =>
    start(async () => {
      if (!row.cardId) return;
      const res = await unpublishReportCard(slug, row.cardId);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      router.refresh();
    });
  return (
    <Card>
      <CardHeader
        title={row.name}
        action={
          <div className="flex items-center gap-2">
            {row.cardId && (
              <a href={`/api/w/${slug}/export/report-card?id=${row.cardId}&format=print`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                <Printer className="size-4" /> {t("reportCards.print")}
              </a>
            )}
            {published && canPrincipal && (
              <Button size="sm" variant="ghost" onClick={unpublish} disabled={pending}>
                <Undo2 className="size-4" /> {t("reportCards.unpublish")}
              </Button>
            )}
          </div>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-sunken p-3">
            <p className="text-xs text-muted">{t("reportCards.average")}</p>
            <p className={cn("text-2xl font-semibold tabular", row.average != null && row.average < passMark && "text-danger")}>{row.average != null ? `${fmt.number(row.average)}%` : "—"}</p>
          </div>
          <div className="rounded-xl bg-sunken p-3 sm:col-span-2">
            <p className="text-xs text-muted">{t("reportCards.attendance")}</p>
            <p className="text-2xl font-semibold tabular">{t("reportCards.days", { present: row.attendance.days - row.attendance.away, days: row.attendance.days })}</p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("reportCards.subjects")}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {row.subjects.map((x) => (
              <div key={x.subject} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <span className="size-2 rounded-full" style={{ background: x.color ?? "var(--accent)" }} />
                  {x.subject}
                </span>
                <span className="flex items-center gap-2 tabular">
                  {x.percent != null ? `${fmt.number(x.percent)}%` : "—"}
                  {x.letter && <Badge tone={x.letter === "F" ? "danger" : x.letter === "A" ? "success" : "neutral"}>{x.letter}</Badge>}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="rc-teacher" className="mb-1.5 block text-sm font-semibold">
            {t("reportCards.teacherComment")}
          </label>
          <Textarea id="rc-teacher" rows={4} value={teacher} onChange={(e) => setTeacher(e.target.value)} disabled={!canTeacher || published} placeholder={t("reportCards.noComment")} />
          {canTeacher && !published && (
            <div className="mt-2 space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Lightbulb className="size-3.5" /> {t("reportCards.suggestions")}
              </p>
              {ideas.map((idea) => (
                <button key={idea} type="button" onClick={() => setTeacher(idea)} className="block w-full rounded-lg border border-dashed border-line px-3 py-2 text-start text-xs text-muted transition hover:border-accent-line hover:text-fg">
                  {idea}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="rc-principal" className="mb-1.5 block text-sm font-semibold">
            {t("reportCards.principalComment")}
          </label>
          <Textarea id="rc-principal" rows={2} value={principal} onChange={(e) => setPrincipal(e.target.value)} disabled={!canPrincipal || published} placeholder={t("reportCards.noComment")} />
          {canPrincipal && !published && !principal && (
            <button type="button" onClick={() => setPrincipal(principalLine(row.average, row.firstName, locale, row.gender))} className="mt-1.5 text-xs text-accent hover:underline">
              <Lightbulb className="me-1 inline size-3.5" />
              {principalLine(row.average, row.firstName, locale, row.gender)}
            </button>
          )}
        </div>
        {!published && (canTeacher || canPrincipal) && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("common.save")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
