import { getWorkspaceForApi } from "@/lib/auth/api";
import { canEditEntity } from "@/lib/access";
import { saveAttachment, UploadError, attachmentUrl } from "@/lib/attachments";
import { audit } from "@/lib/audit";

/** Upload one or more files (receipts, photos) to a record. */
export async function POST(request: Request, { params }: RouteContext<"/api/w/[slug]/attachments">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  const kind = ["receipt", "photo", "file"].includes(String(form.get("kind"))) ? String(form.get("kind")) : "file";
  if (!(await canEditEntity(ws, entityType, entityId))) return Response.json({ error: "forbidden" }, { status: 403 });

  const files = form.getAll("file").filter((f): f is File => f instanceof File).slice(0, 10);
  const saved = [];
  try {
    for (const file of files) {
      const a = await saveAttachment({ orgId: ws.org.id, entityType, entityId, kind, file, uploadedById: ws.viewer.id });
      saved.push({ id: a.id, url: attachmentUrl(slug, a.id), thumb: a.thumbPath ? attachmentUrl(slug, a.id, "thumb") : null, mimeType: a.mimeType, fileName: a.fileName });
    }
  } catch (e) {
    return Response.json({ error: e instanceof UploadError ? e.message : "failed" }, { status: 400 });
  }
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "attachment.added", entityType, entityId, summary: `attached ${saved.length} file(s)`, summaryAr: `إرفاق ${saved.length} ملف` });
  return Response.json({ files: saved });
}
