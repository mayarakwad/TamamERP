"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, ClipboardCheck, Loader2, Plus, Trash2, Warehouse } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Field, Input, inputClass } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { formatCell } from "@/lib/datasets/format-cell";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { parseQty } from "@/lib/docs/math";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { saveStockCount, saveTransfer } from "@/app/actions/biz";
import { ListView, selectClass, useQueryParam } from "./list-view";

export interface StockItem {
  id: string;
  sku: string;
  name: string;
  nameAr: string | null;
  unit: string;
  levels: Record<string, number>;
}

const todayInDoha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());

export function StockView({ slug, query, view, result, canShare, canManage, campuses, items }: { slug: string; query: string; view: "levels" | "moves"; result: DatasetResult; canShare: boolean; canManage: boolean; campuses: { id: string; name: string; nameAr: string | null }[]; items: StockItem[] }) {
  const { t, fmt, locale } = useI18n();
  const { params, set } = useQueryParam(query);
  const [countOpen, setCountOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const qtyCols = result.columns.filter((c) => c.type === "number");
  const kindCol = result.columns.find((c) => c.key === "kind");
  return (
    <ListView
      slug={slug}
      dataset={view === "moves" ? "stock-moves" : "stock"}
      query={query}
      result={result}
      canShare={canShare}
      title={t("nav.stock")}
      subtitle={t("stock.subtitle")}
      primary={
        canManage && (
          <>
            <Button variant="secondary" onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="size-4" /> {t("stock.transfer")}
            </Button>
            <Button onClick={() => setCountOpen(true)}>
              <ClipboardCheck className="size-4" /> {t("stock.count")}
            </Button>
          </>
        )
      }
      chipParam="view"
      chips={[
        { value: null, label: t("stock.levels") },
        { value: "moves", label: t("stock.moves") },
      ]}
      filters={
        view === "moves" && (
          <>
            <select aria-label={t("stock.warehouse")} className={selectClass} value={params.get("campus") ?? ""} onChange={(e) => set("campus", e.target.value || null)}>
              <option value="">{t("stock.allWarehouses")}</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name, c.nameAr)}
                </option>
              ))}
            </select>
            <select aria-label={t("stock.colKind")} className={selectClass} value={params.get("kind") ?? ""} onChange={(e) => set("kind", e.target.value || null)}>
              <option value="">{t("stock.anyMovement")}</option>
              {Object.entries(kindCol?.options ?? {}).map(([k, label]) => (
                <option key={k} value={k}>
                  {t(label)}
                </option>
              ))}
            </select>
          </>
        )
      }
      emptyIcon={<Warehouse className="size-6" />}
      emptyTitle={t("stock.emptyTitle")}
      emptyBody={t("stock.emptyBody")}
      renderCell={{
        sku: (r: Row) => <span className="font-mono text-xs">{r.cells.sku}</span>,
        ...Object.fromEntries(qtyCols.map((c) => [c.key, (r: Row) => <span className={cn(c.key === "total" && "font-semibold", c.key === "total" && r.meta?.low && "text-warning", c.key === "qty" && Number(r.cells.qty) > 0 && "text-success")}>{c.key === "qty" && Number(r.cells.qty) > 0 ? "+" : ""}{formatCell(c, r.cells[c.key], fmt, t)}</span>])),
      }}
    >
      <CountSheet slug={slug} open={countOpen} onOpenChange={setCountOpen} campuses={campuses} items={items} />
      <TransferSheet slug={slug} open={transferOpen} onOpenChange={setTransferOpen} campuses={campuses} items={items} />
    </ListView>
  );
}

/** Enter what's on the shelf; the differences are booked as stock adjustments. */
function CountSheet({ slug, open, onOpenChange, campuses, items }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; campuses: { id: string; name: string; nameAr: string | null }[]; items: StockItem[] }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
  const [date, setDate] = useState(todayInDoha);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCounted({});
      setNote("");
      setDate(todayInDoha());
    }
  }
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return items.filter((i) => !f || i.sku.toLowerCase().includes(f) || i.name.toLowerCase().includes(f) || (i.nameAr ?? "").includes(filter.trim()));
  }, [items, filter]);
  const changes = Object.entries(counted)
    .map(([itemId, v]) => ({ itemId, counted: parseQty(v) }))
    .filter((c): c is { itemId: string; counted: number } => c.counted !== null && c.counted !== (items.find((i) => i.id === c.itemId)?.levels[campusId] ?? 0));

  const submit = () =>
    start(async () => {
      const res = await saveStockCount(slug, { campusId, date, note, lines: changes });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("stock.countSaved", { value: fmt.money(res.value, { decimals: true }) }));
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      wide
      title={t("stock.count")}
      description={t("stock.countHint")}
      footer={
        <>
          <span className="me-auto text-sm text-muted">{t("stock.changes", { n: fmt.number(changes.length) })}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || changes.length === 0}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("stock.saveCount")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("stock.warehouse")} htmlFor="cnt-campus">
            <select id="cnt-campus" value={campusId} onChange={(e) => (setCampusId(e.target.value), setCounted({}))} className={inputClass}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name, c.nameAr)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("docs.colDate")} htmlFor="cnt-date">
            <Input id="cnt-date" type="date" value={date} max={todayInDoha()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t("claims.note")} htmlFor="cnt-note">
          <Input id="cnt-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("stock.countNotePlaceholder")} />
        </Field>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("items.search")} className="h-9 text-sm" aria-label={t("items.search")} />
        <ul className="divide-y divide-line rounded-xl border border-line">
          {shown.map((i) => {
            const system = i.levels[campusId] ?? 0;
            const v = counted[i.id];
            const parsed = v ? parseQty(v) : null;
            const diff = parsed !== null ? parsed - system : 0;
            return (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{pick(locale, i.name, i.nameAr)}</p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">{i.sku}</span> · {t("stock.system", { qty: fmt.number(system / 100) })}
                  </p>
                </div>
                {diff !== 0 && <span className={cn("tabular text-xs font-semibold", diff > 0 ? "text-success" : "text-danger")}>{diff > 0 ? "+" : "−"}{fmt.number(Math.abs(diff) / 100)}</span>}
                <input dir="ltr" inputMode="decimal" aria-label={i.name} value={v ?? ""} placeholder={String(system / 100)} onChange={(e) => setCounted((c) => ({ ...c, [i.id]: e.target.value }))} className={cn(inputClass, "h-9 w-24 text-end text-sm tabular")} />
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

function TransferSheet({ slug, open, onOpenChange, campuses, items }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; campuses: { id: string; name: string; nameAr: string | null }[]; items: StockItem[] }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [from, setFrom] = useState(campuses[0]?.id ?? "");
  const [to, setTo] = useState(campuses[1]?.id ?? campuses[0]?.id ?? "");
  const [date, setDate] = useState(todayInDoha);
  const [lines, setLines] = useState<{ itemId: string; qty: string }[]>([]);
  const [pending, start] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLines([]);
      setDate(todayInDoha());
    }
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const submit = () =>
    start(async () => {
      const res = await saveTransfer(slug, { from, to, date, note: "", lines: lines.map((l) => ({ itemId: l.itemId, qty: parseQty(l.qty) ?? 0 })).filter((l) => l.qty > 0) });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("stock.transferred"));
      onOpenChange(false);
      router.refresh();
    });
  const opts = items.filter((i) => (i.levels[from] ?? 0) > 0 && !lines.some((l) => l.itemId === i.id)).map((i) => ({ value: i.id, label: pick(locale, i.name, i.nameAr), hint: `${i.sku} · ${t("stock.system", { qty: fmt.number((i.levels[from] ?? 0) / 100) })}`, keywords: [i.sku, i.name, i.nameAr ?? ""] }));
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={t("stock.transfer")}
      description={t("stock.transferHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !lines.length || from === to}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("stock.moveStock")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("stock.from")} htmlFor="trf-from">
            <select id="trf-from" value={from} onChange={(e) => (setFrom(e.target.value), setLines([]))} className={inputClass}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name, c.nameAr)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("stock.to")} htmlFor="trf-to" error={from === to ? t("inventory.sameWarehouse") : undefined}>
            <select id="trf-to" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name, c.nameAr)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("docs.colDate")} htmlFor="trf-date">
          <Input id="trf-date" type="date" value={date} max={todayInDoha()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {lines.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {lines.map((l, idx) => {
              const it = byId.get(l.itemId)!;
              return (
                <li key={l.itemId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{pick(locale, it.name, it.nameAr)}</p>
                    <p className="text-xs text-muted">{t("stock.system", { qty: fmt.number((it.levels[from] ?? 0) / 100) })}</p>
                  </div>
                  <input dir="ltr" inputMode="decimal" aria-label={it.name} value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === idx ? { ...x, qty: e.target.value } : x)))} className={cn(inputClass, "h-9 w-24 text-end text-sm tabular")} />
                  <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== idx))} aria-label={t("docs.removeLine")}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-muted" />
          <div className="flex-1">
            <Combobox compact value={null} onChange={(v) => setLines((ls) => [...ls, { itemId: v, qty: "1" }])} options={opts} placeholder={t("docs.addItem")} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
