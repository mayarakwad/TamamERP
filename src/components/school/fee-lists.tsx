"use client";

import { useState } from "react";
import { CircleDollarSign, ReceiptText } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { ListView, selectClass, useQueryParam } from "@/components/business/list-view";
import { FeesNav } from "./fees-nav";
import { FeePaymentSheet } from "./fee-payment-sheet";

export function FeeInvoicesView({ slug, query, result, canShare, canManage, counts, installments, grades }: { slug: string; query: string; result: DatasetResult; canShare: boolean; canManage: boolean; counts: { open: number; overdue: number; paid: number }; installments: { key: string; label: string }[]; grades: { level: number; name: string }[] }) {
  const { t } = useI18n();
  const { params, set } = useQueryParam(query);
  const [paying, setPaying] = useState(false);
  const pay = canManage && (
    <Button onClick={() => setPaying(true)}>
      <CircleDollarSign className="size-4" /> {t("fees.recordPayment")}
    </Button>
  );
  return (
    <ListView
      slug={slug}
      dataset="fee-invoices"
      query={query}
      result={result}
      canShare={canShare}
      title={t("fees.invoices")}
      primary={pay}
      chips={[
        { value: null, label: t("common.all") },
        { value: "open", label: t("fees.viewOpen"), count: counts.open },
        { value: "overdue", label: t("fees.viewOverdue"), count: counts.overdue },
        { value: "paid", label: t("fees.viewPaid"), count: counts.paid },
      ]}
      filters={
        <>
          <select aria-label={t("fees.colInstallment")} className={selectClass} value={params.get("installment") ?? ""} onChange={(e) => set("installment", e.target.value || null)}>
            <option value="">{t("fees.anyInstallment")}</option>
            {installments.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
          <select aria-label={t("school.grade")} className={selectClass} value={params.get("grade") ?? ""} onChange={(e) => set("grade", e.target.value || null)}>
            <option value="">{t("school.anyGrade")}</option>
            {grades.map((g) => (
              <option key={g.level} value={g.level}>
                {g.name}
              </option>
            ))}
          </select>
        </>
      }
      top={<FeesNav slug={slug} />}
      searchPlaceholder={t("fees.pickFamily")}
      emptyIcon={<ReceiptText className="size-6" />}
      emptyTitle={t("fees.emptyTitle")}
      emptyBody={t("fees.emptyBody")}
      renderCell={{
        number: (r: Row) => <span className="font-mono text-xs">{r.cells.number}</span>,
        student: (r: Row) => <span className="font-medium">{r.cells.student}</span>,
      }}
    >
      {canManage && <FeePaymentSheet slug={slug} open={paying} partyId={null} onClose={() => setPaying(false)} />}
    </ListView>
  );
}

export function FeePaymentsView({ slug, query, result, canShare, canManage }: { slug: string; query: string; result: DatasetResult; canShare: boolean; canManage: boolean }) {
  const { t } = useI18n();
  const [paying, setPaying] = useState(false);
  const pay = canManage && (
    <Button onClick={() => setPaying(true)}>
      <CircleDollarSign className="size-4" /> {t("fees.recordPayment")}
    </Button>
  );
  return (
    <ListView
      slug={slug}
      dataset="fee-payments"
      query={query}
      result={result}
      canShare={canShare}
      title={t("fees.payments")}
      primary={pay}
      top={<FeesNav slug={slug} />}
      searchPlaceholder={t("fees.pickFamily")}
      emptyIcon={<CircleDollarSign className="size-6" />}
      emptyTitle={t("fees.emptyTitle")}
      renderCell={{ number: (r: Row) => <span className="font-mono text-xs">{r.cells.number}</span> }}
    >
      {canManage && <FeePaymentSheet slug={slug} open={paying} partyId={null} onClose={() => setPaying(false)} />}
    </ListView>
  );
}
