"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, inputClass } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { Combobox } from "@/components/ui/combobox";
import { celebrate } from "@/components/motion/celebrate";
import { useReducedMotion } from "@/components/providers";
import { parseMoney } from "@/lib/money";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { paymentContext, savePayment } from "@/app/actions/biz";

type Ctx = Awaited<ReturnType<typeof paymentContext>>;
const todayInDoha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());

/** Record money received from a customer (in) or paid to a supplier (out), applied oldest-first. */
export function PaymentSheet({
  slug,
  open,
  onOpenChange,
  direction,
  partyId: fixedParty,
  documentId,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  direction: "in" | "out";
  partyId?: string;
  /** Pre-select this document (opened from an invoice or bill) */
  documentId?: string;
}) {
  const { t, fmt, locale } = useI18n();
  const reduced = useReducedMotion();
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [partyId, setPartyId] = useState<string | null>(fixedParty ?? null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInDoha);
  const [method, setMethod] = useState<"transfer" | "cash" | "cheque" | "card">("transfer");
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Reset each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCtx(null);
      setPartyId(fixedParty ?? null);
      setAmount("");
      setDate(todayInDoha());
      setMethod("transfer");
      setReference("");
      setNotes("");
      setAlloc({});
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let live = true;
    paymentContext(slug, direction, partyId).then((c) => {
      if (!live) return;
      setCtx(c);
      setAccountId((a) => a || (c.accounts.find((x) => x.role === "bank") ?? c.accounts[0])?.id || "");
      // Default: pay the chosen document, or everything open.
      const docs = documentId ? c.docs.filter((d) => d.id === documentId) : c.docs;
      const total = docs.reduce((s, d) => s + d.open, 0);
      setAmount(total ? (total / 100).toFixed(2) : "");
      setAlloc(Object.fromEntries(docs.map((d) => [d.id, (d.open / 100).toFixed(2)])));
    });
    return () => {
      live = false;
    };
  }, [open, slug, direction, partyId, documentId]);

  const amountValue = parseMoney(amount) ?? 0;
  const allocated = useMemo(() => Object.values(alloc).reduce((s, v) => s + (parseMoney(v) ?? 0), 0), [alloc]);

  // Typing a total re-spreads it over open documents, oldest due first.
  const spread = (value: string) => {
    setAmount(value);
    let left = parseMoney(value) ?? 0;
    const next: Record<string, string> = {};
    // Opened from a document: that one first, then the oldest.
    const ordered = [...(ctx?.docs ?? [])].sort((x, y) => (x.id === documentId ? -1 : y.id === documentId ? 1 : 0));
    for (const d of ordered) {
      const a = Math.min(left, d.open);
      next[d.id] = a > 0 ? (a / 100).toFixed(2) : "";
      left -= a;
    }
    setAlloc(next);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      if (!partyId) return setError(t("docs.partyRequired"));
      const res = await savePayment(slug, {
        direction,
        partyId,
        date,
        amount,
        method,
        accountId,
        reference,
        notes,
        allocations: Object.entries(alloc).map(([documentId, v]) => ({ documentId, amount: parseMoney(v) ?? 0 })),
      });
      if (!res.ok) return setError(t(res.error as MessageKey));
      toast.success(t(direction === "in" ? "payments.received" : "payments.paid", { number: res.number, amount: fmt.money(amountValue) }));
      if (direction === "in") celebrate(reduced);
      onOpenChange(false);
      router.refresh();
    });

  const over = allocated > amountValue;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={t(direction === "in" ? "payments.receive" : "payments.pay")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !ctx || over || amountValue <= 0}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("payments.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!fixedParty && (
          <Field label={t(direction === "in" ? "docs.colCustomer" : "docs.colSupplier")}>
            <Combobox
              value={partyId}
              onChange={(v) => setPartyId(v)}
              options={(ctx?.parties ?? []).map((p) => ({ value: p.id, label: pick(locale, p.name, p.nameAr), hint: p.phone ?? undefined, keywords: [p.name, p.nameAr ?? ""] }))}
              placeholder={t("docs.pickParty")}
            />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("docs.colAmount")} htmlFor="pay-amount">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-sm font-medium text-subtle">{fmt.config.currency ?? "QAR"}</span>
              <Input id="pay-amount" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => spread(e.target.value)} className="h-12 ps-14 text-lg font-semibold tabular" />
            </div>
          </Field>
          <Field label={t("docs.colDate")} htmlFor="pay-date">
            <Input id="pay-date" type="date" value={date} max={todayInDoha()} onChange={(e) => setDate(e.target.value)} className="h-12" />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("payments.colMethod")}</p>
          <Segmented
            label={t("payments.colMethod")}
            value={method}
            onChange={(m) => {
              setMethod(m);
              const cash = ctx?.accounts.find((a) => a.role === "cash");
              const bank = ctx?.accounts.find((a) => a.role === "bank");
              setAccountId(((m === "cash" ? cash : bank) ?? ctx?.accounts[0])?.id ?? "");
            }}
            options={[
              { value: "transfer", label: t("payments.transfer") },
              { value: "cheque", label: t("payments.cheque") },
              { value: "cash", label: t("payments.cash") },
              { value: "card", label: t("payments.card") },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("payments.colAccount")} htmlFor="pay-account">
            <select id="pay-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
              {ctx?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {pick(locale, a.name, a.nameAr)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={method === "cheque" ? t("payments.chequeNo") : t("docs.colReference")} htmlFor="pay-ref">
            <Input id="pay-ref" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

        <section>
          <p className="text-sm font-medium">{t("payments.applyTo")}</p>
          {!ctx ? (
            <p className="py-4 text-sm text-muted">
              <Loader2 className="me-2 inline size-4 animate-spin" />
              {t("common.loading")}
            </p>
          ) : ctx.docs.length === 0 ? (
            <p className="py-3 text-sm text-muted">{partyId ? t("payments.nothingOpen") : t("docs.pickParty")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {ctx.docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs">{d.number}</p>
                    <p className="text-xs text-muted">
                      {t("payments.openAmount", { amount: fmt.money(d.open, { decimals: true }) })}
                      {d.dueDate && ` · ${t("docs.colDue")} ${fmt.date(d.dueDate)}`}
                    </p>
                  </div>
                  <input
                    dir="ltr"
                    inputMode="decimal"
                    aria-label={d.number}
                    value={alloc[d.id] ?? ""}
                    onChange={(e) => setAlloc((a) => ({ ...a, [d.id]: e.target.value }))}
                    className={cn(inputClass, "h-9 w-32 text-end text-sm tabular")}
                  />
                </li>
              ))}
            </ul>
          )}
          {ctx && ctx.docs.length > 0 && (
            <p className={cn("mt-2 text-xs", over ? "text-danger" : "text-muted")}>
              {over ? t("payments.overApplied") : amountValue > allocated ? t("payments.unapplied", { amount: fmt.money(amountValue - allocated, { decimals: true }) }) : t("payments.fullyApplied")}
            </p>
          )}
        </section>

        <Field label={<>{t("claims.note")} <span className="font-normal text-subtle">({t("common.optional")})</span></>} htmlFor="pay-notes">
          <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
