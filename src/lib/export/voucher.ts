import "server-only";
import { readFile } from "node:fs/promises";
import { db } from "../db";
import { storagePath } from "../storage";
import { pick } from "../i18n";
import { documentShell, esc, letterhead } from "./html";
import type { ExportDoc } from "./doc";

/** A printable expense-claim voucher with receipts and signature lines. */
export async function renderClaimVoucher(doc: ExportDoc, orgId: string, claimId: string, mode: "print" | "pdf") {
  const c = await db.claim.findFirstOrThrow({
    where: { id: claimId, orgId, deletedAt: null },
    include: { category: true, submittedBy: true, decidedBy: true },
  });
  const files = await db.attachment.findMany({ where: { orgId, entityType: "claim", entityId: claimId, mimeType: { startsWith: "image/" } }, orderBy: { createdAt: "asc" } });
  const images = (
    await Promise.all(files.map(async (f) => readFile(storagePath(...f.path.split("/"))).then((b) => `data:${f.mimeType};base64,${b.toString("base64")}`).catch(() => null)))
  ).filter(Boolean) as string[];

  const { t, fmt, locale } = doc;
  const row = (k: string, v: string) => `<tr><th style="background:#f3efec;color:#1f1a17;width:32%">${esc(k)}</th><td>${esc(v)}</td></tr>`;
  const decided = c.decidedBy && c.status !== "submitted" ? `${t(`status.${c.status === "reimbursed" ? "approved" : c.status}` as never)} · ${pick(locale, c.decidedBy.name, c.decidedBy.nameAr)} · ${fmt.dateTime(c.decidedAt!)}` : t(`status.${c.status}` as never);
  const body = `${letterhead({ ...doc, title: `${t("claims.colNumber")} ${c.number}`, subtitle: t(`status.${c.status}` as never) })}
<table style="margin-bottom:14px">
${row(t("claims.colMerchant"), c.merchant)}
${row(t("claims.colAmount"), fmt.money(c.amount, { decimals: true }))}
${row(t("claims.colCategory"), pick(locale, c.category.name, c.category.nameAr))}
${row(t("claims.colDate"), `${fmt.date(c.spentOn, "long")} · ${fmt.hijri(c.spentOn)}`)}
${row(t("claims.colPaidWith"), t(`claims.${c.paidWith}` as never))}
${row(t("claims.colBy"), pick(locale, c.submittedBy.name, c.submittedBy.nameAr))}
${c.note ? row(t("claims.colNote"), c.note) : ""}
${row(t("claims.colStatus"), decided)}
${c.decisionNote && c.decisionNote !== "self" ? row(t("claims.declineReason"), c.decisionNote) : ""}
</table>
<div style="display:flex;gap:28px;margin:26px 0 18px">
  ${[t("claims.colBy"), t("status.approved")].map((l) => `<div style="flex:1;border-top:1px solid #999;padding-top:4px;font-size:8pt;color:#666">${esc(l)}</div>`).join("")}
</div>
${images.length ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;break-before:auto">${images.map((src) => `<img src="${src}" style="width:100%;max-height:120mm;object-fit:contain;border:1px solid #eee;border-radius:6px;break-inside:avoid">`).join("")}</div>` : ""}`;
  return documentShell({ ...doc, title: c.number }, body, { mode, landscape: false, footer: `${doc.appName} · ${doc.brand.name}` });
}
