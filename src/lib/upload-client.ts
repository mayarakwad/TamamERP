"use client";

// Browser-side helpers for photos: phones produce 4-12 MB images, so we
// downscale to ~2000px JPEG before uploading (fast on mobile data, and it
// turns iPhone HEIC into something every server can read).

export async function downscaleImage(file: File, max = 2000): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 600_000) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadAttachments(slug: string, entityType: string, entityId: string, kind: string, files: File[]) {
  const body = new FormData();
  body.append("entityType", entityType);
  body.append("entityId", entityId);
  body.append("kind", kind);
  for (const f of files) body.append("file", await downscaleImage(f));
  const res = await fetch(`/api/w/${slug}/attachments`, { method: "POST", body });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "upload");
  return (await res.json()) as { files: { id: string; url: string; thumb: string | null }[] };
}
