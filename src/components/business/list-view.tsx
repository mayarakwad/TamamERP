"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useI18n } from "@/components/providers";
import { inputClass } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/data/data-table";
import { DataToolbar } from "@/components/data/toolbar";
import { formatCell } from "@/lib/datasets/format-cell";
import { cn } from "@/lib/cn";
import type { DatasetResult, Row } from "@/lib/datasets/types";

export interface Chip {
  value: string | null;
  label: string;
  count?: number;
}

/** URL-driven list helpers: read and change one query parameter. */
export function useQueryParam(query: string) {
  const router = useRouter();
  const pathname = usePathname();
  const [, start] = useTransition();
  const params = new URLSearchParams(query);
  const hrefWith = (key: string, value: string | null, base: string = query) => {
    const next = new URLSearchParams(base);
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const set = (key: string, value: string | null) => start(() => router.replace(hrefWith(key, value), { scroll: false }));
  const setMany = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };
  return { params, hrefWith, set, setMany };
}

/**
 * The standard list page: title, export/print/share toolbar, status chips,
 * a search box and filters that live in the URL, and the data table.
 */
export function ListView({
  slug,
  dataset,
  query,
  result,
  canShare,
  title,
  subtitle,
  primary,
  chips,
  chipParam = "status",
  filters,
  searchPlaceholder,
  emptyIcon,
  emptyTitle,
  emptyBody,
  emptyAction,
  renderCell = {},
  mobileRow,
  top,
  children,
}: {
  slug: string;
  dataset: string;
  query: string;
  result: DatasetResult;
  canShare: boolean;
  title: string;
  subtitle?: React.ReactNode;
  primary?: React.ReactNode;
  chips?: Chip[];
  chipParam?: string;
  filters?: React.ReactNode;
  searchPlaceholder?: string;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  renderCell?: Record<string, (row: Row) => React.ReactNode>;
  mobileRow?: (row: Row) => React.ReactNode;
  /** Shown between the header and the filters (e.g. a section's sub-navigation) */
  top?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { t, fmt } = useI18n();
  const { params, hrefWith, set } = useQueryParam(query);
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = setTimeout(() => set("q", q.trim() || null), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filtered = [...params.keys()].some((k) => k !== chipParam);
  const cells: Record<string, (row: Row) => React.ReactNode> = {
    status: (r) => <StatusBadge status={String(r.cells.status)} />,
    ...renderCell,
  };
  const moneyKey = result.columns.find((c) => c.key === "total" || c.key === "amount" || c.key === "balance" || c.key === "open")?.key;
  const defaultMobile = (r: Row) => {
    const [first, second] = result.columns;
    const money = moneyKey ? result.columns.find((c) => c.key === moneyKey) : undefined;
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{String(r.cells[result.columns.find((c) => c.key === "party" || c.key === "name")?.key ?? first.key] ?? "")}</p>
          <p className="truncate text-xs text-muted">
            {formatCell(first, r.cells[first.key], fmt, t)}
            {second ? ` · ${formatCell(second, r.cells[second.key], fmt, t)}` : ""}
          </p>
        </div>
        <div className="text-end">
          {money && <p className="tabular font-semibold">{formatCell(money, r.cells[money.key], fmt, t)}</p>}
          {r.cells.status != null && <StatusBadge status={String(r.cells.status)} />}
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <DataToolbar slug={slug} dataset={dataset} query={query} result={result} canShare={canShare} />
            {primary}
          </>
        }
      />
      {top}
      {chips && chips.length > 0 && (
        <div className="mb-4">
          <FilterChips items={chips.map((c) => ({ href: hrefWith(chipParam, c.value), label: c.label, active: (params.get(chipParam) ?? null) === c.value, count: c.count }))} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder ?? t("common.search")} className={cn(inputClass, "h-9 ps-9 text-sm")} aria-label={t("common.search")} />
        </div>
        {filters}
      </div>
      <DataTable
        slug={slug}
        result={result}
        renderCell={cells}
        mobileRow={mobileRow ?? defaultMobile}
        empty={
          filtered || params.get(chipParam) ? (
            <EmptyState icon={<Search className="size-6" />} title={t("claims.emptyFiltered")} />
          ) : (
            <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} action={emptyAction} />
          )
        }
      />
      {children}
    </div>
  );
}

export const selectClass = "h-9 min-w-36 rounded-xl border border-line bg-surface px-3 py-0 text-sm shadow-sm outline-none focus:border-accent-line";
