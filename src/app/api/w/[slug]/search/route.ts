import { getWorkspaceForApi } from "@/lib/auth/api";
import { searchRecords } from "@/lib/search/query";

/** Records matching ?q= (Arabic-aware), filtered by what the person may see. */
export async function GET(request: Request, { params }: RouteContext<"/api/w/[slug]/search">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return Response.json({ hits: [] }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ hits: await searchRecords(ws, slug, q.slice(0, 100)) });
}
