"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Ban, Check, ChevronDown, Download, FileInput, HandCoins, Loader2, PackageCheck, Pencil, Printer, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Thread } from "@/components/records/thread";
import { celebrate } from "@/components/motion/celebrate";
import { amountInWords } from "@/lib/words";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { ThreadItem } from "@/lib/thread";
import { docAction, type DocAction } from "@/app/actions/biz";
import { PaymentSheet } from "./payment-sheet";
import { ReceiveSheet } from "./receive-sheet";

type Kind = "quote" | "invoice" | "po" | "bill";

interface Line {
  id: string;
  sku: string | null;
  unit: string | null;
  product: boolean;
  description: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  amount: number;
  received: number;
  account: { code: string; name: string; nameAr: string | null } | null;
}

export interface DocViewData {
  id: string;
  kind: Kind;
  number: string;
  status: string;
  shownStatus: string;
  date: string;
  dueDate: string | null;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  campus: { id: string; name: string; nameAr: string | null } | null;
  party: { id: string; name: string; nameAr: string | null; address: string | null; addressAr: string | null; phone: string | null; email: string | null; crNumber: string | null };
  lines: Line[];
  payments: { id: string; number: string; date: string; amount: number; method: string; voided: boolean }[];
}

const PATH: Record<Kind, string> = { quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills" };
const LIST: Record<Kind, MessageKey> = { quote: "nav.quotations", invoice: "nav.invoices", po: "nav.purchaseOrders", bill: "nav.purchaseBills" };
const TITLE: Record<Kind, MessageKey> = { quote: "docs.quote", invoice: "docs.invoice", po: "docs.po", bill: "docs.bill" };

export function DocView({
  slug,
  now,
  viewerId,
  doc,
  org,
  source,
  derived,
  entries,
  campuses,
  thread,
  canManage,
  canReceive,
}: {
  slug: string;
  now: string;
  viewerId: string;
  doc: DocViewData;
  org: { name: string; nameAr: string | null; address: string | null; addressAr: string | null; phone: string | null; email: string | null; crNumber: string | null; logoUrl: string | null; bankName: string | null; iban: string | null };
  source: { id: string; number: string; href: string } | null;
  derived: { id: string; number: string; status: string; href: string }[];
  entries: { id: string; number: string; date: string; memo: string | null; reversed: boolean; lines: { code: string; name: string; nameAr: string | null; debit: number; credit: number }[] }[];
  campuses: { id: string; name: string; nameAr: string | null }[];
  thread: ThreadItem[];
  canManage: boolean;
  canReceive: boolean;
}) {
  const { t, fmt, locale, dir } = useI18n();
  const reduced = useReducedMotion();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [confirm, setConfirm] = useState<DocAction | null>(null);
  const [billRef, setBillRef] = useState("");
  const [showLedger, setShowLedger] = useState(false);
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const k = doc.kind;
  const s = doc.status;
  const sales = k === "quote" || k === "invoice";
  const base = `/w/${slug}`;
  const open = doc.total - doc.paid;
  const exportUrl = (format: string) => `/api/w/${slug}/export/document?id=${doc.id}&format=${format}`;

  const run = (action: DocAction, extra?: { reference?: string }) =>
    start(async () => {
      const res = await docAction(slug, doc.id, action, extra);
      setConfirm(null);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t(`docs.done_${action}` as MessageKey, { number: res.number ?? doc.number }));
      if (action === "accept" || action === "convert") celebrate(reduced);
      if (action === "delete") router.push(`${base}/${PATH[k]}`);
      else if (res.id) router.push(`${base}/${action === "convert" ? "sales/invoices" : "purchases/bills"}/${res.id}`);
      else router.refresh();
    });

  // What can happen next, by kind and status.
  type Act = { key: string; label: MessageKey; icon: typeof Check; onClick: () => void; primary?: boolean; danger?: boolean };
  const acts: Act[] = [];
  const editable = s === "draft" || ((k === "quote" || k === "po") && s === "sent");
  if (canManage) {
    if (editable) acts.push({ key: "edit", label: "common.edit", icon: Pencil, onClick: () => router.push(`${base}/${PATH[k]}/${doc.id}/edit`) });
    if (k === "invoice" && s === "draft") acts.push({ key: "issue", label: "docs.issue", icon: Send, primary: true, onClick: () => run("issue") });
    if (k === "bill" && s === "draft") acts.push({ key: "post", label: "docs.post", icon: Check, primary: true, onClick: () => run("post") });
    if ((k === "quote" || k === "po") && s === "draft") acts.push({ key: "send", label: "docs.markSent", icon: Send, onClick: () => run("send") });
    if (k === "quote" && ["draft", "sent", "accepted"].includes(s)) acts.push({ key: "convert", label: "docs.convert", icon: FileInput, primary: s !== "draft", onClick: () => run("convert") });
    if (k === "quote" && ["draft", "sent"].includes(s)) {
      acts.push({ key: "accept", label: "docs.markAccepted", icon: Check, onClick: () => run("accept") });
      acts.push({ key: "decline", label: "docs.markDeclined", icon: X, onClick: () => run("decline") });
    }
    if (k === "quote" && s === "declined") acts.push({ key: "reopen", label: "docs.reopen", icon: RotateCcw, onClick: () => run("reopen") });
    if ((k === "invoice" || k === "bill") && ["issued", "posted", "partial"].includes(s)) acts.push({ key: "pay", label: k === "invoice" ? "payments.receive" : "payments.pay", icon: HandCoins, primary: true, onClick: () => setPayOpen(true) });
    if (k === "po" && ["partial", "received"].includes(s)) acts.push({ key: "bill", label: "docs.createBill", icon: FileInput, primary: s === "received", onClick: () => setConfirm("bill") });
    if ((k === "invoice" && s === "issued") || (k === "bill" && s === "posted")) acts.push({ key: "void", label: "docs.void", icon: Ban, danger: true, onClick: () => setConfirm("void") });
    if (k === "po" && ["draft", "sent"].includes(s)) acts.push({ key: "cancel", label: "docs.cancelPo", icon: Ban, danger: true, onClick: () => setConfirm("cancel") });
    if (s === "draft" || (k === "quote" && ["sent", "declined"].includes(s))) acts.push({ key: "delete", label: "common.delete", icon: Trash2, danger: true, onClick: () => setConfirm("delete") });
  }
  if (canReceive && k === "po" && ["draft", "sent", "partial"].includes(s)) acts.unshift({ key: "receive", label: s === "partial" ? "docs.receiveRest" : "docs.receive", icon: PackageCheck, primary: true, onClick: () => setReceiveOpen(true) });

  const orgName = pick(locale, org.name, org.nameAr);
  const partyName = pick(locale, doc.party.name, doc.party.nameAr);
  const partyAddress = locale === "ar" ? (doc.party.addressAr ?? doc.party.address) : (doc.party.address ?? doc.party.addressAr);

  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`${base}/${PATH[k]}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t(LIST[k])}
      </Link>

      <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Paper */}
        <Card className="overflow-hidden">
          <div className={cn("h-1.5", doc.shownStatus === "overdue" ? "bg-danger" : s === "paid" || s === "received" || s === "billed" ? "bg-success" : "bg-accent")} />
          <div className="p-6 sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex items-start gap-3">
                {org.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logoUrl} alt="" className="size-14 rounded-xl object-contain" />
                )}
                <div className="text-sm">
                  <p className="font-semibold">{orgName}</p>
                  <p className="max-w-64 text-muted">{locale === "ar" ? (org.addressAr ?? org.address) : (org.address ?? org.addressAr)}</p>
                  <p className="text-muted" dir="ltr">
                    {[org.phone, org.email].filter(Boolean).join(" · ")}
                  </p>
                  {org.crNumber && (
                    <p className="text-muted">
                      {t("ws.crNumber")}: <span dir="ltr">{org.crNumber}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="text-end">
                <p className="text-2xl font-semibold tracking-tight">{t(TITLE[k])}</p>
                <p className="font-mono text-sm text-muted">{doc.number}</p>
                <div className="mt-2">
                  <StatusBadge status={doc.shownStatus} />
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold tracking-wide text-subtle uppercase">{t(sales ? "docs.billTo" : "docs.supplier")}</p>
                <Link href={`${base}/${sales ? "sales/customers" : "purchases/suppliers"}/${doc.party.id}`} className="mt-1 block font-semibold hover:text-accent">
                  {partyName}
                </Link>
                {partyAddress && <p className="text-muted">{partyAddress}</p>}
                {doc.party.phone && (
                  <p className="text-muted" dir="ltr">
                    {doc.party.phone}
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
                <dt className="text-muted">{t("docs.colDate")}</dt>
                <dd className="text-end">
                  {fmt.date(doc.date)}
                  <span className="block text-xs text-subtle">{fmt.hijri(new Date(doc.date))}</span>
                </dd>
                {doc.dueDate && (
                  <>
                    <dt className="text-muted">{t(k === "quote" ? "docs.colValidUntil" : k === "po" ? "docs.colExpected" : "docs.colDue")}</dt>
                    <dd className={cn("text-end", doc.shownStatus === "overdue" && "font-semibold text-danger")}>{fmt.date(doc.dueDate)}</dd>
                  </>
                )}
                {doc.reference && (
                  <>
                    <dt className="text-muted">{t(k === "bill" ? "docs.colSupplierRef" : k === "invoice" ? "docs.customerPo" : "docs.colReference")}</dt>
                    <dd className="text-end" dir="ltr">
                      {doc.reference}
                    </dd>
                  </>
                )}
                {doc.campus && campuses.length > 1 && (
                  <>
                    <dt className="text-muted">{t(sales ? "docs.branch" : "docs.warehouse")}</dt>
                    <dd className="text-end">{pick(locale, doc.campus.name, doc.campus.nameAr)}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-fg/80 text-xs text-muted">
                    <th className="py-2 pe-2 text-start font-semibold">#</th>
                    <th className="py-2 pe-2 text-start font-semibold">{t("docs.colDescription")}</th>
                    <th className="py-2 px-2 text-end font-semibold">{t("docs.colQty")}</th>
                    {k === "po" && <th className="py-2 px-2 text-end font-semibold">{t("docs.colReceived")}</th>}
                    <th className="py-2 px-2 text-end font-semibold">{t("docs.colUnitPrice")}</th>
                    {doc.discount > 0 && <th className="py-2 px-2 text-end font-semibold">{t("docs.colDiscount")}</th>}
                    <th className="py-2 ps-2 text-end font-semibold">{t("docs.colAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-line align-top">
                      <td className="py-2.5 pe-2 text-subtle tabular">{fmt.number(i + 1)}</td>
                      <td className="py-2.5 pe-2">
                        {l.description}
                        {(l.sku || l.account) && <span className="block text-xs text-subtle">{l.sku ?? `${l.account!.code} · ${pick(locale, l.account!.name, l.account!.nameAr)}`}</span>}
                      </td>
                      <td className="py-2.5 px-2 text-end tabular whitespace-nowrap">
                        {fmt.number(l.qty / 100)} {l.unit && <span className="text-xs text-subtle">{l.unit}</span>}
                      </td>
                      {k === "po" && <td className={cn("py-2.5 px-2 text-end tabular", l.product && l.received < l.qty ? "text-warning" : "text-success")}>{l.product ? fmt.number(l.received / 100) : "—"}</td>}
                      <td className="py-2.5 px-2 text-end tabular">{fmt.money(l.unitPrice, { decimals: true })}</td>
                      {doc.discount > 0 && <td className="py-2.5 px-2 text-end tabular">{l.discountPct ? `${fmt.number(l.discountPct / 100)}%` : ""}</td>}
                      <td className="py-2.5 ps-2 text-end font-medium tabular">{fmt.money(l.amount, { decimals: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <p className="max-w-sm text-xs leading-relaxed text-muted">{amountInWords(doc.total, locale)}</p>
              <dl className="grid min-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
                <dt className="text-muted">{t("docs.subtotal")}</dt>
                <dd className="text-end tabular">{fmt.money(doc.subtotal, { decimals: true })}</dd>
                {doc.discount > 0 && (
                  <>
                    <dt className="text-muted">{t("docs.discount")}</dt>
                    <dd className="text-end tabular">−{fmt.money(doc.discount, { decimals: true })}</dd>
                  </>
                )}
                <dt className="border-t border-line pt-2 text-base font-semibold">{t("docs.colTotal")}</dt>
                <dd className="border-t border-line pt-2 text-end text-base font-semibold tabular">{fmt.money(doc.total, { decimals: true })}</dd>
                {(k === "invoice" || k === "bill") && doc.paid > 0 && (
                  <>
                    <dt className="text-muted">{t("docs.paidSoFar")}</dt>
                    <dd className="text-end tabular text-success">−{fmt.money(doc.paid, { decimals: true })}</dd>
                    <dt className="font-semibold">{t("docs.balanceDue")}</dt>
                    <dd className="text-end font-semibold tabular">{fmt.money(open, { decimals: true })}</dd>
                  </>
                )}
              </dl>
            </div>

            {(doc.notes || doc.terms || (k === "invoice" && org.iban)) && (
              <div className="mt-8 grid gap-4 border-t border-line pt-5 text-xs text-muted sm:grid-cols-2">
                {doc.notes && (
                  <div>
                    <p className="mb-1 font-semibold text-fg">{t("docs.notes")}</p>
                    <p className="whitespace-pre-line">{doc.notes}</p>
                  </div>
                )}
                {doc.terms && (
                  <div>
                    <p className="mb-1 font-semibold text-fg">{t("docs.terms")}</p>
                    <p className="whitespace-pre-line">{doc.terms}</p>
                  </div>
                )}
                {k === "invoice" && org.iban && (
                  <div>
                    <p className="mb-1 font-semibold text-fg">{t("docs.payTo")}</p>
                    <p>{org.bankName}</p>
                    <p dir="ltr" className="font-mono">
                      {org.iban}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Side panel */}
        <div className="space-y-[var(--gap)]">
          <Card>
            <CardBody className="space-y-3">
              {(k === "invoice" || k === "bill") && !["draft", "void"].includes(s) && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted">{t("docs.balanceDue")}</span>
                    <span className="tabular text-xl font-semibold">{fmt.money(open, { decimals: true })}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-success transition-[width] duration-700" style={{ width: `${Math.min(100, (doc.paid / Math.max(1, doc.total)) * 100)}%` }} />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {acts.map((a) => (
                  <Button key={a.key} variant={a.primary ? "primary" : a.danger ? "ghost" : "secondary"} size="sm" onClick={a.onClick} disabled={pending} className={a.danger ? "text-danger hover:text-danger" : undefined}>
                    <a.icon className="size-3.5" /> {t(a.label)}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 border-t border-line pt-3">
                <a href={exportUrl("print")} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
                  <Printer className="size-3.5" /> {t("toolbar.print")}
                </a>
                <a href={exportUrl("pdf")} className={buttonClass("ghost", "sm")}>
                  <Download className="size-3.5" /> PDF
                </a>
              </div>
              {pending && <Loader2 className="size-4 animate-spin text-muted" />}
            </CardBody>
          </Card>

          {(source || derived.length > 0) && (
            <Card>
              <CardHeader title={t("docs.related")} />
              <CardBody className="space-y-1.5 text-sm">
                {source && (
                  <Link href={`${base}/${source.href}`} className="flex justify-between rounded-lg px-2 py-1.5 hover:bg-sunken">
                    <span className="text-muted">{t("docs.createdFrom")}</span>
                    <span className="font-mono text-xs">{source.number}</span>
                  </Link>
                )}
                {derived.map((d) => (
                  <Link key={d.id} href={`${base}/${d.href}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-sunken">
                    <span className="font-mono text-xs">{d.number}</span>
                    <StatusBadge status={d.status} />
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}

          {doc.payments.length > 0 && (
            <Card>
              <CardHeader title={t(k === "invoice" ? "nav.paymentsIn" : "nav.paymentsOut")} />
              <CardBody className="space-y-1.5 text-sm">
                {doc.payments.map((p) => (
                  <div key={p.id} className={cn("flex items-center justify-between gap-2", p.voided && "text-subtle line-through")}>
                    <span>
                      <span className="font-mono text-xs">{p.number}</span>
                      <span className="block text-xs text-muted">
                        {fmt.date(p.date)} · {t(`payments.${p.method}` as MessageKey)}
                      </span>
                    </span>
                    <span className="tabular font-medium">{fmt.money(p.amount, { decimals: true })}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {entries.length > 0 && (
            <Card>
              <button type="button" onClick={() => setShowLedger((v) => !v)} className="flex w-full items-center justify-between px-[var(--pad)] py-3 text-sm font-semibold" aria-expanded={showLedger}>
                {t("docs.ledgerEntries")}
                <ChevronDown className={cn("size-4 text-muted transition-transform", showLedger && "rotate-180")} />
              </button>
              {showLedger && (
                <CardBody className="space-y-4 pt-0 text-xs">
                  {entries.map((e) => (
                    <div key={e.id} className={cn(e.reversed && "opacity-60")}>
                      <p className="mb-1 flex justify-between text-muted">
                        <span className="font-mono">{e.number}</span>
                        <span>{fmt.date(e.date)}</span>
                      </p>
                      <table className="w-full">
                        <tbody>
                          {e.lines.map((l, i) => (
                            <tr key={i}>
                              <td className={cn("py-0.5", l.credit > 0 && "ps-4")}>
                                {l.code} {pick(locale, l.name, l.nameAr)}
                              </td>
                              <td className="w-20 text-end tabular">{l.debit ? fmt.money(l.debit, { decimals: true }) : ""}</td>
                              <td className="w-20 text-end tabular">{l.credit ? fmt.money(l.credit, { decimals: true }) : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </CardBody>
              )}
            </Card>
          )}

          <Thread slug={slug} entityType="document" entityId={doc.id} items={thread} now={now} viewerId={viewerId} />
        </div>
      </div>

      {(k === "invoice" || k === "bill") && <PaymentSheet slug={slug} open={payOpen} onOpenChange={setPayOpen} direction={k === "invoice" ? "in" : "out"} partyId={doc.party.id} documentId={doc.id} />}
      {k === "po" && <ReceiveSheet slug={slug} open={receiveOpen} onOpenChange={setReceiveOpen} poId={doc.id} lines={doc.lines.filter((l) => l.product)} campuses={campuses} defaultCampus={doc.campus?.id ?? campuses[0]?.id} />}

      <Modal
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`docs.confirm_${confirm}` as MessageKey, { number: doc.number }) : ""}
        description={confirm ? t(`docs.confirm_${confirm}_body` as MessageKey) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant={confirm === "bill" ? "primary" : "danger"} onClick={() => confirm && run(confirm, confirm === "bill" ? { reference: billRef } : undefined)} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {confirm ? t(confirm === "bill" ? "docs.createBill" : confirm === "delete" ? "common.delete" : confirm === "cancel" ? "docs.cancelPo" : "docs.void") : ""}
            </Button>
          </>
        }
      >
        {confirm === "bill" && (
          <Field label={t("docs.colSupplierRef")} hint={t("docs.supplierRefHint")} htmlFor="bill-ref">
            <Input id="bill-ref" dir="ltr" value={billRef} onChange={(e) => setBillRef(e.target.value)} autoFocus />
          </Field>
        )}
      </Modal>
    </div>
  );
}
