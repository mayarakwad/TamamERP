"use client";

import Link from "next/link";
import { ClipboardList, FileSpreadsheet, FileText, Plus, ReceiptText } from "lucide-react";
import { useI18n } from "@/components/providers";
import { buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCell } from "@/lib/datasets/format-cell";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import type { MessageKey } from "@/lib/i18n";
import { ListView } from "./list-view";

type Kind = "quote" | "invoice" | "po" | "bill";
const META: Record<Kind, { dataset: string; path: string; title: MessageKey; new: MessageKey; icon: typeof FileText; emptyTitle: MessageKey; emptyBody: MessageKey; subtitle: MessageKey }> = {
  quote: { dataset: "quotations", path: "sales/quotations", title: "nav.quotations", new: "docs.newQuote", icon: FileText, emptyTitle: "docs.emptyQuotes", emptyBody: "docs.emptyQuotesBody", subtitle: "docs.quotesSubtitle" },
  invoice: { dataset: "invoices", path: "sales/invoices", title: "nav.invoices", new: "docs.newInvoice", icon: ReceiptText, emptyTitle: "docs.emptyInvoices", emptyBody: "docs.emptyInvoicesBody", subtitle: "docs.invoicesSubtitle" },
  po: { dataset: "purchase-orders", path: "purchases/orders", title: "nav.purchaseOrders", new: "docs.newPo", icon: ClipboardList, emptyTitle: "docs.emptyPos", emptyBody: "docs.emptyPosBody", subtitle: "docs.posSubtitle" },
  bill: { dataset: "supplier-bills", path: "purchases/bills", title: "nav.purchaseBills", new: "docs.newBill", icon: FileSpreadsheet, emptyTitle: "docs.emptyBills", emptyBody: "docs.emptyBillsBody", subtitle: "docs.billsSubtitle" },
};

const CHIPS: Record<Kind, string[]> = {
  quote: ["draft", "sent", "accepted", "converted", "declined"],
  invoice: ["draft", "open", "overdue", "paid", "void"],
  po: ["draft", "sent", "partReceived", "received", "billed", "cancelled"],
  bill: ["draft", "open", "overdue", "paid", "void"],
};

export function DocsView({ slug, kind, query, result, canShare, canCreate, counts, summary }: { slug: string; kind: Kind; query: string; result: DatasetResult; canShare: boolean; canCreate: boolean; counts: Record<string, number>; summary: { open: number; overdue: number; month: number } }) {
  const { t, fmt } = useI18n();
  const m = META[kind];
  const Icon = m.icon;
  const total = Object.entries(counts).filter(([k]) => !["open", "overdue"].includes(k)).reduce((s, [, n]) => s + n, 0);
  const add = canCreate && (
    <Link href={`/w/${slug}/${m.path}/new`} className={buttonClass("primary")}>
      <Plus className="size-4" /> {t(m.new)}
    </Link>
  );
  const totalCol = result.columns.find((c) => c.key === "total")!;
  const balanceCol = result.columns.find((c) => c.key === "balance");
  return (
    <ListView
      slug={slug}
      dataset={m.dataset}
      query={query}
      result={result}
      canShare={canShare}
      title={t(m.title)}
      subtitle={t(m.subtitle, { open: fmt.money(summary.open), overdue: fmt.money(summary.overdue), month: fmt.money(summary.month) })}
      primary={add}
      chips={[{ value: null, label: t("claims.all"), count: total }, ...CHIPS[kind].map((s) => ({ value: s, label: t(`status.${s}` as MessageKey), count: counts[s] ?? 0 }))]}
      searchPlaceholder={t("docs.search")}
      emptyIcon={<Icon className="size-6" />}
      emptyTitle={t(m.emptyTitle)}
      emptyBody={t(m.emptyBody)}
      emptyAction={add}
      renderCell={{
        number: (r: Row) => <span className="font-mono text-xs">{r.cells.number}</span>,
        total: (r: Row) => <span className="font-semibold">{formatCell(totalCol, r.cells.total, fmt, t)}</span>,
        ...(balanceCol ? { balance: (r: Row) => <span className={Number(r.cells.balance) > 0 ? "" : "text-subtle"}>{formatCell(balanceCol, r.cells.balance, fmt, t)}</span> } : {}),
      }}
      mobileRow={(r: Row) => (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.cells.party}</p>
            <p className="truncate text-xs text-muted">
              <span className="font-mono">{r.cells.number}</span> · {fmt.date(String(r.cells.date))}
            </p>
          </div>
          <div className="text-end">
            <p className="tabular font-semibold">{formatCell(totalCol, r.cells.total, fmt, t)}</p>
            <StatusBadge status={String(r.cells.status)} />
          </div>
        </div>
      )}
    />
  );
}
