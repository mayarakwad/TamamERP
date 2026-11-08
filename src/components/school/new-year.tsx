"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, DatabaseBackup, GraduationCap, Loader2, PartyPopper, Repeat, School, UserPlus } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { celebrate } from "@/components/motion/celebrate";
import type { MessageKey } from "@/lib/i18n";
import { startNewYear } from "@/app/actions/school";

export function NewYear({ slug, from, to, counts, byGrade, feesSet }: { slug: string; from: string; to: string; counts: { promote: number; graduate: number; join: number; transfer: number; classes: number }; byGrade: { name: string; now: number; next: number }[]; feesSet: boolean }) {
  const { t, fmt, dir } = useI18n();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [copyTimetables, setCopy] = useState(true);
  const [pct, setPct] = useState(3.5);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const max = Math.max(1, ...byGrade.flatMap((g) => [g.now, g.next]));
  const go = () =>
    start(async () => {
      const res = await startNewYear(slug, { copyTimetables, feeIncreasePct: pct, confirm });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      celebrate(reduced);
      toast.success(t("rollover.done", { year: res.year, promoted: res.promoted, graduated: res.graduated }));
      router.push(`/w/${slug}`);
    });
  const lines = [
    { icon: Repeat, text: t("rollover.promote", { count: fmt.number(counts.promote) }) },
    { icon: GraduationCap, text: t("rollover.graduate", { count: fmt.number(counts.graduate) }) },
    ...(counts.join ? [{ icon: UserPlus, text: t("rollover.join", { count: fmt.number(counts.join) }) }] : []),
    ...(counts.transfer ? [{ icon: School, text: t("rollover.transfer", { count: fmt.number(counts.transfer) }) }] : []),
    { icon: School, text: t("rollover.classes", { count: fmt.number(counts.classes) }) },
  ];
  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/settings/school`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("schoolSetup.title")}
      </Link>
      <PageHeader title={t("rollover.title")} subtitle={t("rollover.subtitle", { from, to })} />
      <div className="grid gap-[var(--gap)] lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-3">
            {lines.map((l, i) => (
              <motion.p key={l.text} initial={reduced ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center gap-3 text-sm">
                <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
                  <l.icon className="size-4" />
                </span>
                {l.text}
              </motion.p>
            ))}
            <div className="space-y-3 border-t border-line pt-4">
              <Switch checked={copyTimetables} onChange={setCopy} label={t("rollover.copyTimetables")} />
              <div>
                <p className="mb-1.5 text-sm font-medium">{t("rollover.fees", { year: to })}</p>
                {feesSet ? (
                  <p className="text-sm text-muted">{t("rollover.feesSet", { year: to })}</p>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    {t("rollover.feesCopy")}
                    <span className="relative w-24">
                      <Input inputMode="decimal" value={pct} onChange={(e) => setPct(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} className="pe-6" />
                      <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-subtle">%</span>
                    </span>
                  </label>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("rollover.byGrade")} />
          <CardBody>
            <div className="space-y-1.5">
              {byGrade.map((g) => (
                <div key={g.name} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-2 text-xs">
                  <span className="truncate text-muted">{g.name}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-sunken" title={`${t("rollover.from")}: ${g.now}`}>
                    <div className="h-full rounded-full bg-subtle" style={{ width: `${(g.now / max) * 100}%` }} />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sunken" title={`${t("rollover.to")}: ${g.next}`}>
                    <motion.div className="h-full rounded-full bg-accent" initial={reduced ? false : { width: 0 }} animate={{ width: `${(g.next / max) * 100}%` }} transition={{ duration: 0.7 }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full bg-subtle" /> {t("rollover.from")} · {from}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full bg-accent" /> {t("rollover.to")} · {to}
              </span>
            </div>
          </CardBody>
        </Card>
      </div>
      <Card className="border-warning/50">
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl space-y-2">
            <p className="flex items-start gap-2 text-sm">
              <DatabaseBackup className="mt-0.5 size-4 shrink-0 text-warning" /> {t("rollover.backup")}
            </p>
            <Link href={`/w/${slug}/settings/data`} className="text-sm text-accent hover:underline">
              {t("rollover.backupLink")}
            </Link>
          </div>
          <div className="flex items-end gap-2">
            <Field label={t("rollover.confirmLabel", { year: to })} htmlFor="ny-confirm">
              <Input id="ny-confirm" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={to} />
            </Field>
            <Button onClick={go} disabled={pending || confirm.trim() !== to}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <PartyPopper className="size-4" />} {t("rollover.go", { year: to })}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
