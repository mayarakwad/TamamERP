import { getWorkspaceForApi } from "@/lib/auth/api";
import { getDataset } from "@/lib/datasets";
import { getBranding } from "@/lib/branding";
import { getSystem } from "@/lib/system";
import { createT, pick } from "@/lib/i18n";
import { canViewEntity } from "@/lib/access";
import { audit } from "@/lib/audit";
import { contentDisposition, makeDoc, type ExportDoc } from "@/lib/export/doc";
import { renderCsv } from "@/lib/export/csv";
import { renderXlsx } from "@/lib/export/xlsx";
import { renderDocx } from "@/lib/export/docx";
import { renderTableHtml } from "@/lib/export/html";
import { htmlToPdf, PdfUnavailable } from "@/lib/export/pdf";
import { renderClaimVoucher } from "@/lib/export/voucher";
import { renderBusinessDocument, renderStatement } from "@/lib/export/document";
import { renderPayslip } from "@/lib/export/payslip";
import { bizSettings } from "@/lib/biz";
import { db } from "@/lib/db";

const TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  print: "text/html; charset=utf-8",
};

/** Payslips: payroll people see all; an employee sees their own. */
async function canViewPayslip(ws: NonNullable<Awaited<ReturnType<typeof getWorkspaceForApi>>>, id: string) {
  const p = await db.payslip.findFirst({ where: { id, orgId: ws.org.id }, select: { employee: { select: { userId: true } }, run: { select: { status: true } } } });
  if (!p) return false;
  if (ws.can("payroll.run") || ws.can("hr.manage")) return true;
  return p.employee.userId === ws.viewer.id && p.run.status !== "draft";
}

/** Download any dataset as Excel, CSV, Word or PDF, or open its print layout. */
export async function GET(request: Request, { params }: RouteContext<"/api/w/[slug]/export/[dataset]">) {
  const { slug, dataset } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "xlsx";
  if (!TYPES[format]) return new Response("Unknown format", { status: 400 });
  const query = new URLSearchParams(url.searchParams);
  query.delete("format");

  const locale = ws.viewer.prefs.locale;
  const t = createT(locale);
  const system = await getSystem();
  const appName = system.instanceName === "Tamam" ? t("app.name") : system.instanceName;
  const brandRaw = await getBranding(ws.org);
  const brand = {
    name: pick(locale, brandRaw.name, brandRaw.nameAr),
    address: locale === "ar" ? (brandRaw.addressAr ?? brandRaw.address) : brandRaw.address,
    phone: brandRaw.phone,
    email: brandRaw.email,
    crNumber: brandRaw.crNumber,
    brandColor: brandRaw.brandColor,
    logoPng: brandRaw.logoPng,
    logo: brandRaw.logo,
  };
  const common = {
    brand,
    locale,
    digits: ws.viewer.prefs.digits,
    currency: ws.org.currency,
    timeZone: ws.org.timezone,
    generatedBy: pick(locale, ws.viewer.name, ws.viewer.nameAr),
    appName,
  } as const;

  let doc: ExportDoc;
  let body: Buffer | string;

  // Single records: claim vouchers, business documents, statements, payslips.
  if (["claim", "document", "statement", "payslip"].includes(dataset)) {
    const id = query.get("id") ?? query.get("party") ?? "";
    const entity = { claim: "claim", document: "document", statement: "party", payslip: "payslip" }[dataset]!;
    const allowed =
      entity === "payslip"
        ? await canViewPayslip(ws, id)
        : await canViewEntity(ws, entity, id);
    if (!allowed) return new Response("Not found", { status: 404 });
    doc = makeDoc({ ...common, title: "", columns: [], rows: [] });
    const mode = format === "pdf" ? "pdf" : "print";
    let html: string;
    let name = dataset;
    if (dataset === "claim") html = await renderClaimVoucher(doc, ws.org.id, id, mode);
    else if (dataset === "document") {
      html = await renderBusinessDocument(doc, ws.org.id, id, mode, bizSettings(ws.org).sales ?? {});
      name = (await db.document.findUnique({ where: { id }, select: { number: true } }))?.number ?? "document";
    } else if (dataset === "statement") html = await renderStatement(doc, ws.org.id, id, mode);
    else html = await renderPayslip(doc, ws.org.id, id, mode);
    await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: format === "pdf" ? "export.downloaded" : "export.printed", entityType: entity, entityId: id, summary: `${format === "pdf" ? "downloaded PDF of" : "printed"} ${dataset} ${name}`, summaryAr: `${format === "pdf" ? "تنزيل PDF" : "طباعة"} ${name}`, sensitive: dataset === "payslip" });
    if (format !== "pdf") return new Response(html, { headers: { "Content-Type": TYPES.print, "Cache-Control": "no-store" } });
    try {
      body = await htmlToPdf(html, { landscape: false, footerLeft: `${appName} · ${brand.name}`, dir: doc.dir, locale });
    } catch (e) {
      if (e instanceof PdfUnavailable) return new Response("PDF export needs Chromium on the server (npx playwright install chromium). Use Print instead.", { status: 503 });
      throw e;
    }
    return new Response(new Uint8Array(body), { headers: { "Content-Type": TYPES.pdf, "Content-Disposition": `attachment; filename="${name.replace(/[^\w.-]+/g, "_")}.pdf"`, "Cache-Control": "no-store" } });
  }

  const ds = getDataset(dataset);
  if (!ds || (ds.permissions && !ds.permissions.some((p) => ws.can(p)))) return new Response("Not found", { status: 404 });
  const result = await ds.load(ws, query, { locale, t });
  doc = makeDoc({ ...common, title: result.title, subtitle: result.subtitle, columns: result.columns, rows: result.rows });

  try {
    switch (format) {
      case "xlsx":
        body = await renderXlsx(doc);
        break;
      case "csv":
        body = renderCsv(doc);
        break;
      case "docx":
        body = await renderDocx(doc);
        break;
      case "pdf":
        body = await htmlToPdf(renderTableHtml(doc, "pdf"), { landscape: doc.columns.length > 6, footerLeft: `${appName} · ${brand.name}`, dir: doc.dir, locale });
        break;
      default:
        body = renderTableHtml(doc, "print");
    }
  } catch (e) {
    if (e instanceof PdfUnavailable) return new Response("PDF export needs Chromium on the server (npx playwright install chromium). Use Print instead.", { status: 503 });
    throw e;
  }

  await audit({
    orgId: ws.org.id,
    userId: ws.viewer.id,
    action: format === "print" ? "export.printed" : "export.downloaded",
    entityType: "dataset",
    entityId: dataset,
    summary: `${format === "print" ? "printed" : `exported ${format.toUpperCase()}:`} ${result.title}${result.subtitle ? ` (${result.subtitle})` : ""}, ${result.rows.length} rows`,
    summaryAr: `${format === "print" ? "طباعة" : `تصدير ${format.toUpperCase()}:`} ${result.title}`,
    sensitive: true,
  });

  if (format === "print") return new Response(String(body), { headers: { "Content-Type": TYPES.print, "Cache-Control": "no-store" } });
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: { "Content-Type": TYPES[format], "Content-Disposition": contentDisposition(doc, format), "Cache-Control": "no-store" },
  });
}
