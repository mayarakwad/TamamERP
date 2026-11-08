import "server-only";
import { db } from "../db";
import { pick, type MessageKey } from "../i18n";
import { amountInWords } from "../words";
import { displayStatus } from "../datasets/sales";
import { documentShell, esc } from "./html";
import type { ExportDoc } from "./doc";

// Printable quotations, invoices, purchase orders, supplier bills and
// customer/supplier statements, in the reader's language and direction.

const TITLES: Record<string, MessageKey> = { quote: "docs.quote", invoice: "docs.invoice", po: "docs.po", bill: "docs.bill", fee: "fees.feeInvoice" };

const STYLE = `
.doc-head { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; padding-bottom:14px; border-bottom:2px solid var(--accent); }
.doc-org { display:flex; gap:12px; align-items:flex-start; }
.doc-org img { width:58px; height:58px; object-fit:contain; }
.doc-org .name { font-weight:600; font-size:12pt; }
.doc-org .line { color:#6b625c; font-size:8pt; }
.doc-title { text-align:end; }
.doc-title h1 { margin:0; font-size:20pt; color:var(--accent); font-weight:600; letter-spacing:-0.01em; }
.doc-title .no { font-family: ui-monospace, monospace; color:#555; }
.doc-title .st { display:inline-block; margin-top:4px; padding:1px 8px; border-radius:99px; font-size:7.5pt; background:#f3efec; }
.doc-title .st.overdue { background:#fde8e8; color:#b42318; }
.parties { display:flex; justify-content:space-between; gap:24px; margin:18px 0; }
.parties .label { font-size:7.5pt; color:#888; text-transform:uppercase; letter-spacing:.04em; }
.parties .who { font-weight:600; font-size:10.5pt; margin-top:2px; }
.parties .muted { color:#6b625c; font-size:8.5pt; }
.facts { border-collapse:collapse; width:auto; }
.facts td { border:0; padding:2px 0 2px 16px; background:none !important; }
[dir=rtl] .facts td { padding:2px 16px 2px 0; }
.facts td:first-child { color:#888; }
.facts td:last-child { text-align:end; }
.lines th:first-child, .lines td:first-child { width:28px; color:#999; }
.totals { display:flex; justify-content:space-between; gap:24px; margin-top:14px; break-inside:avoid; }
.words { max-width:55%; color:#555; font-size:8.5pt; padding-top:6px; }
.sum { min-width:240px; border-collapse:collapse; }
.sum td { border:0; padding:3px 0; background:none !important; }
.sum td:last-child { text-align:end; font-variant-numeric: tabular-nums; }
.sum .grand td { border-top:2px solid var(--accent); padding-top:6px; font-size:12pt; font-weight:600; }
.notes { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:22px; padding-top:12px; border-top:1px solid #ece5de; font-size:8pt; color:#555; break-inside:avoid; }
.notes h4 { margin:0 0 3px; font-size:8.5pt; color:#1f1a17; }
.sign { display:flex; gap:40px; margin-top:44px; break-inside:avoid; }
.sign div { flex:1; border-top:1px solid #999; padding-top:4px; font-size:8pt; color:#666; }
.balance-row td { font-weight:600; }
`;

function orgBlock(doc: ExportDoc) {
  const b = doc.brand;
  return `<div class="doc-org">${b.logo ? `<img src="${b.logo}" alt="">` : ""}<div>
    <div class="name">${esc(b.name)}</div>
    ${b.address ? `<div class="line">${esc(b.address)}</div>` : ""}
    ${b.phone || b.email ? `<div class="line" dir="ltr">${esc([b.phone, b.email].filter(Boolean).join(" · "))}</div>` : ""}
    ${b.crNumber ? `<div class="line">${esc(doc.t("ws.crNumber"))}: <span dir="ltr">${esc(b.crNumber)}</span></div>` : ""}
  </div></div>`;
}

const shell = (doc: ExportDoc, title: string, body: string, mode: "print" | "pdf") =>
  documentShell({ ...doc, title }, `<style>:root{--accent:${doc.brand.brandColor}}${STYLE}</style>${body}`, { mode, landscape: false, footer: `${doc.appName} · ${doc.brand.name}` });

export async function renderBusinessDocument(doc: ExportDoc, orgId: string, id: string, mode: "print" | "pdf", bank: { bankName?: string; iban?: string }) {
  const d = await db.document.findFirstOrThrow({ where: { id, orgId }, include: { party: true, lines: { orderBy: { sort: "asc" }, include: { item: { select: { sku: true, unit: true } } } } } });
  const { t, fmt, locale } = doc;
  const shown = displayStatus(d);
  const sales = d.kind === "quote" || d.kind === "invoice" || d.kind === "fee";
  const due = d.kind === "quote" ? t("docs.colValidUntil") : d.kind === "po" ? t("docs.colExpected") : t("docs.colDue");
  const discount = d.discount > 0;
  const row = (label: string, value: string, cls = "") => `<tr class="${cls}"><td>${esc(label)}</td><td>${value}</td></tr>`;
  const body = `
<div class="doc-head">${orgBlock(doc)}
  <div class="doc-title"><h1>${esc(t(TITLES[d.kind]))}</h1><div class="no">${esc(d.number)}</div><span class="st ${shown === "overdue" ? "overdue" : ""}">${esc(t(`status.${shown}` as MessageKey))}</span></div>
</div>
<div class="parties">
  <div><div class="label">${esc(t(sales ? "docs.billTo" : "docs.supplier"))}</div>
    <div class="who">${esc(pick(locale, d.party.name, d.party.nameAr))}</div>
    ${d.party.address || d.party.addressAr ? `<div class="muted">${esc(locale === "ar" ? (d.party.addressAr ?? d.party.address ?? "") : (d.party.address ?? d.party.addressAr ?? ""))}</div>` : ""}
    ${d.party.phone ? `<div class="muted" dir="ltr">${esc(d.party.phone)}</div>` : ""}
    ${d.party.crNumber ? `<div class="muted">${esc(t("ws.crNumber"))}: ${esc(d.party.crNumber)}</div>` : ""}
  </div>
  <table class="facts">
    ${row(t("docs.colDate"), `${esc(fmt.date(d.date, "long"))}<br><span style="color:#999;font-size:7.5pt">${esc(fmt.hijri(d.date))}</span>`)}
    ${d.dueDate ? row(due, esc(fmt.date(d.dueDate, "long"))) : ""}
    ${d.reference ? row(t(d.kind === "bill" ? "docs.colSupplierRef" : d.kind === "invoice" ? "docs.customerPo" : "docs.colReference"), `<span dir="ltr">${esc(d.reference)}</span>`) : ""}
  </table>
</div>
<table class="lines">
  <thead><tr><th>#</th><th>${esc(t("docs.colDescription"))}</th><th class="num">${esc(t("docs.colQty"))}</th><th class="num">${esc(t("docs.colUnitPrice"))}</th>${discount ? `<th class="num">${esc(t("docs.colDiscount"))}</th>` : ""}<th class="num">${esc(t("docs.colAmount"))}</th></tr></thead>
  <tbody>${d.lines
    .map(
      (l, i) => `<tr><td>${fmt.number(i + 1)}</td><td>${esc(l.description)}${l.item?.sku ? `<div style="color:#999;font-size:7.5pt">${esc(l.item.sku)}</div>` : ""}</td>
      <td class="num">${esc(fmt.number(l.qty / 100))} ${esc(l.item?.unit ?? "")}</td><td class="num">${esc(fmt.money(l.unitPrice, { decimals: true }))}</td>
      ${discount ? `<td class="num">${l.discountPct ? esc(`${fmt.number(l.discountPct / 100)}%`) : ""}</td>` : ""}<td class="num">${esc(fmt.money(l.amount, { decimals: true }))}</td></tr>`,
    )
    .join("")}</tbody>
</table>
<div class="totals">
  <div class="words">${esc(amountInWords(d.total, locale))}</div>
  <table class="sum">
    ${row(t("docs.subtotal"), esc(fmt.money(d.subtotal, { decimals: true })))}
    ${discount ? row(t("docs.discount"), `−${esc(fmt.money(d.discount, { decimals: true }))}`) : ""}
    ${row(t("docs.colTotal"), esc(fmt.money(d.total, { decimals: true })), "grand")}
    ${(d.kind === "invoice" || d.kind === "bill" || d.kind === "fee") && d.paid > 0 ? row(t("docs.paidSoFar"), `−${esc(fmt.money(d.paid, { decimals: true }))}`) + row(t("docs.balanceDue"), esc(fmt.money(d.total - d.paid, { decimals: true })), "balance-row") : ""}
  </table>
</div>
${
  d.notes || d.terms || ((d.kind === "invoice" || d.kind === "fee") && bank.iban)
    ? `<div class="notes">
  ${d.notes ? `<div><h4>${esc(t("docs.notes"))}</h4>${esc(d.notes).replace(/\n/g, "<br>")}</div>` : ""}
  ${d.terms ? `<div><h4>${esc(t("docs.terms"))}</h4>${esc(d.terms).replace(/\n/g, "<br>")}</div>` : ""}
  ${(d.kind === "invoice" || d.kind === "fee") && bank.iban ? `<div><h4>${esc(t("docs.payTo"))}</h4>${esc(bank.bankName ?? "")}<br><span dir="ltr" style="font-family:ui-monospace,monospace">${esc(bank.iban)}</span></div>` : ""}
</div>`
    : ""
}
<div class="sign"><div>${esc(t(sales ? "docs.signedFor" : "docs.approvedBy"))}</div><div>${esc(t(sales ? "docs.receivedBy" : "docs.receivedBy"))}</div></div>`;
  return shell(doc, d.number, body, mode);
}

/** Every invoice and payment for one customer (or bill and payment for a supplier), with a running balance. */
export async function renderStatement(doc: ExportDoc, orgId: string, partyId: string, mode: "print" | "pdf") {
  const party = await db.party.findFirstOrThrow({ where: { id: partyId, orgId } });
  const customer = party.isCustomer;
  const kind = customer ? { in: ["invoice", "fee"] } : "bill";
  const [docs, payments] = await Promise.all([
    db.document.findMany({ where: { orgId, partyId, kind, status: { notIn: ["draft"] } }, orderBy: { date: "asc" } }),
    db.payment.findMany({ where: { orgId, partyId, direction: customer ? "in" : "out", voidedAt: null }, orderBy: { date: "asc" } }),
  ]);
  const { t, fmt, locale } = doc;
  const events = [
    ...docs.flatMap((d) =>
      d.status === "void"
        ? []
        : [{ date: d.date, ref: d.number, what: t(customer ? "docs.invoice" : "docs.bill"), due: d.dueDate, amount: d.total }],
    ),
    ...payments.map((p) => ({ date: p.date, ref: p.number, what: t("payments.payment"), due: null as Date | null, amount: -p.amount })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  let balance = 0;
  const rows = events
    .map((e) => {
      balance += e.amount;
      return `<tr><td class="nowrap">${esc(fmt.date(e.date))}</td><td class="nowrap" style="font-family:ui-monospace,monospace">${esc(e.ref)}</td><td>${esc(e.what)}${e.due ? ` · ${esc(t("docs.colDue"))} ${esc(fmt.date(e.due))}` : ""}</td>
      <td class="num">${e.amount > 0 ? esc(fmt.money(e.amount, { decimals: true })) : ""}</td><td class="num">${e.amount < 0 ? esc(fmt.money(-e.amount, { decimals: true })) : ""}</td><td class="num">${esc(fmt.money(balance, { decimals: true }))}</td></tr>`;
    })
    .join("");
  const body = `
<div class="doc-head">${orgBlock(doc)}<div class="doc-title"><h1>${esc(t("parties.statement"))}</h1><div class="no">${esc(fmt.date(doc.generatedAt, "long"))}</div></div></div>
<div class="parties"><div><div class="label">${esc(t(customer ? "docs.colCustomer" : "docs.colSupplier"))}</div><div class="who">${esc(pick(locale, party.name, party.nameAr))}</div>
${party.address ? `<div class="muted">${esc(locale === "ar" ? (party.addressAr ?? party.address) : party.address)}</div>` : ""}</div>
<table class="facts">${`<tr><td>${esc(t("docs.balanceDue"))}</td><td><b>${esc(fmt.money(balance, { decimals: true }))}</b></td></tr>`}</table></div>
<table><thead><tr><th>${esc(t("docs.colDate"))}</th><th>${esc(t("docs.colNumber"))}</th><th>${esc(t("docs.colDescription"))}</th><th class="num">${esc(t(customer ? "parties.charged" : "parties.billed"))}</th><th class="num">${esc(t("payments.payment"))}</th><th class="num">${esc(t("parties.runningBalance"))}</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#999">${esc(t("parties.noDocuments"))}</td></tr>`}</tbody>
<tfoot><tr><td colspan="5">${esc(t("docs.balanceDue"))}</td><td class="num">${esc(fmt.money(balance, { decimals: true }))}</td></tr></tfoot></table>`;
  return shell(doc, `${t("parties.statement")} · ${party.name}`, body, mode);
}
