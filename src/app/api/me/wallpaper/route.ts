import { randomBytes } from "node:crypto";
import { readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/auth/dal";
import { ensureDir } from "@/lib/storage";
import { mergePrefs } from "@/lib/prefs";

const MAX_BYTES = 8 * 1024 * 1024;

/** Upload a personal dashboard wallpaper. Resized to 2560px WebP on the server. */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES || !/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(file.type)) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  let output: Buffer;
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // respect phone camera orientation
      .resize({ width: 2560, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const dir = await ensureDir("users", viewer.id);
  for (const old of await readdir(dir)) {
    if (old.startsWith("wallpaper-")) await unlink(path.join(/*turbopackIgnore: true*/ dir, old)).catch(() => {});
  }
  const name = `wallpaper-${randomBytes(8).toString("hex")}.webp`;
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, name), output);

  const url = `/api/me/wallpaper/${name}`;
  const prefs = mergePrefs(viewer.prefs, { wallpaper: "upload", wallpaperUpload: url });
  await db.user.update({ where: { id: viewer.id }, data: { preferences: prefs } });
  return Response.json({ url });
}
