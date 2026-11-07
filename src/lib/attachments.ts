import "server-only";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { db } from "./db";
import { STORAGE_DIR } from "./storage";

const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE = /^image\/(jpeg|png|webp|avif|gif|heic|heif)$/;

export class UploadError extends Error {}

/**
 * Store an uploaded file for a record. Images are auto-rotated, resized to
 * 2000px WebP with a 480px thumbnail; PDFs are kept as-is.
 */
export async function saveAttachment(opts: { orgId: string; entityType: string; entityId: string; kind: string; file: File; uploadedById: string }) {
  const { file } = opts;
  if (file.size === 0 || file.size > MAX_BYTES) throw new UploadError("size");
  const isImage = IMAGE.test(file.type);
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) throw new UploadError("type");

  const id = randomBytes(12).toString("hex");
  const rel = path.join("orgs", opts.orgId, "attachments");
  const dir = path.join(/*turbopackIgnore: true*/ STORAGE_DIR, rel);
  await mkdir(dir, { recursive: true });
  const input = Buffer.from(await file.arrayBuffer());

  let fileRel: string;
  let thumbRel: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let size = input.length;
  let mimeType = file.type;

  if (isImage) {
    let img: Buffer;
    let meta: OutputInfo;
    try {
      ({ data: img, info: meta } = await sharp(input).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true }));
    } catch {
      throw new UploadError("type");
    }
    const thumb = await sharp(img).resize({ width: 480, height: 480, fit: "inside" }).webp({ quality: 72 }).toBuffer();
    fileRel = path.join(rel, `${id}.webp`);
    thumbRel = path.join(rel, `${id}-thumb.webp`);
    await writeFile(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, fileRel), img);
    await writeFile(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, thumbRel), thumb);
    width = meta.width;
    height = meta.height;
    size = img.length;
    mimeType = "image/webp";
  } else {
    fileRel = path.join(rel, `${id}.pdf`);
    await writeFile(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, fileRel), input);
  }

  return db.attachment.create({
    data: {
      orgId: opts.orgId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      kind: opts.kind,
      fileName: file.name.slice(0, 200) || `${opts.kind}.${isPdf ? "pdf" : "webp"}`,
      mimeType,
      size,
      path: fileRel,
      thumbPath: thumbRel,
      width,
      height,
      uploadedById: opts.uploadedById,
    },
  });
}

export async function deleteAttachmentFiles(a: { path: string; thumbPath: string | null }) {
  for (const p of [a.path, a.thumbPath]) if (p) await rm(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, p), { force: true });
}

export function attachmentUrl(slug: string, id: string, size: "thumb" | "full" = "full") {
  return `/api/w/${slug}/attachments/${id}${size === "thumb" ? "?size=thumb" : ""}`;
}
