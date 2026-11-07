"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, inputClass } from "@/components/ui/input";
import { parseQty } from "@/lib/docs/math";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { receiveGoods } from "@/app/actions/biz";

const todayInDoha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());

/** Receive goods on a purchase order into a warehouse; partial deliveries are fine. */
export function ReceiveSheet({
  slug,
  open,
  onOpenChange,
  poId,
  lines,
  campuses,
  defaultCampus,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  lines: { id: string; description: string; sku: string | null; unit: string | null; qty: number; received: number }[];
  campuses: { id: string; name: string; nameAr: string | null }[];
  defaultCampus?: string;
}) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const remaining = (l: (typeof lines)[number]) => Math.max(0, l.qty - l.received);
  const blank = () => Object.fromEntries(lines.map((l) => [l.id, String(remaining(l) / 100)]));
  const [qty, setQty] = useState<Record<string, string>>(blank);
  const [campusId, setCampusId] = useState(defaultCampus ?? campuses[0]?.id ?? "");
  const [date, setDate] = useState(todayInDoha);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQty(blank());
      setDate(todayInDoha());
    }
  }

  const submit = () =>
    start(async () => {
      const res = await receiveGoods(slug, poId, { campusId, date, lines: lines.map((l) => ({ lineId: l.id, qty: Math.min(remaining(l), parseQty(qty[l.id] || "0") ?? 0) })) });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("docs.goodsReceived"));
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={t("docs.receive")}
      description={t("docs.receiveHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("docs.confirmReceipt")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("docs.warehouse")} htmlFor="rcv-campus">
            <select id="rcv-campus" value={campusId} onChange={(e) => setCampusId(e.target.value)} className={inputClass}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(locale, c.name, c.nameAr)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("docs.colDate")} htmlFor="rcv-date">
            <Input id="rcv-date" type="date" value={date} max={todayInDoha()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.description}</p>
                <p className="text-xs text-muted">
                  {l.sku} · {t("docs.receivedOf", { received: fmt.number(l.received / 100), ordered: fmt.number(l.qty / 100) })}
                </p>
              </div>
              <input
                dir="ltr"
                inputMode="decimal"
                aria-label={l.description}
                value={qty[l.id] ?? ""}
                disabled={remaining(l) === 0}
                onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                className={cn(inputClass, "h-9 w-24 text-end text-sm tabular")}
              />
              <span className="w-10 text-xs text-subtle">{l.unit}</span>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
