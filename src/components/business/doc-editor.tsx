"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, inputClass } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { parseMoney } from "@/lib/money";
import { docTotals, lineAmount, parseQty } from "@/lib/docs/math";
import { amountInWords } from "@/lib/words";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { docAction, saveDoc, type DocAction } from "@/app/actions/biz";
import { PartySheet } from "./party-sheet";

type Kind = "quote" | "invoice" | "po" | "bill";

export interface EditorParty {
  id: string;
  name: string;
  nameAr: string | null;
  phone: string | null;
  paymentTerms: number;
  creditLimit: number | null;
  open: number;
}
export interface EditorItem {
  id: string;
  sku: string;
  name: string;
  nameAr: string | null;
  kind: string;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  onHand: number;
}
export interface EditorDoc {
  id: string;
  number: string;
  partyId: string;
  campusId: string | null;
  date: string;
  dueDate: string | null;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  lines: { itemId: string | null; description: string; qty: number; unitPrice: number; discountPct: number; accountId: string | null }[];
}

interface LineState {
  key: string;
  itemId: string | null;
  description: string;
  qty: string;
  unitPrice: string;
  discount: string;
  accountId: string | null;
}

const PATH: Record<Kind, string> = { quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills" };
const TITLE_NEW: Record<Kind, MessageKey> = { quote: "docs.newQuote", invoice: "docs.newInvoice", po: "docs.newPo", bill: "docs.newBill" };
const PRIMARY: Record<Kind, { action: DocAction; label: MessageKey }> = {
  quote: { action: "send", label: "docs.saveAndSend" },
  invoice: { action: "issue", label: "docs.saveAndIssue" },
  po: { action: "send", label: "docs.saveAndSend" },
  bill: { action: "post", label: "docs.saveAndPost" },
};
const DUE_LABEL: Record<Kind, MessageKey> = { quote: "docs.colValidUntil", invoice: "docs.colDue", po: "docs.colExpected", bill: "docs.colDue" };

const todayInDoha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());
const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const money = (dirhams: number) => (dirhams / 100).toFixed(2);
const qtyText = (q: number) => String(q / 100);
let keySeq = 0;
const newKey = () => `l${++keySeq}`;

export function DocEditor({
  slug,
  kind,
  initial,
  parties: initialParties,
  items,
  campuses,
  accounts,
  defaults,
  presetPartyId,
  canAddParty,
}: {
  slug: string;
  kind: Kind;
  initial?: EditorDoc;
  parties: EditorParty[];
  items: EditorItem[];
  campuses: { id: string; name: string; nameAr: string | null }[];
  accounts: { id: string; code: string; name: string; nameAr: string | null }[];
  defaults: { notes: string; terms: string; quoteDays: number };
  presetPartyId?: string | null;
  canAddParty: boolean;
}) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const sales = kind === "quote" || kind === "invoice";
  const [parties, setParties] = useState(initialParties);
  const [partyId, setPartyId] = useState<string | null>(initial?.partyId ?? presetPartyId ?? null);
  const [date, setDate] = useState(initial?.date.slice(0, 10) ?? todayInDoha());
  const party = parties.find((p) => p.id === partyId);
  const defaultDue = (d: string, p?: EditorParty) => (kind === "quote" ? addDays(d, defaults.quoteDays) : kind === "po" ? addDays(d, 7) : addDays(d, p?.paymentTerms ?? 30));
  const [due, setDue] = useState(initial?.dueDate?.slice(0, 10) ?? defaultDue(initial?.date.slice(0, 10) ?? todayInDoha(), parties.find((p) => p.id === (initial?.partyId ?? presetPartyId))));
  const [dueTouched, setDueTouched] = useState(!!initial);
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [campusId, setCampusId] = useState(initial?.campusId ?? campuses[0]?.id ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? defaults.notes);
  const [terms, setTerms] = useState(initial?.terms ?? defaults.terms);
  const [lines, setLines] = useState<LineState[]>(() =>
    initial?.lines.length
      ? initial.lines.map((l) => ({ key: newKey(), itemId: l.itemId, description: l.description, qty: qtyText(l.qty), unitPrice: money(l.unitPrice), discount: l.discountPct ? String(l.discountPct / 100) : "", accountId: l.accountId }))
      : [{ key: newKey(), itemId: null, description: "", qty: "1", unitPrice: "", discount: "", accountId: null }],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newParty, setNewParty] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const parsed = lines.map((l) => ({ qty: parseQty(l.qty) ?? 0, unitPrice: parseMoney(l.unitPrice || "0") ?? 0, discountPct: Math.round((Number(l.discount.replace(/[٫,]/g, ".")) || 0) * 100) }));
  const totals = docTotals(parsed);
  const overLimit = sales && party?.creditLimit != null && party.open + totals.total > party.creditLimit;

  const setLine = (key: string, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: string, itemId: string) => {
    const it = itemById.get(itemId);
    if (!it) return;
    setLine(key, { itemId, description: pick(locale, it.name, it.nameAr), unitPrice: money(sales ? it.salePrice : it.purchasePrice), accountId: null });
  };
  const addLine = (itemId?: string) => {
    const key = newKey();
    setLines((ls) => [...ls, { key, itemId: null, description: "", qty: "1", unitPrice: "", discount: "", accountId: null }]);
    if (itemId) setTimeout(() => pickItem(key, itemId), 0);
  };

  const choosePartyChange = (id: string) => {
    setPartyId(id);
    if (!dueTouched) setDue(defaultDue(date, parties.find((p) => p.id === id)));
  };

  const save = (then?: DocAction) =>
    start(async () => {
      const e: Record<string, string> = {};
      if (!partyId) e.party = t("docs.partyRequired");
      lines.forEach((l, i) => {
        if (!l.description.trim()) e[`d${i}`] = t("errors.required");
        if (!parseQty(l.qty)) e[`q${i}`] = t("docs.qtyInvalid");
        if (parseMoney(l.unitPrice || "0") === null) e[`p${i}`] = t("claims.amountInvalid");
      });
      setErrors(e);
      if (Object.keys(e).length) return;
      const res = await saveDoc(slug, kind, initial?.id ?? null, {
        partyId: partyId!,
        campusId,
        date,
        dueDate: due || null,
        reference,
        notes,
        terms,
        lines: lines.map((l, i) => ({ itemId: l.itemId, description: l.description.trim(), qty: parsed[i].qty, unitPrice: parsed[i].unitPrice, discountPct: Math.min(10000, parsed[i].discountPct), accountId: l.accountId })),
      });
      if (!res.ok) {
        toast.error(t(res.error as MessageKey));
        return;
      }
      if (then) {
        const r2 = await docAction(slug, res.id, then);
        if (!r2.ok) toast.error(t(r2.error as MessageKey));
        else toast.success(t(`docs.done_${then}` as MessageKey, { number: res.number }));
      } else toast.success(t("docs.savedDraft", { number: res.number }));
      router.push(`/w/${slug}/${PATH[kind]}/${res.id}`);
    });

  const listHref = `/w/${slug}/${PATH[kind]}`;
  const itemOptions = items.map((i) => ({
    value: i.id,
    label: `${pick(locale, i.name, i.nameAr)}`,
    hint: `${i.sku} · ${fmt.money(sales ? i.salePrice : i.purchasePrice, { decimals: "auto" })}${i.kind === "product" ? ` · ${t("items.onHandShort", { qty: fmt.number(i.onHand / 100) })}` : ""}`,
    keywords: [i.sku, i.name, i.nameAr ?? ""],
  }));

  return (
    <div>
      <Link href={initial ? `${listHref}/${initial.id}` : listHref} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {initial ? initial.number : t(`nav.${{ quote: "quotations", invoice: "invoices", po: "purchaseOrders", bill: "purchaseBills" }[kind]}` as MessageKey)}
      </Link>
      <h1 className="mt-3 mb-5 text-2xl font-semibold tracking-tight">{initial ? t("docs.editNumber", { number: initial.number }) : t(TITLE_NEW[kind])}</h1>

      <Card>
        <CardBody className="grid gap-4 md:grid-cols-6">
          <Field label={t(sales ? "docs.colCustomer" : "docs.colSupplier")} error={errors.party} className="md:col-span-3">
            <Combobox
              value={partyId}
              onChange={choosePartyChange}
              options={parties.map((p) => ({ value: p.id, label: pick(locale, p.name, p.nameAr), hint: p.phone ?? undefined, keywords: [p.name, p.nameAr ?? ""] }))}
              placeholder={t("docs.pickParty")}
              invalid={!!errors.party}
              onCreate={canAddParty ? (text) => setNewParty(text) : undefined}
              createLabel={(text) => t(sales ? "docs.createCustomer" : "docs.createSupplier", { name: text })}
            />
            {overLimit && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="size-3.5" /> {t("docs.overCreditLimit", { limit: fmt.money(party!.creditLimit!) })}
              </p>
            )}
          </Field>
          <Field label={t("docs.colDate")} htmlFor="doc-date" className="md:col-span-1">
            <Input id="doc-date" type="date" value={date} onChange={(e) => (setDate(e.target.value), !dueTouched && setDue(defaultDue(e.target.value, party)))} />
          </Field>
          <Field label={t(DUE_LABEL[kind])} htmlFor="doc-due" className="md:col-span-2">
            <Input id="doc-due" type="date" value={due} min={date} onChange={(e) => (setDue(e.target.value), setDueTouched(true))} />
          </Field>
          <Field label={t(kind === "bill" ? "docs.colSupplierRef" : kind === "invoice" ? "docs.customerPo" : "docs.colReference")} htmlFor="doc-ref" className="md:col-span-3">
            <Input id="doc-ref" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          {campuses.length > 1 && (
            <Field label={t(sales ? "docs.branch" : "docs.warehouse")} htmlFor="doc-campus" className="md:col-span-3">
              <select id="doc-campus" value={campusId ?? ""} onChange={(e) => setCampusId(e.target.value)} className={inputClass}>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {pick(locale, c.name, c.nameAr)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </CardBody>
      </Card>

      <Card className="mt-[var(--gap)]">
        <CardBody>
          <div className="hidden grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6rem_8rem_5.5rem_8rem_2.25rem] gap-2 px-1 pb-2 text-xs font-semibold text-muted lg:grid">
            <span>{t("docs.colItem")}</span>
            <span>{t("docs.colDescription")}</span>
            <span className="text-end">{t("docs.colQty")}</span>
            <span className="text-end">{t("docs.colUnitPrice")}</span>
            <span className="text-end">{t("docs.colDiscount")}</span>
            <span className="text-end">{t("docs.colAmount")}</span>
            <span />
          </div>
          <ul className="space-y-3 lg:space-y-2">
            {lines.map((l, i) => {
              const it = l.itemId ? itemById.get(l.itemId) : undefined;
              const short = kind === "invoice" && it?.kind === "product" && parsed[i].qty > it.onHand;
              return (
                <li key={l.key} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6rem_8rem_5.5rem_8rem_2.25rem] lg:items-start lg:border-0 lg:p-1">
                  <div className="col-span-2 lg:col-span-1">
                    <Combobox compact value={l.itemId} onChange={(v) => pickItem(l.key, v)} options={itemOptions} placeholder={t("docs.pickItem")} />
                    {kind === "bill" && !it && (
                      <select aria-label={t("docs.account")} value={l.accountId ?? ""} onChange={(e) => setLine(l.key, { accountId: e.target.value || null })} className={cn(inputClass, "mt-1.5 h-9 rounded-lg text-sm")}>
                        <option value="">{t("docs.pickAccount")}</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {pick(locale, a.name, a.nameAr)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <Input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder={t("docs.colDescription")} aria-label={t("docs.colDescription")} aria-invalid={!!errors[`d${i}`]} className="h-9 rounded-lg text-sm" />
                    {short && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="size-3" /> {t("docs.onlyInStock", { qty: fmt.number(it!.onHand / 100), unit: it!.unit })}
                      </p>
                    )}
                  </div>
                  <Input dir="ltr" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label={t("docs.colQty")} aria-invalid={!!errors[`q${i}`]} className="h-9 rounded-lg text-end text-sm tabular" />
                  <Input dir="ltr" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} placeholder="0.00" aria-label={t("docs.colUnitPrice")} aria-invalid={!!errors[`p${i}`]} className="h-9 rounded-lg text-end text-sm tabular" />
                  <div className="relative">
                    <Input dir="ltr" inputMode="decimal" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} placeholder="0" aria-label={t("docs.colDiscount")} className="h-9 rounded-lg pe-6 text-end text-sm tabular" />
                    <span className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-xs text-subtle">%</span>
                  </div>
                  <p className="tabular flex h-9 items-center justify-end text-sm font-medium">{fmt.money(lineAmount(parsed[i]), { decimals: true })}</p>
                  <Button variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} aria-label={t("docs.removeLine")} disabled={lines.length === 1} className="justify-self-end">
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="soft" size="sm" onClick={() => addLine()}>
              <Plus className="size-3.5" /> {t("docs.addLine")}
            </Button>
            <div className="w-64">
              <Combobox compact value={null} onChange={(v) => addLine(v)} options={itemOptions} placeholder={t("docs.addItem")} />
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="mt-[var(--gap)] grid gap-[var(--gap)] lg:grid-cols-[1fr_24rem]">
        <Card>
          <CardBody className="space-y-4">
            <Field label={t("docs.notes")} hint={t("docs.notesHint")} htmlFor="doc-notes">
              <Textarea id="doc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {(kind === "quote" || kind === "invoice" || kind === "po") && (
              <Field label={t("docs.terms")} htmlFor="doc-terms">
                <Textarea id="doc-terms" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </Field>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">{t("docs.subtotal")}</span>
              <span className="tabular">{fmt.money(totals.subtotal, { decimals: true })}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">{t("docs.discount")}</span>
                <span className="tabular">−{fmt.money(totals.discount, { decimals: true })}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-lg font-semibold">
              <span>{t("docs.colTotal")}</span>
              <span className="tabular">{fmt.money(totals.total, { decimals: true })}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted">{amountInWords(totals.total, locale)}</p>
          </CardBody>
        </Card>
      </div>

      <div className="no-print sticky bottom-3 z-30 mt-[var(--gap)] rounded-2xl border border-line bg-surface/90 shadow-lift backdrop-blur-xl">
        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <span className="me-auto hidden text-sm text-muted sm:block">
            {t("docs.colTotal")}: <span className="tabular font-semibold text-fg">{fmt.money(totals.total, { decimals: true })}</span>
          </span>
          <Link href={initial ? `${listHref}/${initial.id}` : listHref} className="px-3 text-sm text-muted hover:text-fg">
            {t("common.cancel")}
          </Link>
          <Button variant="secondary" onClick={() => save()} disabled={pending}>
            {t("docs.saveDraft")}
          </Button>
          <Button onClick={() => save(PRIMARY[kind].action)} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t(PRIMARY[kind].label)}
          </Button>
        </div>
      </div>

      <PartySheet
        slug={slug}
        open={!!newParty}
        onOpenChange={(o) => !o && setNewParty(null)}
        which={sales ? "customer" : "supplier"}
        defaultName={newParty ?? ""}
        onSaved={(id, name) => {
          setParties((ps) => [...ps, { id, name, nameAr: null, phone: null, paymentTerms: 30, creditLimit: null, open: 0 }]);
          choosePartyChange(id);
        }}
      />
    </div>
  );
}
