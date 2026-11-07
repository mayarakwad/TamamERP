import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { getWorkspaceForApi } from "@/lib/auth/api";
import { BackupError, createBackup, importWorkspace, pruneOrphanFiles, readBackup } from "@/lib/backup";
import { STORAGE_DIR } from "@/lib/storage";
import { audit } from "@/lib/audit";

const MAX = 300 * 1024 * 1024;

/** Restore a .tamam backup as a new workspace, or replace this one (owners only). */
export async function POST(request: Request, { params }: RouteContext<"/api/w/[slug]/restore">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws || !ws.can("workspace.backup")) return Response.json({ error: "empty.notAllowed" }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX) return Response.json({ error: "data.badFile" }, { status: 400 });
  const mode = form.get("mode") === "replace" ? "replace" : "new";
  if (mode === "replace" && String(form.get("confirm") ?? "").trim() !== ws.org.name) return Response.json({ error: "errors.required" }, { status: 400 });

  let backup;
  try {
    backup = readBackup(Buffer.from(await file.arrayBuffer()), String(form.get("password") ?? "") || undefined);
  } catch (e) {
    const code = e instanceof BackupError ? e.code : "badFile";
    return Response.json({ error: code === "badFile" ? "data.badFile" : "data.wrongPassword", needsPassword: code === "needsPassword" }, { status: 400 });
  }

  if (mode === "replace") {
    // Safety net: keep a server-side copy of what's being replaced.
    const { buffer } = await createBackup(ws.org.id, { includeFiles: true });
    const dir = path.join(/*turbopackIgnore: true*/ STORAGE_DIR, "safety-backups");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(/*turbopackIgnore: true*/ dir, `${slug}-${Date.now()}.tamam`), buffer);
  }

  const result = await importWorkspace(backup.data, backup.files, {
    mode,
    targetOrgId: mode === "replace" ? ws.org.id : undefined,
    name: mode === "new" ? `${backup.manifest.org.name} (${new Date().toISOString().slice(0, 10)})` : ws.org.name,
    members: "all",
    actingUserId: ws.viewer.id,
  });
  if (mode === "replace") await pruneOrphanFiles(ws.org.id);

  await audit({
    orgId: result.orgId,
    userId: ws.viewer.id,
    action: "workspace.restored",
    entityType: "organization",
    entityId: result.orgId,
    summary: `restored a backup of "${backup.manifest.org.name}" from ${backup.manifest.createdAt.slice(0, 10)} ${mode === "replace" ? "over this workspace" : "as a new workspace"}`,
    summaryAr: `استعادة نسخة احتياطية من «${backup.manifest.org.nameAr ?? backup.manifest.org.name}»`,
    sensitive: true,
  });
  return Response.json({ slug: result.slug, name: result.name });
}
