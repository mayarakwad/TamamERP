"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Ban, CircleDollarSign, Download, GraduationCap, Printer, Users } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MessageKey } from "@/lib/i18n";
import { voidFeeInvoice } from "@/app/actions/fees";
import { FeePaymentSheet } from "./fee-payment-sheet";

export function FeeInvoiceView({
  slug,
  doc,
  canManage,
}: {
  slug: string;
  doc: {
    id: string;
    number: string;
    date: string;
    due: string | null;
    status: string;
    rawStatus: string;
    total: number;
    paid: number;
    subtotal: number;
    discount: number;
    family: string;
    partyId: string;
    guardianId: string | null;
    student: { id: string; name: string; number: string; className: string } | null;
    lines: { id: string; description: string; gross: number; discountPct: number; amount: number }[];
    payments: { number: string; date: string; method: string; amount: number }[];
  };
  canManage: boolean;
}) {
  const { t, fmt, dir } = useI18n();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const open = doc.rawStatus === "issued" || doc.rawStatus === "partial";
  const doVoid = () =>
    start(async () => {
      const res = await voidFeeInvoice(slug, doc.id);
      setVoiding(false);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      router.refresh();
    });
  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/fees/invoices`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("fees.invoices")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{t("fees.feeInvoice")}</p>
          <h1 className="flex items-center gap-3 font-mono text-2xl font-semibold">
            {doc.number} <StatusBadge status={doc.status} />
          </h1>
          <p className="text-sm text-muted">
            {fmt.date(doc.date)}
            {doc.due ? ` · ${t("fees.colDue")} ${fmt.date(doc.due)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && open && (
            <Button onClick={() => setPaying(true)}>
              <CircleDollarSign className="size-4" /> {t("fees.recordPayment")}
            </Button>
          )}
          <a href={`/api/w/${slug}/export/document?id=${doc.id}&format=print`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Printer className="size-4" /> {t("fees.print")}
          </a>
          <a href={`/api/w/${slug}/export/document?id=${doc.id}&format=pdf`} className={buttonClass("ghost")}>
            <Download className="size-4" /> {t("fees.downloadPdf")}
          </a>
          {canManage && doc.rawStatus === "issued" && doc.paid === 0 && (
            <Button variant="ghost" onClick={() => setVoiding(true)}>
              <Ban className="size-4" /> {t("fees.void")}
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-[var(--gap)] lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody className="space-y-4">
            <table className="w-full text-sm">
              <tbody>
                {doc.lines.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="py-2.5">{l.description}</td>
                    <td className="py-2.5 text-end tabular text-muted">{l.discountPct ? <span className="me-2 line-through">{fmt.money(l.gross)}</span> : null}</td>
                    <td className="py-2.5 text-end font-medium tabular">{fmt.money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ms-auto max-w-xs space-y-1.5 text-sm">
              {doc.discount > 0 && (
                <div className="flex justify-between text-muted">
                  <span>{t("fees.discountsGiven")}</span>
                  <span className="tabular">−{fmt.money(doc.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span>{t("fees.colTotal")}</span>
                <span className="tabular">{fmt.money(doc.total)}</span>
              </div>
              {doc.paid > 0 && (
                <div className="flex justify-between text-success">
                  <span>{t("fees.colPaid")}</span>
                  <span className="tabular">−{fmt.money(doc.paid)}</span>
                </div>
              )}
              {open && (
                <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                  <span>{t("fees.colBalance")}</span>
                  <span className="tabular">{fmt.money(doc.total - doc.paid)}</span>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
        <div className="space-y-[var(--gap)]">
          {doc.student && (
            <Card>
              <CardHeader title={t("fees.colStudent")} icon={<GraduationCap className="size-4" />} />
              <CardBody className="text-sm">
                <Link href={`/w/${slug}/students/${doc.student.id}`} className="font-medium hover:text-accent">
                  {doc.student.name}
                </Link>
                <p className="text-muted">
                  {doc.student.className} · <span className="font-mono text-xs">{doc.student.number}</span>
                </p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title={t("fees.colFamily")} icon={<Users className="size-4" />} />
            <CardBody className="text-sm">
              {doc.guardianId ? (
                <Link href={`/w/${slug}/guardians/${doc.guardianId}`} className="font-medium hover:text-accent">
                  {doc.family}
                </Link>
              ) : (
                <p className="font-medium">{doc.family}</p>
              )}
            </CardBody>
          </Card>
          {doc.payments.length > 0 && (
            <Card>
              <CardHeader title={t("fees.payments")} icon={<CircleDollarSign className="size-4" />} />
              <CardBody className="space-y-2 text-sm">
                {doc.payments.map((p, i) => (
                  <div key={`${p.number}-${i}`} className="flex justify-between gap-2">
                    <span>
                      <span className="block font-mono text-xs">{p.number}</span>
                      <span className="block text-xs text-muted">
                        {fmt.date(p.date)} · {t(`fees.method_${p.method}` as MessageKey)}
                      </span>
                    </span>
                    <span className="font-medium tabular">{fmt.money(p.amount)}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
      {canManage && (
        <>
          <FeePaymentSheet slug={slug} open={paying} partyId={doc.partyId} onClose={() => setPaying(false)} />
          <Modal
            open={voiding}
            onOpenChange={setVoiding}
            title={t("fees.voidTitle", { number: doc.number })}
            description={t("fees.voidBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setVoiding(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" onClick={doVoid} disabled={pending}>
                  {t("fees.void")}
                </Button>
              </>
            }
          />
        </>
      )}
    </div>
  );
}
