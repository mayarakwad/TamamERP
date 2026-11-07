"use client";

import { useState } from "react";
import { Contact, Plus, Truck } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { formatCell } from "@/lib/datasets/format-cell";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { ListView } from "./list-view";
import { PartySheet } from "./party-sheet";

export function PartiesView({ slug, which, query, result, canShare, canManage, summary }: { slug: string; which: "customer" | "supplier"; query: string; result: DatasetResult; canShare: boolean; canManage: boolean; summary: { count: number; open: number; overdue: number } }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const customer = which === "customer";
  const openCol = result.columns.find((c) => c.key === "open")!;
  const add = canManage && (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> {t(customer ? "parties.newCustomer" : "parties.newSupplier")}
    </Button>
  );
  return (
    <ListView
      slug={slug}
      dataset={customer ? "customers" : "suppliers"}
      query={query}
      result={result}
      canShare={canShare}
      title={t(customer ? "nav.customers" : "nav.suppliers")}
      subtitle={t(customer ? "parties.customersSubtitle" : "parties.suppliersSubtitle", { count: fmt.number(summary.count), open: fmt.money(summary.open), overdue: fmt.money(summary.overdue) })}
      primary={add}
      chipParam="archived"
      chips={[
        { value: null, label: t("parties.active") },
        { value: "1", label: t("parties.archived") },
      ]}
      searchPlaceholder={t("parties.search")}
      emptyIcon={customer ? <Contact className="size-6" /> : <Truck className="size-6" />}
      emptyTitle={t(customer ? "parties.emptyCustomers" : "parties.emptySuppliers")}
      emptyBody={t(customer ? "parties.emptyCustomersBody" : "parties.emptySuppliersBody")}
      emptyAction={add}
      renderCell={{
        name: (r: Row) => <span className="font-medium">{r.cells.name}</span>,
        open: (r: Row) => <span className={Number(r.cells.open) > 0 ? "font-semibold" : "text-subtle"}>{formatCell(openCol, r.cells.open, fmt, t)}</span>,
      }}
      mobileRow={(r: Row) => (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.cells.name}</p>
            <p className="truncate text-xs text-muted">{[r.cells.contact, r.cells.phone].filter(Boolean).join(" · ")}</p>
          </div>
          <p className="tabular text-sm font-semibold">{formatCell(openCol, r.cells.open, fmt, t)}</p>
        </div>
      )}
    >
      <PartySheet slug={slug} open={open} onOpenChange={setOpen} which={which} />
    </ListView>
  );
}
