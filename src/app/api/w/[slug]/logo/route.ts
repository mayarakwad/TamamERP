import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getWorkspaceForApi } from "@/lib/auth/api";
import { STORAGE_DIR, storagePath } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** The organization's logo, for members of that workspace. */
export async function GET(_request: Request, { params }: RouteContext<"/api/w/[slug]/logo">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return new Response("Unauthorized", { status: 401 });
  const logoPath = ws.org.logoPath;
  if (!logoPath || !/^orgs\/[a-z0-9]+\/logo\.png$/.test(logoPath)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(storagePath(...logoPath.split("/")));
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

/** Upload a new logo (SVGs are turned into a safe PNG). */
export async function POST(request: Request, { params }: RouteContext<"/api/w/[slug]/logo">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws || !ws.can("workspace.manage")) return Response.json({ error: "forbidden" }, { status: 403 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024 || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return Response.json({ error: "invalid" }, { status: 400 });
  let png: Buffer;
  try {
    png = await sharp(Buffer.from(await file.arrayBuffer()), { density: 300 }).resize({ width: 512, height: 512, fit: "inside" }).png().toBuffer();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const rel = `orgs/${ws.org.id}/logo.png`;
  await mkdir(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, "orgs", ws.org.id), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, rel), png);
  await db.organization.update({ where: { id: ws.org.id }, data: { logoPath: rel } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "workspace.logo", summary: "changed the logo", summaryAr: "تغيير الشعار", sensitive: true });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/w/[slug]/logo">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws || !ws.can("workspace.manage")) return Response.json({ error: "forbidden" }, { status: 403 });
  if (ws.org.logoPath) await rm(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, ws.org.logoPath), { force: true });
  await db.organization.update({ where: { id: ws.org.id }, data: { logoPath: null } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "workspace.logo", summary: "removed the logo", summaryAr: "إزالة الشعار", sensitive: true });
  return Response.json({ ok: true });
}
