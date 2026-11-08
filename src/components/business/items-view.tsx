"use client";

import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCell } from "@/lib/datasets/format-cell";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { ListView, selectClass, useQueryParam } from "./list-view";
import { ItemSheet } from "./item-sheet";

const STATE_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { ok: "success", low: "warning", out: "danger", service: "neutral" };

export function ItemsView({ slug, query, result, canShare, canManage, canPrice, categories, counts, value }: { slug: string; query: string; result: DatasetResult; canShare: boolean; canManage: boolean; canPrice: boolean; categories: string[]; counts: { all: number; low: number; services: number }; value: number | null }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const { params, set, setMany } = useQueryParam(query);
  const stateCol = result.columns.find((c) => c.key === "state")!;
  const add = canManage && (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> {t("items.new")}
    </Button>
  );
  // Chips combine two params, so build them by hand.
  const chip = params.get("low") === "1" ? "low" : params.get("kind") === "service" ? "service" : params.get("archived") === "1" ? "archived" : null;
  return (
    <ListView
      slug={slug}
      dataset="items"
      query={query}
      result={result}
      canShare={canShare}
      title={t("nav.items")}
      subtitle={value != null ? t("items.subtitle", { count: fmt.number(counts.all), value: fmt.money(value), low: fmt.number(counts.low) }) : t("items.subtitleNoValue", { count: fmt.number(counts.all), low: fmt.number(counts.low) })}
      primary={add}
      chipParam="view"
      chips={[]}
      filters={
        <>
          <div className="flex gap-1 rounded-xl bg-sunken p-1 text-sm">
            {[
              { k: null, label: t("common.all"), n: counts.all, apply: () => setMany({ low: null, kind: null, archived: null }) },
              { k: "low", label: t("items.lowStock"), n: counts.low, apply: () => setMany({ low: "1", kind: null, archived: null }) },
              { k: "service", label: t("items.services"), n: counts.services, apply: () => setMany({ low: null, kind: "service", archived: null }) },
              { k: "archived", label: t("parties.archived"), apply: () => setMany({ low: null, kind: null, archived: "1" }) },
            ].map((c) => (
              <button key={c.k ?? "all"} type="button" onClick={c.apply} aria-pressed={chip === c.k} className={`rounded-lg px-3 py-1.5 ${chip === c.k ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg"}`}>
                {c.label}
                {c.n != null && <span className="ms-1.5 text-xs text-subtle tabular">{fmt.number(c.n)}</span>}
              </button>
            ))}
          </div>
          <select aria-label={t("items.colCategory")} className={selectClass} value={params.get("category") ?? ""} onChange={(e) => set("category", e.target.value || null)}>
            <option value="">{t("items.anyCategory")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </>
      }
      searchPlaceholder={t("items.search")}
      emptyIcon={<Package className="size-6" />}
      emptyTitle={t("items.emptyTitle")}
      emptyBody={t("items.emptyBody")}
      emptyAction={add}
      renderCell={{
        sku: (r: Row) => <span className="font-mono text-xs">{r.cells.sku}</span>,
        name: (r: Row) => <span className="font-medium">{r.cells.name}</span>,
        onHand: (r: Row) => (r.cells.onHand == null ? <span className="text-subtle">—</span> : <span className={r.cells.state === "low" || r.cells.state === "out" ? "font-semibold text-warning" : ""}>{fmt.number(Number(r.cells.onHand))}</span>),
        state: (r: Row) => <Badge tone={STATE_TONE[String(r.cells.state)]}>{formatCell(stateCol, r.cells.state, fmt, t)}</Badge>,
      }}
      mobileRow={(r: Row) => (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.cells.name}</p>
            <p className="truncate text-xs text-muted">
              <span className="font-mono">{r.cells.sku}</span> · {fmt.money(Number(r.cells.price))}
            </p>
          </div>
          <div className="text-end">
            {r.cells.onHand != null && <p className="tabular font-semibold">{fmt.number(Number(r.cells.onHand))}</p>}
            <Badge tone={STATE_TONE[String(r.cells.state)]}>{formatCell(stateCol, r.cells.state, fmt, t)}</Badge>
          </div>
        </div>
      )}
    >
      <ItemSheet slug={slug} open={open} onOpenChange={setOpen} categories={categories} canPrice={canPrice} />
    </ListView>
  );
}
