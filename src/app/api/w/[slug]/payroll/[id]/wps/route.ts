import { getWorkspaceForApi } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { bizSettings } from "@/lib/biz";
import { sifForRun } from "@/lib/payroll/ops";

/** Download the WPS salary information file (CSV) for an approved or paid run. */
export async function GET(_req: Request, { params }: RouteContext<"/api/w/[slug]/payroll/[id]/wps">) {
  const { slug, id } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws || !(ws.can("payroll.run") || ws.can("hr.manage"))) return new Response("Not found", { status: 404 });
  const run = await db.payrollRun.findFirst({ where: { id, orgId: ws.org.id } });
  if (!run || run.status === "draft") return new Response("Approve the payroll first", { status: 409 });
  const p = bizSettings(ws.org).payroll;
  if (!p?.employerEid || !p.bankShortName || !p.iban) return new Response("Add the WPS details (establishment ID, bank, IBAN) on the payroll page first", { status: 409 });
  const sif = await sifForRun(db, ws.org.id, id, { employerEid: p.employerEid, payerEid: p.payerEid ?? null, bankShortName: p.bankShortName, iban: p.iban });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "payroll.wpsDownloaded", entityType: "payroll", entityId: id, summary: `downloaded WPS file ${sif.fileName} (${sif.run.month}, ${(sif.total / 100).toFixed(2)} QAR)`, summaryAr: `تنزيل ملف حماية الأجور ${sif.fileName}`, sensitive: true });
  return new Response(sif.content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${sif.fileName}"`, "Cache-Control": "no-store" } });
}
