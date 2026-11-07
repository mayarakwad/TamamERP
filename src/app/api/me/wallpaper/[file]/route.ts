import { readFile } from "node:fs/promises";
import { getViewer } from "@/lib/auth/dal";
import { storagePath } from "@/lib/storage";

/** Serve the signed-in person's own wallpaper. Files live in their private folder. */
export async function GET(_request: Request, { params }: RouteContext<"/api/me/wallpaper/[file]">) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const { file } = await params;
  if (!/^wallpaper-[a-f0-9]{16}\.webp$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(storagePath("users", viewer.id, file));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
