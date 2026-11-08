"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, History, Pencil, Warehouse } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Thread } from "@/components/records/thread";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { ThreadItem } from "@/lib/thread";
import { archiveItem } from "@/app/actions/biz";
import { MonthBars, StatTile } from "./charts";
import { ItemSheet, type ItemData } from "./item-sheet";

export function ItemDetail({
  slug,
  item,
  levels,
  months,
  moves,
  categories,
  thread,
  viewerId,
  now,
  canManage,
  canPrice,
  showCost,
}: {
  slug: string;
  item: ItemData & { avgCost: number; archived: boolean };
  levels: { campusId: string; name: string; nameAr: string | null; qty: number }[];
  months: { month: string; total: number }[];
  moves: { id: string; date: string; kind: string; qty: number; warehouse: string; ref: string; href: string | null }[];
  categories: string[];
  thread: ThreadItem[];
  viewerId: string;
  now: string;
  canManage: boolean;
  canPrice: boolean;
  showCost: boolean;
}) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const total = levels.reduce((s, l) => s + l.qty, 0);
  const product = item.kind === "product";
  const low = product && item.reorderLevel != null && total <= item.reorderLevel;
  const margin = item.salePrice > 0 && item.avgCost > 0 ? (item.salePrice - item.avgCost) / item.salePrice : null;
  const maxLevel = Math.max(1, ...levels.map((l) => l.qty), item.reorderLevel ?? 0);

  const toggle = () =>
    start(async () => {
      const res = await archiveItem(slug, item.id, !item.archived);
      if (!res.ok) toast.error(t(res.error as MessageKey));
      else router.refresh();
    });

  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/inventory/items`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("nav.items")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-muted">{item.sku}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{pick(locale, item.name, item.nameAr)}</h1>
          {locale === "ar" ? item.name !== item.nameAr && <p className="text-muted">{item.name}</p> : item.nameAr && <p className="text-muted">{item.nameAr}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.category && <Badge>{item.category}</Badge>}
            <Badge tone={product ? "accent" : "info"}>{t(product ? "items.product" : "items.service")}</Badge>
            {low && <Badge tone="warning">{t("items.low")}</Badge>}
            {item.archived && <Badge>{t("parties.archived")}</Badge>}
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> {t("common.edit")}
            </Button>
            <Button variant="ghost" onClick={toggle} disabled={pending} aria-label={item.archived ? t("parties.restore") : t("parties.archive")}>
              {item.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-[var(--gap)] lg:grid-cols-4">
        {product && <StatTile label={t("items.colOnHand")} value={total / 100} money={false} hint={item.unit} tone={low ? "warning" : undefined} />}
        <StatTile label={t("items.colPrice")} value={item.salePrice} hint={margin != null && showCost ? t("items.margin", { pct: fmt.percent(margin) }) : undefined} />
        {showCost && product && <StatTile label={t("items.colCost")} value={item.avgCost} />}
        {showCost && product && <StatTile label={t("items.colValue")} value={Math.round((total * item.avgCost) / 100)} />}
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-[1fr_22rem]">
        <div className="space-y-[var(--gap)]">
          <Card>
            <CardHeader title={t("items.soldByMonth")} />
            <CardBody className="pt-2">
              <MonthBars data={months} money={showCost} valueLabel={showCost ? undefined : item.unit} />
            </CardBody>
          </Card>
          {product && (
            <Card>
              <CardHeader
                title={t("stock.moves")}
                icon={<History className="size-4" />}
                action={
                  <Link href={`/w/${slug}/inventory/stock?view=moves&item=${item.id}`} className="text-sm font-medium text-accent hover:underline">
                    {t("common.viewAll")}
                  </Link>
                }
              />
              <CardBody className="pt-2">
                {moves.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">{t("items.noMoves")}</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {moves.map((m) => {
                      const inner = (
                        <>
                          <span className="w-24 shrink-0 text-muted">{fmt.date(m.date)}</span>
                          <span className="flex-1">
                            {t(`stock.kind${m.kind[0].toUpperCase()}${m.kind.slice(1)}` as MessageKey)}
                            <span className="block text-xs text-muted">
                              {m.warehouse}
                              {m.ref ? ` · ${m.ref}` : ""}
                            </span>
                          </span>
                          <span className={cn("tabular font-medium", m.qty > 0 ? "text-success" : "text-fg")}>
                            {m.qty > 0 ? "+" : "−"}
                            {fmt.number(Math.abs(m.qty) / 100)}
                          </span>
                        </>
                      );
                      return (
                        <li key={m.id}>
                          {m.href ? (
                            <Link href={`/w/${slug}/${m.href}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sunken">
                              {inner}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-3 py-2">{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-[var(--gap)]">
          {product && (
            <Card>
              <CardHeader title={t("stock.byWarehouse")} icon={<Warehouse className="size-4" />} />
              <CardBody className="space-y-4">
                {levels.map((l) => (
                  <div key={l.campusId}>
                    <div className="flex justify-between text-sm">
                      <span>{pick(locale, l.name, l.nameAr)}</span>
                      <span className="tabular font-semibold">
                        {fmt.number(l.qty / 100)} <span className="text-xs font-normal text-subtle">{item.unit}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
                      <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.max(2, (l.qty / maxLevel) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {item.reorderLevel != null && (
                  <p className="border-t border-line pt-3 text-xs text-muted">
                    {t("items.reorderAt", { qty: fmt.number(item.reorderLevel / 100), unit: item.unit })}
                    {item.reorderQty ? ` · ${t("items.orderQty", { qty: fmt.number(item.reorderQty / 100) })}` : ""}
                  </p>
                )}
              </CardBody>
            </Card>
          )}
          <Thread slug={slug} entityType="item" entityId={item.id} items={thread} now={now} viewerId={viewerId} />
        </div>
      </div>
      <ItemSheet slug={slug} open={editOpen} onOpenChange={setEditOpen} initial={item} categories={categories} canPrice={canPrice} />
    </div>
  );
}
