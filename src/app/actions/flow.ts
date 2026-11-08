"use server";

import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { createT, type MessageKey } from "@/lib/i18n";
import { executeProposal } from "@/lib/flow/execute";
import { conversationItems, proposalView } from "@/lib/flow/view";
import { savePrefs } from "./prefs";
import { FLOW_AVATARS, FLOW_TONES, type FlowAvatar, type FlowTone } from "@/lib/flow/models";
import type { ChatItem, ConversationSummary, ProposalView } from "@/lib/flow/types";

// Flow's panel: confirming proposals, chat history and personal settings.
// Conversations are private: every query is limited to the person's own.

async function own(slug: string) {
  const ws = await getWorkspace(slug);
  return { ws, where: { orgId: ws.org.id, userId: ws.viewer.id } };
}

/** Run a proposal the person confirmed, through the app's own action. */
export async function confirmProposal(slug: string, id: string): Promise<{ ok: true; proposal: ProposalView; celebrate?: boolean } | { ok: false; error: string }> {
  const { ws, where } = await own(slug);
  const t = createT(ws.viewer.prefs.locale);
  // Claim it atomically so a double click can't run it twice.
  const claimed = await db.flowProposal.updateMany({ where: { ...where, id, status: "pending" }, data: { status: "running" } });
  if (!claimed.count) return { ok: false, error: t("flow.proposalGone") };
  const p = await db.flowProposal.findUniqueOrThrow({ where: { id } });
  const data = (p.payload as { data: Record<string, unknown> }).data;
  let res: Awaited<ReturnType<typeof executeProposal>>;
  try {
    res = await executeProposal(slug, p.kind, data);
  } catch (e) {
    console.error("[flow] proposal failed", e);
    res = { ok: false, error: "errors.generic" };
  }
  const title = (p.payload as { view?: { title?: string } }).view?.title ?? p.kind;
  if (res.ok) {
    const updated = await db.flowProposal.update({ where: { id }, data: { status: "done", decidedAt: new Date(), result: { message: ws.viewer.prefs.locale === "ar" ? res.messageAr : res.message, href: res.href ? `/w/${slug}/${res.href.replace(/^\/+/, "")}` : undefined } } });
    await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "flow.confirmed", entityType: "flow", entityId: id, summary: `confirmed a Flow suggestion: ${title}`, summaryAr: `أكّد اقتراحاً من فلو: ${title}` });
    return { ok: true, proposal: proposalView(updated), celebrate: res.celebrate };
  }
  const message = res.error.includes(".") ? t(res.error as MessageKey) : res.error;
  const updated = await db.flowProposal.update({ where: { id }, data: { status: "failed", decidedAt: new Date(), result: { error: message } } });
  return { ok: true, proposal: proposalView(updated) };
}

export async function dismissProposal(slug: string, id: string): Promise<{ ok: boolean; proposal?: ProposalView }> {
  const { where } = await own(slug);
  const done = await db.flowProposal.updateMany({ where: { ...where, id, status: "pending" }, data: { status: "dismissed", decidedAt: new Date() } });
  if (!done.count) return { ok: false };
  return { ok: true, proposal: proposalView(await db.flowProposal.findUniqueOrThrow({ where: { id } })) };
}

export async function listConversations(slug: string): Promise<ConversationSummary[]> {
  const { where } = await own(slug);
  const rows = await db.flowConversation.findMany({ where, orderBy: { updatedAt: "desc" }, take: 40, select: { id: true, title: true, updatedAt: true } });
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
}

export async function openConversation(slug: string, id: string): Promise<{ ok: true; items: ChatItem[]; title: string } | { ok: false }> {
  const { where } = await own(slug);
  const c = await db.flowConversation.findFirst({ where: { ...where, id } });
  if (!c) return { ok: false };
  return { ok: true, items: await conversationItems(c.id), title: c.title };
}

export async function deleteConversation(slug: string, id: string): Promise<{ ok: boolean }> {
  const { where } = await own(slug);
  const r = await db.flowConversation.deleteMany({ where: { ...where, id } });
  return { ok: r.count > 0 };
}

/** The person's own name, look and tone for Flow (null = the workspace default). */
export async function savePersonalFlow(input: { name: string | null; avatar: FlowAvatar | null; tone: FlowTone | null }) {
  const name = input.name?.trim().slice(0, 24) || null;
  const avatar = input.avatar && (FLOW_AVATARS as readonly string[]).includes(input.avatar) ? input.avatar : null;
  const tone = input.tone && (FLOW_TONES as readonly string[]).includes(input.tone) ? input.tone : null;
  await savePrefs({ flowName: name, flowAvatar: avatar, flowTone: tone });
  return { ok: true };
}
