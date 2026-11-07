"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Paperclip, Plus, Receipt, Search, X } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { fieldClass, inputClass } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/ui/category-icon";
import { DataTable } from "@/components/data/data-table";
import { DataToolbar } from "@/components/data/toolbar";
import { monthStart } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { ClaimSheet, type CategoryOption } from "./claim-sheet";

interface Props {
  slug: string;
  query: string;
  result: DatasetResult;
  categories: CategoryOption[];
  people: { id: string; name: string; nameAr: string | null }[];
  months: string[];
  counts: Record<string, number>;
  monthApproved: number;
  canApprove: boolean;
  canShare: boolean;
  merchants: string[];
}

export function ClaimsView(p: Props) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(p.query);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [, startNav] = useTransition();

  const withParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(p.query);
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const setParam = (key: string, value: string | null) => startNav(() => router.replace(withParam(key, value), { scroll: false }));

  // Search as you type (debounced); the URL keeps exports and shares in sync.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = setTimeout(() => setParam("q", q.trim() || null), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const status = params.get("status");
  const total = Object.values(p.counts).reduce((s, n) => s + n, 0);
  const filtered = !!(params.get("month") || params.get("category") || params.get("person") || params.get("q"));

  const renderCell: Record<string, (row: Row) => React.ReactNode> = {
    number: (r) => (
      <span className="inline-flex items-center gap-1.5">
        {r.cells.number}
        {Number(r.meta?.receipts) > 0 && <Paperclip className="size-3 text-subtle" aria-label={t("claims.receipts")} />}
      </span>
    ),
    category: (r) => (
      <span className="inline-flex items-center gap-2">
        <CategoryIcon icon={String(r.meta?.icon)} className="size-4 text-muted" />
        {r.cells.category}
      </span>
    ),
    by: (r) => (
      <span className="inline-flex items-center gap-2">
        <Avatar name={String(r.meta?.byName)} color={r.meta?.avatarColor as string} size={24} />
        {r.cells.by}
      </span>
    ),
    amount: (r) => <span className="font-semibold">{fmt.money(Number(r.cells.amount), { decimals: "auto" })}</span>,
    status: (r) => <StatusBadge status={String(r.cells.status)} />,
  };

  const mobileRow = (r: Row) => (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunken text-muted">
        <CategoryIcon icon={String(r.meta?.icon)} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r.cells.merchant}</p>
        <p className="truncate text-xs text-muted">
          {fmt.date(String(r.cells.date))} · {r.cells.by ?? r.cells.category}
        </p>
      </div>
      <div className="text-end">
        <p className="tabular font-semibold">{fmt.money(Number(r.cells.amount), { decimals: "auto" })}</p>
        <StatusBadge status={String(r.cells.status)} />
      </div>
    </div>
  );

  const select = cn(fieldClass, "h-9 min-w-36 py-0 text-sm");

  return (
    <div>
      <PageHeader
        title={t("claims.title")}
        subtitle={t("claims.subtitle", { count: fmt.number(total), amount: fmt.money(p.monthApproved, { decimals: "auto" }) })}
        actions={
          <>
            <DataToolbar slug={p.slug} dataset="claims" query={p.query} result={p.result} canShare={p.canShare} />
            <Button onClick={() => setSheetOpen(true)}>
              <Plus className="size-4" /> {t("claims.new")}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChips
          items={[
            { href: withParam("status", null), label: t("claims.all"), active: !status, count: total },
            { href: withParam("status", "submitted"), label: t("claims.waiting"), active: status === "submitted", count: p.counts.submitted ?? 0 },
            { href: withParam("status", "approved"), label: t("claims.approvedTab"), active: status === "approved", count: p.counts.approved ?? 0 },
            { href: withParam("status", "reimbursed"), label: t("claims.reimbursedTab"), active: status === "reimbursed", count: p.counts.reimbursed ?? 0 },
            { href: withParam("status", "rejected"), label: t("claims.declinedTab"), active: status === "rejected", count: p.counts.rejected ?? 0 },
          ]}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("claims.searchPlaceholder")} className={cn(inputClass, "h-9 ps-9 text-sm")} />
        </div>
        <select aria-label={t("claims.colDate")} className={select} value={params.get("month") ?? ""} onChange={(e) => setParam("month", e.target.value || null)}>
          <option value="">{t("claims.anyMonth")}</option>
          {p.months.map((m) => (
            <option key={m} value={m}>
              {fmt.monthName(monthStart(m))}
            </option>
          ))}
        </select>
        <select aria-label={t("claims.colCategory")} className={select} value={params.get("category") ?? ""} onChange={(e) => setParam("category", e.target.value || null)}>
          <option value="">{t("claims.anyCategory")}</option>
          {p.categories.map((c) => (
            <option key={c.key} value={c.key}>
              {pick(locale, c.name, c.nameAr)}
            </option>
          ))}
        </select>
        {p.people.length > 0 && (
          <select aria-label={t("claims.colBy")} className={select} value={params.get("person") ?? ""} onChange={(e) => setParam("person", e.target.value || null)}>
            <option value="">{t("claims.anyone")}</option>
            {p.people.map((u) => (
              <option key={u.id} value={u.id}>
                {pick(locale, u.name, u.nameAr)}
              </option>
            ))}
          </select>
        )}
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => startNav(() => router.replace(status ? `${pathname}?status=${status}` : pathname, { scroll: false }))}>
            <X className="size-3.5" /> {t("claims.clearFilters")}
          </Button>
        )}
      </div>

      <DataTable
        slug={p.slug}
        result={p.result}
        renderCell={renderCell}
        mobileRow={mobileRow}
        empty={
          total === 0 && !filtered ? (
            <EmptyState
              icon={<Receipt className="size-6" />}
              title={t("claims.emptyTitle")}
              body={t("claims.emptyBody")}
              action={
                <Button onClick={() => setSheetOpen(true)}>
                  <Plus className="size-4" /> {t("claims.new")}
                </Button>
              }
            />
          ) : (
            <EmptyState icon={<Search className="size-6" />} title={t("claims.emptyFiltered")} />
          )
        }
      />

      <ClaimSheet slug={p.slug} open={sheetOpen} onOpenChange={setSheetOpen} categories={p.categories} merchants={p.merchants} canApprove={p.canApprove} />
    </div>
  );
}
