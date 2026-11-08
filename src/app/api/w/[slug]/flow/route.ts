import { z } from "zod";
import { getViewer, getWorkspace } from "@/lib/auth/dal";
import { getWorkspaceForApi } from "@/lib/auth/api";
import { runTurn } from "@/lib/flow/run";
import type { FlowEvent } from "@/lib/flow/types";

// Flow's chat endpoint. Streams one JSON event per line (NDJSON) while the
// assistant reads, writes and prepares proposals. The AI key is used here,
// on the server, and never reaches the browser.

export const maxDuration = 300;

const field = z.object({
  id: z.string().max(120),
  label: z.string().max(200),
  type: z.string().max(30),
  value: z.string().max(2000),
  options: z.array(z.object({ value: z.string().max(200), label: z.string().max(200) })).max(200).optional(),
});

const body = z.object({
  conversationId: z.string().max(40).nullable().optional(),
  message: z.string().trim().min(1).max(4000),
  page: z
    .object({
      path: z.string().max(500),
      title: z.string().max(300),
      text: z.string().max(12000).optional(),
      form: z.object({ title: z.string().max(200), fields: z.array(field).max(60) }).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export async function POST(request: Request, { params }: RouteContext<"/api/w/[slug]/flow">) {
  const { slug } = await params;
  if (!(await getViewer()) || !(await getWorkspaceForApi(slug))) return new Response("Unauthorized", { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const ws = await getWorkspace(slug);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: FlowEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await runTurn({ ws, slug, conversationId: parsed.data.conversationId, message: parsed.data.message, page: parsed.data.page ?? null, signal: request.signal, emit });
      } catch (e) {
        console.error("[flow] request failed", e);
        emit({ type: "error", code: "unknown", message: "" });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
