"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, HandCoins, Loader2, Plus } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCell } from "@/lib/datasets/format-cell";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import type { MessageKey } from "@/lib/i18n";
import { cancelPayment } from "@/app/actions/biz";
import { ListView } from "./list-view";
import { PaymentSheet } from "./payment-sheet";

export function PaymentsView({ slug, direction, query, result, canShare, canManage, monthTotal }: { slug: string; direction: "in" | "out"; query: string; result: DatasetResult; canShare: boolean; canManage: boolean; monthTotal: number }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [pending, start] = useTransition();
  const amountCol = result.columns.find((c) => c.key === "amount")!;
  const add = canManage && (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> {t(direction === "in" ? "payments.receive" : "payments.pay")}
    </Button>
  );
  const status = (r: Row) => <StatusBadge status={r.cells.state === "void" ? "void" : "paid"} />;
  const voidIt = () =>
    start(async () => {
      if (!selected) return;
      const res = await cancelPayment(slug, selected.id);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("payments.voided"));
      setSelected(null);
      router.refresh();
    });
  return (
    <ListView
      slug={slug}
      dataset={direction === "in" ? "payments-in" : "payments-out"}
      query={query}
      result={{ ...result, rows: result.rows.map((r) => ({ ...r, href: undefined })) }}
      canShare={canShare}
      title={t(direction === "in" ? "nav.paymentsIn" : "nav.paymentsOut")}
      subtitle={t(direction === "in" ? "payments.inSubtitle" : "payments.outSubtitle", { amount: fmt.money(monthTotal) })}
      primary={add}
      searchPlaceholder={t("payments.search")}
      emptyIcon={direction === "in" ? <HandCoins className="size-6" /> : <Banknote className="size-6" />}
      emptyTitle={t("payments.emptyTitle")}
      emptyBody={t(direction === "in" ? "payments.emptyInBody" : "payments.emptyOutBody")}
      emptyAction={add}
      renderCell={{
        number: (r) => (
          <button type="button" className="font-mono text-xs text-accent hover:underline" onClick={() => setSelected(r)}>
            {r.cells.number}
          </button>
        ),
        amount: (r) => <span className={r.cells.state === "void" ? "text-subtle line-through" : "font-semibold"}>{formatCell(amountCol, r.cells.amount, fmt, t)}</span>,
        state: status,
      }}
    >
      <PaymentSheet slug={slug} open={open} onOpenChange={setOpen} direction={direction} />
      <Modal
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected ? String(selected.cells.number) : ""}
        description={selected ? `${selected.cells.party} · ${fmt.date(String(selected.cells.date))}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t("common.close")}
            </Button>
            {canManage && selected?.cells.state !== "void" && (
              <Button variant="danger" onClick={voidIt} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t("payments.void")}
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">{t("docs.colAmount")}</dt>
            <dd className="tabular font-semibold">{fmt.money(Number(selected.cells.amount), { decimals: true })}</dd>
            <dt className="text-muted">{t("payments.colMethod")}</dt>
            <dd>{t(`payments.${selected.cells.method}` as MessageKey)}</dd>
            <dt className="text-muted">{t("payments.colAccount")}</dt>
            <dd>{selected.cells.account}</dd>
            {selected.meta?.reference && (
              <>
                <dt className="text-muted">{t("docs.colReference")}</dt>
                <dd dir="ltr">{String(selected.meta.reference)}</dd>
              </>
            )}
            <dt className="text-muted">{t("payments.colApplied")}</dt>
            <dd className="font-mono text-xs">{selected.cells.applied || "—"}</dd>
          </dl>
        )}
      </Modal>
    </ListView>
  );
}
