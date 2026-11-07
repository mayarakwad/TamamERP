import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/auth/dal";
import { storagePath } from "@/lib/storage";

/** The organization's logo, for members of that workspace. */
export async function GET(_request: Request, { params }: RouteContext<"/api/w/[slug]/logo">) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const { slug } = await params;
  const membership = await db.membership.findFirst({
    where: { userId: viewer.id, status: "active", org: { slug } },
    select: { org: { select: { logoPath: true } } },
  });
  const logoPath = membership?.org.logoPath;
  if (!logoPath || !/^orgs\/[a-z0-9]+\/logo\.png$/.test(logoPath)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(storagePath(...logoPath.split("/")));
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
