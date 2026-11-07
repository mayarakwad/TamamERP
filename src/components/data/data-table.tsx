"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatCell } from "@/lib/datasets/format-cell";
import type { Column, DatasetResult, Row } from "@/lib/datasets/types";

const PAGE = 50;

export interface DataTableProps {
  slug: string;
  result: DatasetResult;
  /** Custom on-screen rendering for some columns (exports use the plain value). */
  renderCell?: Record<string, (row: Row) => React.ReactNode>;
  /** Phone layout for one row. */
  mobileRow?: (row: Row) => React.ReactNode;
  empty?: React.ReactNode;
}

export function DataTable({ slug, result, renderCell = {}, mobileRow, empty }: DataTableProps) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    if (!sort) return result.rows;
    const col = result.columns.find((c) => c.key === sort.key);
    return [...result.rows].sort((a, b) => {
      const x = a.cells[sort.key];
      const y = b.cells[sort.key];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : col?.type === "enum" ? formatCell(col, x, fmt, t).localeCompare(formatCell(col, y, fmt, t)) : String(x).localeCompare(String(y));
      return cmp * sort.dir;
    });
  }, [result, sort, fmt, t]);

  if (result.rows.length === 0) return <>{empty}</>;

  const totals = result.columns.filter((c) => c.total);
  const numeric = (c: Column) => c.type === "money" || c.type === "number" || c.type === "percent";
  const go = (row: Row) => row.href && router.push(`/w/${slug}/${row.href}`);
  const toggle = (key: string) => setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-sunken/90">
            <tr>
              {result.columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-2.5 text-start text-xs font-semibold whitespace-nowrap text-muted", numeric(c) && "text-end", c.hideOnMobile && "hidden lg:table-cell")}>
                  <button type="button" onClick={() => toggle(c.key)} className={cn("inline-flex items-center gap-1 hover:text-fg", numeric(c) && "flex-row-reverse")}>
                    {t(c.label)}
                    {sort?.key === c.key ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, shown).map((row) => (
              <tr key={row.id} onClick={() => go(row)} className={cn("transition-colors", row.href && "cursor-pointer hover:bg-accent-soft/40")} style={{ height: "var(--row)" }}>
                {result.columns.map((c, i) => (
                  <td key={c.key} className={cn("px-4 py-2", numeric(c) && "tabular text-end", (i === 0 || numeric(c) || c.type === "date" || c.type === "enum") && "whitespace-nowrap", c.hideOnMobile && "hidden lg:table-cell")}>
                    {i === 0 && row.href ? (
                      <Link href={`/w/${slug}/${row.href}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-accent">
                        {renderCell[c.key]?.(row) ?? formatCell(c, row.cells[c.key], fmt, t)}
                      </Link>
                    ) : (
                      renderCell[c.key]?.(row) ?? formatCell(c, row.cells[c.key], fmt, t)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals.length > 0 && (
            <tfoot className="border-t-2 border-line bg-sunken/60 font-semibold">
              <tr>
                {result.columns.map((c, i) => (
                  <td key={c.key} className={cn("px-4 py-2.5", numeric(c) && "tabular text-end", c.hideOnMobile && "hidden lg:table-cell")}>
                    {i === 0 ? `${t("toolbar.total")} · ${t("toolbar.rows", { count: fmt.number(rows.length) })}` : c.total ? formatCell(c, rows.reduce((s, r) => s + (Number(r.cells[c.key]) || 0), 0), fmt, t) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Phone cards */}
      <ul className="space-y-2 md:hidden">
        {rows.slice(0, shown).map((row) => (
          <li key={row.id}>
            <Link href={row.href ? `/w/${slug}/${row.href}` : "#"} className="lift block rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
              {mobileRow ? mobileRow(row) : <span>{String(row.cells[result.columns[0].key] ?? "")}</span>}
            </Link>
          </li>
        ))}
      </ul>

      {rows.length > shown && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => setShown((s) => s + PAGE)}>
            {t("toolbar.showMore")} · {fmt.number(rows.length - shown)}
          </Button>
        </div>
      )}
    </div>
  );
}
