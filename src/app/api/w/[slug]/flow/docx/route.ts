import { z } from "zod";
import { getWorkspaceForApi } from "@/lib/auth/api";
import { markdownToDocx } from "@/lib/flow/docx";

// One of Flow's answers (a drafted letter, notice or report) as a Word file.
const body = z.object({ markdown: z.string().min(1).max(60_000), title: z.string().max(200).default("") });

export async function POST(request: Request, { params }: RouteContext<"/api/w/[slug]/flow/docx">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return new Response("Unauthorized", { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const buffer = await markdownToDocx(parsed.data.markdown, parsed.data.title);
  const name = `${(parsed.data.title || "Flow").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 60).trim() || "Flow"}.docx`;
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}` },
  });
}
