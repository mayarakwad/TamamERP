import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { getWorkspaceForApi } from "@/lib/auth/api";
import { canEditEntity, canViewEntity } from "@/lib/access";
import { deleteAttachmentFiles } from "@/lib/attachments";
import { storagePath } from "@/lib/storage";
import { audit } from "@/lib/audit";

async function load(slug: string, id: string) {
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return { ws: null, a: null };
  const a = await db.attachment.findFirst({ where: { id, orgId: ws.org.id } });
  return { ws, a };
}

export async function GET(request: Request, { params }: RouteContext<"/api/w/[slug]/attachments/[id]">) {
  const { slug, id } = await params;
  const { ws, a } = await load(slug, id);
  if (!ws) return new Response("Unauthorized", { status: 401 });
  if (!a || !(await canViewEntity(ws, a.entityType, a.entityId))) return new Response("Not found", { status: 404 });
  const thumb = new URL(request.url).searchParams.get("size") === "thumb" && a.thumbPath;
  try {
    const data = await readFile(storagePath(...(thumb ? a.thumbPath! : a.path).split("/")));
    const download = new URL(request.url).searchParams.has("download");
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": a.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/w/[slug]/attachments/[id]">) {
  const { slug, id } = await params;
  const { ws, a } = await load(slug, id);
  if (!ws) return new Response("Unauthorized", { status: 401 });
  if (!a || !(await canEditEntity(ws, a.entityType, a.entityId))) return new Response("Not found", { status: 404 });
  await db.attachment.delete({ where: { id: a.id } });
  await deleteAttachmentFiles(a);
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "attachment.removed", entityType: a.entityType, entityId: a.entityId, summary: `removed ${a.fileName}`, summaryAr: `حذف ${a.fileName}` });
  return Response.json({ ok: true });
}
