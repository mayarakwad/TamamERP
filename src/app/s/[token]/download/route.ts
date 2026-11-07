import { lookupShare, docFromSnapshot } from "@/lib/share";
import { contentDisposition } from "@/lib/export/doc";
import { renderXlsx } from "@/lib/export/xlsx";
import { renderCsv } from "@/lib/export/csv";

/** Downloads from a share link, only when the person who shared it allowed them. */
export async function GET(request: Request, { params }: RouteContext<"/s/[token]/download">) {
  const { token } = await params;
  const found = await lookupShare(token);
  if (found.state !== "ok" || !found.link.allowDownload) return new Response("Not found", { status: 404 });
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const doc = docFromSnapshot(found.snapshot);
  const body = format === "csv" ? renderCsv(doc) : await renderXlsx(doc);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(doc, format),
      "Cache-Control": "no-store",
    },
  });
}
