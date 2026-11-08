import "server-only";
import { db } from "../db";
import { pick } from "../i18n";
import { amountInWords } from "../words";
import { monthStart } from "../format";
import { documentShell, esc } from "./html";
import type { ExportDoc } from "./doc";

/** A printable payslip in the reader's language: earnings, deductions, net and the amount in words. */
export async function renderPayslip(doc: ExportDoc, orgId: string, id: string, mode: "print" | "pdf"): Promise<string> {
  const p = await db.payslip.findFirstOrThrow({ where: { id, orgId }, include: { employee: true, run: true } });
  const { t, fmt, locale } = doc;
  const e = p.employee;
  const money = (v: number) => esc(fmt.money(v, { decimals: true }));
  const earnings: [string, number][] = (
    [
      [t("hr.basicSalary"), p.basic],
      [t("hr.housingAllowance"), p.housing],
      [t("hr.transportAllowance"), p.transport],
      [t("hr.foodAllowance"), p.food],
      [t("hr.otherAllowance"), p.other],
      [`${t("payroll.overtime")} (${fmt.number(p.overtimeHours / 100)} h)`, p.overtimePay],
      [t("payroll.bonus"), p.bonus],
    ] as [string, number][]
  ).filter(([, v], i) => i === 0 || v);
  const deductions: [string, number][] = (
    [
      [`${t("payroll.absence")} (${fmt.number(p.absentDays + p.unpaidLeaveDays)} ${t("payroll.daysShort")})`, p.absenceDeduction],
      [t("payroll.advance"), p.advanceDeduction],
      [p.notes ? `${t("payroll.otherDeduction")}: ${p.notes}` : t("payroll.otherDeduction"), p.otherDeduction],
    ] as [string, number][]
  ).filter(([, v]) => v);
  const rows = (list: [string, number][]) => list.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${money(v)}</td></tr>`).join("") || `<tr><td colspan="2" style="color:#999">—</td></tr>`;
  const month = fmt.monthName(monthStart(p.run.month));
  const accent = doc.brand.brandColor;
  const body = `
<style>
.ps-head { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; padding-bottom:12px; border-bottom:2px solid ${accent}; }
.ps-org { display:flex; gap:12px; align-items:center; }
.ps-org img { width:52px; height:52px; object-fit:contain; }
.ps-org .n { font-weight:600; font-size:12pt; }
.ps-org .l { color:#6b625c; font-size:8pt; }
.ps-title { text-align:end; }
.ps-title h1 { margin:0; color:${accent}; font-size:18pt; font-weight:600; }
.ps-who { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; margin:16px 0; font-size:9pt; }
.ps-who div span { color:#888; display:block; font-size:7.5pt; }
.ps-cols { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
.ps-cols table td { border-bottom:1px solid #ece5de; background:none !important; }
.ps-cols th { text-align:start; }
.ps-total td { font-weight:600; border-top:2px solid ${accent}; border-bottom:0; }
.ps-net { margin-top:18px; padding:14px 16px; border-radius:10px; background:#f6f2ee; display:flex; justify-content:space-between; align-items:center; break-inside:avoid; }
.ps-net .v { font-size:18pt; font-weight:600; }
.ps-words { color:#555; font-size:8.5pt; margin-top:6px; }
.ps-sign { display:flex; gap:40px; margin-top:44px; }
.ps-sign div { flex:1; border-top:1px solid #999; padding-top:4px; font-size:8pt; color:#666; }
</style>
<div class="ps-head">
  <div class="ps-org">${doc.brand.logo ? `<img src="${doc.brand.logo}" alt="">` : ""}<div><div class="n">${esc(doc.brand.name)}</div>${doc.brand.address ? `<div class="l">${esc(doc.brand.address)}</div>` : ""}</div></div>
  <div class="ps-title"><h1>${esc(t("payroll.payslip"))}</h1><div>${esc(month)}</div></div>
</div>
<div class="ps-who">
  <div><span>${esc(t("hr.colName"))}</span>${esc(pick(locale, e.name, e.nameAr))}</div>
  <div><span>${esc(t("hr.colNumber"))}</span>${esc(e.number)}</div>
  <div><span>${esc(t("hr.colTitle"))}</span>${esc(pick(locale, e.jobTitle ?? "", e.jobTitleAr))}</div>
  <div><span>${esc(t("hr.qid"))}</span><span dir="ltr" style="display:inline;color:inherit;font-size:inherit">${esc(e.qid ?? e.visaNumber ?? "—")}</span></div>
  <div><span>${esc(t("payroll.daysPaid"))}</span>${esc(fmt.number(p.workingDays))} / 30</div>
  <div><span>${esc(t("hr.payMethod"))}</span>${e.payMethod === "bank" && e.iban ? `${esc(e.bankShortName ?? "")} <span dir="ltr" style="display:inline;color:inherit;font-size:inherit;font-family:ui-monospace,monospace">•••• ${esc(e.iban.slice(-4))}</span>` : esc(t("hr.payCash"))}</div>
</div>
<div class="ps-cols">
  <table><thead><tr><th>${esc(t("payroll.earnings"))}</th><th class="num">${esc(t("docs.colAmount"))}</th></tr></thead><tbody>${rows(earnings)}</tbody>
  <tfoot><tr class="ps-total"><td>${esc(t("payroll.gross"))}</td><td class="num">${money(p.gross)}</td></tr></tfoot></table>
  <table><thead><tr><th>${esc(t("payroll.deductions"))}</th><th class="num">${esc(t("docs.colAmount"))}</th></tr></thead><tbody>${rows(deductions)}</tbody>
  <tfoot><tr class="ps-total"><td>${esc(t("payroll.totalDeductions"))}</td><td class="num">${money(p.deductions)}</td></tr></tfoot></table>
</div>
<div class="ps-net"><span>${esc(t("payroll.netPay"))}</span><span class="v">${money(p.net)}</span></div>
<p class="ps-words">${esc(amountInWords(p.net, locale))}</p>
<div class="ps-sign"><div>${esc(t("docs.approvedBy"))}</div><div>${esc(t("payroll.employeeSignature"))}</div></div>`;
  return documentShell({ ...doc, title: `${t("payroll.payslip")} ${e.number} ${p.run.month}` }, body, { mode, landscape: false, footer: `${doc.appName} · ${doc.brand.name}` });
}
