"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, FileText, HandCoins, Mail, MapPin, Pencil, Phone, Plus, Printer } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Thread } from "@/components/records/thread";
import { pick, type MessageKey } from "@/lib/i18n";
import type { ThreadItem } from "@/lib/thread";
import { archiveParty } from "@/app/actions/biz";
import { MonthBars, StatTile } from "./charts";
import { PartySheet, type PartyData } from "./party-sheet";
import { PaymentSheet } from "./payment-sheet";

const DOC_PATH: Record<string, string> = { quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills" };
const DOC_LABEL: Record<string, MessageKey> = { quote: "docs.quote", invoice: "docs.invoice", po: "docs.po", bill: "docs.bill" };

export function PartyDetail({
  slug,
  which,
  party,
  stats,
  months,
  docs,
  payments,
  thread,
  viewerId,
  canManage,
  now,
}: {
  slug: string;
  which: "customer" | "supplier";
  party: PartyData & { archived: boolean };
  stats: { open: number; overdue: number; year: number; count: number };
  months: { month: string; total: number }[];
  docs: { id: string; kind: string; number: string; date: string; dueDate: string | null; total: number; paid: number; status: string }[];
  payments: { id: string; number: string; date: string; amount: number; method: string; reference: string | null; voided: boolean }[];
  thread: ThreadItem[];
  viewerId: string;
  canManage: boolean;
  now: string;
}) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const customer = which === "customer";
  const base = `/w/${slug}`;
  const listHref = `${base}/${customer ? "sales/customers" : "purchases/suppliers"}`;
  const name = pick(locale, party.name, party.nameAr);
  const other = locale === "ar" ? party.name : party.nameAr;

  const toggleArchive = () =>
    start(async () => {
      const res = await archiveParty(slug, party.id, !party.archived);
      if (!res.ok) toast.error(t(res.error as MessageKey));
      else router.refresh();
    });

  return (
    <div className="space-y-[var(--gap)]">
      <Link href={listHref} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t(customer ? "nav.customers" : "nav.suppliers")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          {other && <p className="text-muted">{other}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {party.isCustomer && <Badge tone="accent">{t("parties.isCustomer")}</Badge>}
            {party.isSupplier && <Badge tone="info">{t("parties.isSupplier")}</Badge>}
            {party.archived && <Badge>{t("parties.archived")}</Badge>}
            <Badge>{party.paymentTerms === 0 ? t("parties.onReceipt") : t("parties.netDays", { days: fmt.number(party.paymentTerms) })}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/w/${slug}/export/statement?party=${party.id}&format=print`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Printer className="size-4" /> {t("parties.statement")}
          </a>
          {canManage && (
            <>
              <Button variant="secondary" onClick={() => setPayOpen(true)}>
                <HandCoins className="size-4" /> {t(customer ? "payments.receive" : "payments.pay")}
              </Button>
              <Link href={`${base}/${customer ? "sales/invoices" : "purchases/bills"}/new?party=${party.id}`} className={buttonClass("primary")}>
                <Plus className="size-4" /> {t(customer ? "docs.newInvoice" : "docs.newBill")}
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[var(--gap)] lg:grid-cols-4">
        <StatTile label={t(customer ? "parties.colReceivable" : "parties.colPayable")} value={stats.open} />
        <StatTile label={t("parties.overdue")} value={stats.overdue} tone="danger" />
        <StatTile label={t(customer ? "parties.colSales12" : "parties.colPurchases12")} value={stats.year} />
        <StatTile label={t(customer ? "parties.invoiceCount" : "parties.billCount")} value={stats.count} money={false} />
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-[1fr_22rem]">
        <div className="space-y-[var(--gap)]">
          <Card>
            <CardHeader title={t(customer ? "parties.salesByMonth" : "parties.purchasesByMonth")} />
            <CardBody className="pt-2">
              <MonthBars data={months} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("parties.documents")}
              icon={<FileText className="size-4" />}
              action={
                canManage && (
                  <Link href={`${base}/${customer ? "sales/quotations" : "purchases/orders"}/new?party=${party.id}`} className={buttonClass("ghost", "sm")}>
                    <Plus className="size-3.5" /> {t(customer ? "docs.newQuote" : "docs.newPo")}
                  </Link>
                )
              }
            />
            <CardBody className="pt-2">
              {docs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">{t("parties.noDocuments")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {docs.slice(0, 15).map((d) => (
                    <li key={d.id}>
                      <Link href={`${base}/${DOC_PATH[d.kind]}/${d.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-sunken">
                        <span className="w-28 shrink-0 font-mono text-xs">{d.number}</span>
                        <span className="hidden w-24 shrink-0 text-muted sm:block">{t(DOC_LABEL[d.kind])}</span>
                        <span className="flex-1 text-muted">{fmt.date(d.date)}</span>
                        <span className="tabular font-medium">{fmt.money(d.total, { decimals: "auto" })}</span>
                        <span className="w-24 text-end">
                          <StatusBadge status={d.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {docs.length > 15 && (
                <Link href={`${base}/${customer ? "sales/invoices" : "purchases/bills"}?party=${party.id}`} className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
                  {t("common.viewAll")}
                </Link>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t(customer ? "nav.paymentsIn" : "nav.paymentsOut")}
              icon={<HandCoins className="size-4" />}
              action={
                payments.length > 8 && (
                  <Link href={`${base}/${customer ? "sales/payments" : "purchases/payments"}?party=${party.id}`} className="text-sm font-medium text-accent hover:underline">
                    {t("common.viewAll")}
                  </Link>
                )
              }
            />
            <CardBody className="pt-2">
              {payments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">{t("payments.none")}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {payments.slice(0, 8).map((p) => (
                    <li key={p.id} className={`flex items-center gap-3 py-2.5 ${p.voided ? "text-subtle line-through" : ""}`}>
                      <span className="w-28 shrink-0 font-mono text-xs">{p.number}</span>
                      <span className="flex-1 text-muted">
                        {fmt.date(p.date)} · {t(`payments.${p.method}` as MessageKey)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                      <span className="tabular font-medium">{fmt.money(p.amount, { decimals: "auto" })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-[var(--gap)]">
          <Card>
            <CardHeader
              title={t("parties.details")}
              action={
                canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                      <Pencil className="size-3.5" /> {t("common.edit")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={toggleArchive} disabled={pending} aria-label={party.archived ? t("parties.restore") : t("parties.archive")}>
                      {party.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                    </Button>
                  </div>
                )
              }
            />
            <CardBody className="space-y-2.5 text-sm">
              {party.contactName && <p className="font-medium">{party.contactName}</p>}
              {party.phone && (
                <a href={`tel:${party.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-muted hover:text-fg">
                  <Phone className="size-4" />
                  <span dir="ltr">{party.phone}</span>
                </a>
              )}
              {party.email && (
                <a href={`mailto:${party.email}`} className="flex items-center gap-2 text-muted hover:text-fg">
                  <Mail className="size-4" /> {party.email}
                </a>
              )}
              {(party.address || party.addressAr) && (
                <p className="flex items-start gap-2 text-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0" /> {locale === "ar" ? (party.addressAr ?? party.address) : (party.address ?? party.addressAr)}
                </p>
              )}
              {party.crNumber && (
                <p className="text-muted">
                  {t("parties.cr")}: <span dir="ltr">{party.crNumber}</span>
                </p>
              )}
              {party.creditLimit != null && (
                <p className="text-muted">
                  {t("parties.creditLimit")}: <span className="tabular">{fmt.money(party.creditLimit)}</span>
                  {stats.open > party.creditLimit && <Badge tone="danger" className="ms-2">{t("parties.overLimit")}</Badge>}
                </p>
              )}
              {party.notes && <p className="rounded-xl bg-sunken/70 p-3 text-muted">{party.notes}</p>}
            </CardBody>
          </Card>
          <Thread slug={slug} entityType="party" entityId={party.id} items={thread} now={now} viewerId={viewerId} />
        </div>
      </div>

      <PartySheet slug={slug} open={editOpen} onOpenChange={setEditOpen} which={which} initial={party} />
      <PaymentSheet slug={slug} open={payOpen} onOpenChange={setPayOpen} direction={customer ? "in" : "out"} partyId={party.id} />
    </div>
  );
}
