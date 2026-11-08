"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import type { MessageKey } from "@/lib/i18n";
import { saveItem, type ItemInput } from "@/app/actions/biz";

export interface ItemData {
  id: string;
  sku: string;
  name: string;
  nameAr: string | null;
  kind: string;
  category: string | null;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  reorderLevel: number | null;
  reorderQty: number | null;
  barcode: string | null;
}

const UNITS = ["pcs", "box", "pack", "ream", "carton", "set", "roll", "kg", "m", "hour", "trip", "visit"];

export function ItemSheet({ slug, open, onOpenChange, initial, categories, canPrice }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; initial?: ItemData; categories: string[]; canPrice: boolean }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = (): ItemInput => ({
    sku: initial?.sku ?? "",
    name: initial?.name ?? "",
    nameAr: initial?.nameAr ?? "",
    kind: (initial?.kind as "product" | "service") ?? "product",
    category: initial?.category ?? "",
    unit: initial?.unit ?? "pcs",
    salePrice: initial ? (initial.salePrice / 100).toFixed(2) : "",
    purchasePrice: initial ? (initial.purchasePrice / 100).toFixed(2) : "",
    reorderLevel: initial?.reorderLevel != null ? String(initial.reorderLevel / 100) : "",
    reorderQty: initial?.reorderQty != null ? String(initial.reorderQty / 100) : "",
    barcode: initial?.barcode ?? "",
  });
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(blank());
      setErrors({});
    }
  }
  const set = <K extends keyof ItemInput>(k: K, v: ItemInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const sale = Number(form.salePrice) || 0;
  const cost = Number(form.purchasePrice) || 0;
  const margin = sale > 0 && cost > 0 ? (sale - cost) / sale : null;

  const submit = () =>
    start(async () => {
      const res = await saveItem(slug, initial?.id ?? null, form);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
        else toast.error(t(res.error as MessageKey));
        return;
      }
      toast.success(t("common.saved"));
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={initial ? t("items.edit") : t("items.new")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          label={t("items.kind")}
          value={form.kind}
          onChange={(k) => set("kind", k)}
          options={[
            { value: "product", label: t("items.product") },
            { value: "service", label: t("items.service") },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label={t("items.colSku")} error={errors.sku} htmlFor="i-sku">
            <Input id="i-sku" dir="ltr" value={form.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} aria-invalid={!!errors.sku} autoFocus={!initial} />
          </Field>
          <Field label={t("items.colName")} error={errors.name} htmlFor="i-name">
            <Input id="i-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
          </Field>
        </div>
        <Field label={t("items.nameAr")} htmlFor="i-name-ar">
          <Input id="i-name-ar" dir="rtl" value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("items.colCategory")} htmlFor="i-cat">
            <Input id="i-cat" list="i-cats" value={form.category} onChange={(e) => set("category", e.target.value)} />
            <datalist id="i-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={t("items.colUnit")} htmlFor="i-unit">
            <Input id="i-unit" list="i-units" dir="ltr" value={form.unit} onChange={(e) => set("unit", e.target.value)} />
            <datalist id="i-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("items.colPrice")} error={errors.salePrice} htmlFor="i-price" hint={!canPrice ? t("items.priceLocked") : undefined}>
            <Input id="i-price" dir="ltr" inputMode="decimal" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} disabled={!canPrice && !!initial} />
          </Field>
          <Field label={t("items.purchasePrice")} htmlFor="i-cost" hint={margin != null ? t("items.margin", { pct: fmt.percent(margin) }) : undefined}>
            <Input id="i-cost" dir="ltr" inputMode="decimal" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} disabled={!canPrice && !!initial} />
          </Field>
        </div>
        {form.kind === "product" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("items.colReorder")} hint={t("items.reorderHint")} htmlFor="i-reorder">
              <Input id="i-reorder" dir="ltr" inputMode="decimal" value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} />
            </Field>
            <Field label={t("items.reorderQty")} htmlFor="i-reorder-qty">
              <Input id="i-reorder-qty" dir="ltr" inputMode="decimal" value={form.reorderQty} onChange={(e) => set("reorderQty", e.target.value)} />
            </Field>
          </div>
        )}
        <Field label={t("items.barcode")} htmlFor="i-barcode">
          <Input id="i-barcode" dir="ltr" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
