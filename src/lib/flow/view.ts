import "server-only";
import { db } from "../db";
import { loadHistory } from "./run";
import type { ChatItem, ProposalView } from "./types";

export function proposalView(p: { id: string; kind: string; status: string; payload: unknown; result: unknown }): ProposalView {
  const view = (p.payload as { view: Omit<ProposalView, "id" | "kind" | "status"> }).view;
  const result = p.result as { message?: string; href?: string; error?: string } | null;
  return {
    id: p.id,
    kind: p.kind,
    ...view,
    status: p.status as ProposalView["status"],
    result: result ? { message: result.message ?? result.error ?? "", href: result.href } : null,
  };
}

/** A stored conversation as chat rows (what the panel shows when it's reopened). */
export async function conversationItems(conversationId: string): Promise<ChatItem[]> {
  const [history, proposals] = await Promise.all([loadHistory(conversationId), db.flowProposal.findMany({ where: { conversationId } })]);
  const byCall = new Map(proposals.map((p) => [p.toolCallId, proposalView(p)]));
  const items: ChatItem[] = [];
  history.forEach((m, i) => {
    if (m.role === "user") items.push({ kind: "user", id: `u${i}`, text: m.text });
    else if (m.role === "assistant") {
      if (m.text.trim()) items.push({ kind: "text", id: `a${i}`, text: m.text });
    } else {
      for (const r of m.results) {
        items.push({ kind: "tool", id: r.id, name: r.name, status: "done", ui: r.ui, isError: r.isError });
        const p = byCall.get(r.id);
        if (p) items.push({ kind: "proposal", id: p.id, proposal: p });
      }
    }
  });
  return items;
}
