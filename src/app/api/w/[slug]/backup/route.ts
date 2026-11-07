import { getWorkspaceForApi } from "@/lib/auth/api";
import { createBackup } from "@/lib/backup";
import { audit } from "@/lib/audit";

/** Download a full backup of this workspace (owners only). */
export async function POST(request: Request, { params }: RouteContext<"/api/w/[slug]/backup">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws || !ws.can("workspace.backup")) return new Response("Not found", { status: 404 });
  const form = await request.formData();
  const password = String(form.get("password") ?? "").trim() || undefined;
  const includeFiles = form.get("includeFiles") !== "false";
  const { buffer, manifest } = await createBackup(ws.org.id, { password, includeFiles });
  await audit({
    orgId: ws.org.id,
    userId: ws.viewer.id,
    action: "backup.downloaded",
    summary: `downloaded a backup (${Object.values(manifest.counts).reduce((a, b) => a + b, 0)} records, ${manifest.files} files${password ? ", password-protected" : ", not encrypted"})`,
    summaryAr: "تنزيل نسخة احتياطية",
    sensitive: true,
  });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: ws.org.timezone }).format(new Date());
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${slug}-${day}.tamam"`, "Cache-Control": "no-store" },
  });
}
