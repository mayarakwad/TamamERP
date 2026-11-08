"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { BellRing, CircleDollarSign, Loader2, ReceiptText, Send, Wifi, WifiOff } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { CountUp } from "@/components/motion/count-up";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import { billInstallment, sendFeeReminders } from "@/app/actions/fees";
import { FeesNav } from "./fees-nav";
import { FeePaymentSheet } from "./fee-payment-sheet";

export function FeesOverview(p: {
  slug: string;
  yearId: string;
  yearName: string;
  students: number;
  totals: { billed: number; collected: number; outstanding: number; overdue: number; overdueFamilies: number; discounts: number };
  installments: { index: number; label: string; due: string; count: number; billed: number; paid: number }[];
  campuses: { id: string; name: string; color: string | null; billed: number; paid: number }[];
  top: { partyId: string; guardianId: string | null; online: boolean; name: string; children: string; amount: number; oldest: string }[];
  canManage: boolean;
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [billing, setBilling] = useState<number | null>(null);
  const [billDate, setBillDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date()));
  const [reminding, setReminding] = useState(false);
  const [paying, setPaying] = useState<string | null | false>(false);
  const [pending, start] = useTransition();
  const rate = p.totals.billed ? p.totals.collected / p.totals.billed : 0;

  const bill = () =>
    start(async () => {
      if (billing == null) return;
      const res = await billInstallment(p.slug, p.yearId, billing, billDate);
      setBilling(null);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(res.count ? t("fees.billed_ok", { count: res.count, total: fmt.money(res.total) }) : t("fees.nothingToBill"));
      router.refresh();
    });
  const remind = () =>
    start(async () => {
      const res = await sendFeeReminders(p.slug);
      setReminding(false);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("fees.remindersSent", { count: res.count }));
      router.refresh();
    });

  const tiles = [
    { label: t("fees.billed"), value: p.totals.billed, tone: "" },
    { label: t("fees.collected"), value: p.totals.collected, tone: "text-success" },
    { label: t("fees.outstanding"), value: p.totals.outstanding, tone: "" },
    { label: t("fees.overdue"), value: p.totals.overdue, tone: "text-danger", hint: t("fees.overdueFamilies", { count: p.totals.overdueFamilies }) },
  ];

  return (
    <div>
      <PageHeader
        title={t("fees.title")}
        subtitle={t("fees.subtitle", { year: p.yearName, count: fmt.number(p.students) })}
        actions={
          p.canManage && (
            <>
              <Button variant="secondary" onClick={() => setReminding(true)} disabled={!p.totals.overdueFamilies}>
                <BellRing className="size-4" /> {t("fees.reminders")}
              </Button>
              <Button onClick={() => setPaying(null)}>
                <CircleDollarSign className="size-4" /> {t("fees.recordPayment")}
              </Button>
            </>
          )
        }
      />
      <FeesNav slug={p.slug} />
      <div className="space-y-[var(--gap)]">
        <div className="grid gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((x, i) => (
            <motion.div key={x.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="h-full">
                <CardBody>
                  <p className="text-xs text-muted">{x.label}</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular", x.tone)}>
                    <CountUp value={x.value} format={(n) => fmt.money(Math.round(n), { compact: n > 10_000_000 })} />
                  </p>
                  {x.hint && <p className="mt-1 text-xs text-muted">{x.hint}</p>}
                  {i === 1 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <motion.div className="h-full rounded-full bg-success" initial={{ width: 0 }} animate={{ width: `${rate * 100}%` }} transition={{ duration: 0.9 }} />
                    </div>
                  )}
                </CardBody>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-[var(--gap)] lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title={t("fees.collection")} icon={<ReceiptText className="size-4" />} />
            <CardBody className="space-y-4">
              {p.installments.map((inst) => {
                const pct = inst.billed ? inst.paid / inst.billed : 0;
                return (
                  <div key={inst.index}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{t("fees.installmentOf", { label: inst.label, date: fmt.date(inst.due) })}</span>
                      {inst.count ? (
                        <span className="tabular text-muted">
                          {fmt.money(inst.paid)} / {fmt.money(inst.billed)} · <span className="font-semibold text-fg">{fmt.percent(pct)}</span>
                        </span>
                      ) : p.canManage ? (
                        <Button size="sm" variant="secondary" onClick={() => setBilling(inst.index)}>
                          <Send className="size-3.5" /> {t("fees.billNow")}
                        </Button>
                      ) : (
                        <span className="text-xs text-subtle">{t("fees.notBilled")}</span>
                      )}
                    </div>
                    <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-sunken">
                      {inst.count > 0 && <motion.div className={cn("h-full rounded-full", pct >= 0.95 ? "bg-success" : "bg-accent")} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.9, ease: "easeOut" }} />}
                    </div>
                  </div>
                );
              })}
              {p.totals.discounts > 0 && (
                <p className="text-xs text-muted">
                  {t("fees.discountsGiven")}: <span className="tabular">{fmt.money(p.totals.discounts)}</span>
                </p>
              )}
            </CardBody>
          </Card>
          {p.campuses.length > 0 && (
            <Card>
              <CardHeader title={t("fees.byCampus")} />
              <CardBody className="space-y-3">
                {p.campuses.map((c) => (
                  <div key={c.id}>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: c.color ?? "var(--accent)" }} />
                        {c.name}
                      </span>
                      <span className="tabular text-muted">{fmt.percent(c.billed ? c.paid / c.billed : 0)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
                      <motion.div className="h-full rounded-full" style={{ background: c.color ?? "var(--accent)" }} initial={{ width: 0 }} animate={{ width: `${c.billed ? (c.paid / c.billed) * 100 : 0}%` }} transition={{ duration: 0.9 }} />
                    </div>
                    <p className="mt-0.5 text-xs tabular text-subtle">
                      {fmt.money(c.paid, { compact: true })} / {fmt.money(c.billed, { compact: true })}
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {p.top.length > 0 && (
          <Card>
            <CardHeader title={t("fees.topOverdue")} action={<Link href={`/w/${p.slug}/fees/invoices?status=overdue`} className="text-sm text-accent hover:underline">{t("common.viewAll")}</Link>} />
            <CardBody className="divide-y divide-line">
              {p.top.map((x) => (
                <div key={x.partyId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    {x.guardianId ? (
                      <Link href={`/w/${p.slug}/guardians/${x.guardianId}`} className="font-medium hover:text-accent">
                        {x.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{x.name}</span>
                    )}
                    <p className="truncate text-xs text-muted">
                      {x.children} · {t("status.overdue")} {fmt.date(x.oldest, "short")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span title={x.online ? t("guardians.accessOn") : t("guardians.accessOff")}>{x.online ? <Wifi className="size-4 text-success" /> : <WifiOff className="size-4 text-subtle" />}</span>
                    <span className="font-semibold tabular text-danger">{fmt.money(x.amount)}</span>
                    {p.canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setPaying(x.partyId)}>
                        {t("fees.recordPayment")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>

      {p.canManage && (
        <>
          <Modal
            open={billing != null}
            onOpenChange={(o) => !o && setBilling(null)}
            title={billing != null ? t("fees.billTitle", { label: p.installments[billing].label, year: p.yearName }) : ""}
            description={t("fees.billBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setBilling(null)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={bill} disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("fees.billNow")}
                </Button>
              </>
            }
          >
            <Field label={t("fees.billDate")} htmlFor="bill-date">
              <Input id="bill-date" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </Field>
          </Modal>
          <Modal
            open={reminding}
            onOpenChange={setReminding}
            title={t("fees.remindersTitle")}
            description={t("fees.remindersBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setReminding(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={remind} disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />} {t("fees.reminders")}
                </Button>
              </>
            }
          />
          <FeePaymentSheet slug={p.slug} open={paying !== false} partyId={paying || null} onClose={() => setPaying(false)} />
        </>
      )}
    </div>
  );
}
