"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Search, Users } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, inputClass } from "@/components/ui/input";
import { celebrate } from "@/components/motion/celebrate";
import { cn } from "@/lib/cn";
import { pick, type MessageKey } from "@/lib/i18n";
import { familyAccount, findFamilies, recordFeePayment } from "@/app/actions/fees";

type Account = Awaited<ReturnType<typeof familyAccount>>;

/** Take a payment from a family: pick them, see what's open (oldest first), apply the money. */
export function FeePaymentSheet({ slug, open, partyId: initialParty, onClose }: { slug: string; open: boolean; partyId: string | null; onClose: () => void }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [pending, start] = useTransition();
  const [partyId, setPartyId] = useState<string | null>(initialParty);
  const [familyName, setFamilyName] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof findFamilies>>>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"transfer" | "card" | "cash" | "cheque">("transfer");
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setPartyId(initialParty);
      setAccount(null);
      setQ("");
      setHits([]);
      setReference("");
      setMethod("transfer");
      setDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date()));
    }
  }

  useEffect(() => {
    if (!open || !partyId) return;
    let live = true;
    familyAccount(slug, partyId).then((a) => {
      if (!live) return;
      setAccount(a);
      setFamilyName(a.name);
      setAmount((a.invoices.reduce((s, d) => s + d.open, 0) / 100).toFixed(2));
      setAccountId(a.accounts.find((x) => x.role === "bank")?.id ?? a.accounts[0]?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [open, partyId, slug]);

  useEffect(() => {
    if (partyId || q.trim().length < 2) return;
    const id = setTimeout(() => findFamilies(slug, q).then(setHits), 250);
    return () => clearTimeout(id);
  }, [q, partyId, slug]);

  const pickMethod = (m: typeof method) => {
    setMethod(m);
    const want = m === "cash" ? "cash" : "bank";
    const acc = account?.accounts.find((x) => x.role === want);
    if (acc) setAccountId(acc.id);
  };

  // Money goes to the oldest invoices first.
  const cents = Math.round((Number(amount.replace(/,/g, "")) || 0) * 100);
  const allocations = (account?.invoices ?? []).reduce<{ documentId: string; amount: number }[]>((acc, d) => {
    const used = acc.reduce((x, a) => x + a.amount, 0);
    return [...acc, { documentId: d.id, amount: Math.max(0, Math.min(cents - used, d.open)) }];
  }, []);

  const submit = () =>
    start(async () => {
      if (!partyId) return;
      const res = await recordFeePayment(slug, { partyId, date, amount, method, accountId, reference, allocations });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      if (res.fullyPaid.length) {
        celebrate(reduced);
        toast.success(t("fees.paidInFull", { name: res.fullyPaid.join(", ") }));
      } else toast.success(t("fees.paid", { number: res.number }));
      onClose();
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && !pending && onClose()}
      title={t("fees.payTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !partyId || cents <= 0 || !accountId}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("fees.recordPayment")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!partyId ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input autoFocus className="ps-9" placeholder={t("fees.pickFamily")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {hits.map((h) => (
              <button key={h.partyId} type="button" onClick={() => (setPartyId(h.partyId), setFamilyName(h.name))} className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2 text-start text-sm hover:border-accent-line">
                <Users className="size-4 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.name}</span>
                  <span className="block truncate text-xs text-muted">{h.children}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-sunken px-3 py-2 text-sm">
              <span className="font-medium">{familyName || t("fees.family")}</span>
              {!initialParty && (
                <button type="button" className="text-xs text-accent hover:underline" onClick={() => (setPartyId(null), setAccount(null))}>
                  {t("common.edit")}
                </button>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold">{t("fees.openInvoices")}</p>
              {!account ? (
                <Loader2 className="size-4 animate-spin text-muted" />
              ) : account.invoices.length ? (
                <ul className="space-y-1.5">
                  {account.invoices.map((d, i) => {
                    const a = allocations[i]?.amount ?? 0;
                    return (
                      <li key={d.id} className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm", a ? "border-accent-line bg-accent-soft/40" : "border-line")}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{pick(locale, d.student, d.studentAr)}</span>
                          <span className="block text-xs text-muted">
                            {d.number}
                            {d.due ? ` · ${t("fees.colDue")} ${fmt.date(d.due, "short")}` : ""}
                          </span>
                        </span>
                        <span className="text-end tabular">
                          <span className="block font-medium">{fmt.money(d.open)}</span>
                          {a > 0 && <span className="block text-xs text-success">−{fmt.money(a)}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("fees.noOpen")}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fees.amount")} htmlFor="fp-amount">
                <Input id="fp-amount" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label={t("fees.colDate")} htmlFor="fp-date">
                <Input id="fp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fees.method")} htmlFor="fp-method">
                <select id="fp-method" className={inputClass} value={method} onChange={(e) => pickMethod(e.target.value as typeof method)}>
                  {(["transfer", "card", "cash", "cheque"] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`fees.method_${m}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("fees.account")} htmlFor="fp-account">
                <select id="fp-account" className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {(account?.accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {pick(locale, a.name, a.nameAr)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t("fees.reference")} htmlFor="fp-ref">
              <Input id="fp-ref" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Sheet>
  );
}
