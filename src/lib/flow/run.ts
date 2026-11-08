import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { createFormatter } from "../format";
import { createT } from "../i18n";
import { getSchool, type School } from "../school/scope";
import { notify, membersWithRoles } from "../notify";
import { costMicros, pricesFor } from "./models";
import { adapterFor } from "./providers";
import { buildContextBlock, buildSystemPrompt } from "./prompt";
import { flowAccess, getFlowConfig, limitMicros, loadApiKey, monthSpend, type FlowConfig } from "./settings";
import { getTool, toolsFor } from "./tools";
import { toSpec, type FlowCtx } from "./tools/define";
import { FlowProviderError, type FlowEvent, type PageContext, type StoredMessage, type ToolResult } from "./types";

// One turn of a conversation: store the person's message, then let the model
// read with tools (and prepare proposals) for up to MAX_STEPS steps, streaming
// everything to the panel as it happens.

const MAX_STEPS = 8;
const MAX_TURNS = 40;
const RATE = { window: 10 * 60_000, max: 40 };
const recent = new Map<string, number[]>();

function rateLimited(key: string, now: number) {
  const list = (recent.get(key) ?? []).filter((t) => now - t < RATE.window);
  if (list.length >= RATE.max) return true;
  list.push(now);
  recent.set(key, list);
  return false;
}

export async function loadHistory(conversationId: string): Promise<StoredMessage[]> {
  const rows = await db.flowMessage.findMany({ where: { conversationId }, orderBy: { seq: "asc" } });
  const out: StoredMessage[] = [];
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].content as unknown as StoredMessage;
    out.push(m);
    // A step interrupted between a tool call and its result: answer the calls so the history stays valid.
    if (m.role === "assistant" && m.toolCalls.length && (rows[i + 1]?.content as unknown as StoredMessage | undefined)?.role !== "tool") {
      out.push({ role: "tool", results: m.toolCalls.map((c) => ({ id: c.id, name: c.name, content: "Interrupted before this ran.", isError: true })) });
    }
  }
  return out;
}

async function append(conversationId: string, message: StoredMessage) {
  const last = await db.flowMessage.findFirst({ where: { conversationId }, orderBy: { seq: "desc" }, select: { seq: true } });
  await db.flowMessage.create({ data: { conversationId, seq: (last?.seq ?? -1) + 1, role: message.role, content: JSON.parse(JSON.stringify(message)) } });
}

/** Proposals decided since the person's last message, told to the model in the next one. */
async function updatesSince(conversationId: string, since: Date | null): Promise<string[]> {
  if (!since) return [];
  const decided = await db.flowProposal.findMany({ where: { conversationId, decidedAt: { gt: since } }, orderBy: { decidedAt: "asc" } });
  return decided.map((p) => {
    const view = (p.payload as { view?: { title?: string } }).view;
    const title = view?.title ?? p.kind;
    const result = p.result as { message?: string; error?: string } | null;
    if (p.status === "done") return `The person confirmed "${title}". Result: ${result?.message ?? "done"}.`;
    if (p.status === "failed") return `The person pressed confirm on "${title}" but it failed: ${result?.error ?? "unknown error"}.`;
    return `The person dismissed "${title}"; it was not done.`;
  });
}

async function warnSpending(ws: Workspace, cfg: FlowConfig, timeZone: string) {
  const limit = limitMicros(cfg);
  if (limit == null || limit <= 0) return;
  const spent = await monthSpend(ws.org.id, timeZone);
  const s = await db.flowSettings.findUnique({ where: { orgId: ws.org.id }, select: { warned80: true, warned100: true } });
  if (!s) return;
  const admins = await membersWithRoles(db, ws.org.id, ["owner", "admin"]);
  if (spent.micros >= limit && s.warned100 !== spent.month) {
    await db.flowSettings.update({ where: { orgId: ws.org.id }, data: { warned100: spent.month, warned80: spent.month } });
    await notify(db, { orgId: ws.org.id, userIds: admins, kind: "flow.limit", title: `${cfg.name} reached this month's spending limit`, titleAr: `بلغ ${cfg.name} حد الإنفاق لهذا الشهر`, body: "Flow is paused until next month or until you raise the limit.", bodyAr: "توقف فلو حتى الشهر القادم أو حتى ترفع الحد.", href: "settings/flow" });
  } else if (spent.micros >= limit * 0.8 && s.warned80 !== spent.month) {
    await db.flowSettings.update({ where: { orgId: ws.org.id }, data: { warned80: spent.month } });
    await notify(db, { orgId: ws.org.id, userIds: admins, kind: "flow.limit", title: `${cfg.name} has used 80% of this month's spending limit`, titleAr: `استهلك ${cfg.name} ‏80% من حد الإنفاق لهذا الشهر`, href: "settings/flow" });
  }
}

export interface TurnInput {
  ws: Workspace;
  slug: string;
  conversationId?: string | null;
  message: string;
  page?: PageContext | null;
  signal?: AbortSignal;
  emit: (e: FlowEvent) => void;
}

export async function runTurn({ ws, slug, conversationId, message, page, signal, emit }: TurnInput): Promise<void> {
  const cfg = await getFlowConfig(ws.org.id);
  const access = flowAccess(cfg, ws.role);
  if (!access.ok) return emit({ type: "error", code: access.reason, message: "" });
  const apiKey = await loadApiKey(ws.org.id);
  if (!apiKey) return emit({ type: "error", code: "badkey", message: "" });
  const adapter = adapterFor(cfg.provider);
  if (!adapter) return emit({ type: "error", code: "nokey", message: "" });
  const limit = limitMicros(cfg);
  const tz = ws.org.timezone;
  if (limit != null && (await monthSpend(ws.org.id, tz)).micros >= limit) return emit({ type: "error", code: "limit", message: "" });
  if (rateLimited(`${ws.org.id}:${ws.viewer.id}`, Date.now())) return emit({ type: "error", code: "busy", message: "" });

  const now = new Date();
  let schoolCache: School | null | undefined;
  const school = async () => {
    if (schoolCache === undefined) schoolCache = ws.orgType === "school" ? await getSchool(slug) : null;
    return schoolCache;
  };
  const prefs = ws.viewer.prefs;
  const persona = { name: prefs.flowName || cfg.name, tone: prefs.flowTone ?? cfg.tone };

  // The conversation: an existing one of this person's, or a new one with a frozen system prompt and tool list.
  let convo = conversationId ? await db.flowConversation.findFirst({ where: { id: conversationId, orgId: ws.org.id, userId: ws.viewer.id } }) : null;
  if (conversationId && !convo) return emit({ type: "error", code: "notfound", message: "" });
  if (convo && convo.turns >= MAX_TURNS) return emit({ type: "error", code: "long", message: "" });
  if (!convo) {
    convo = await db.flowConversation.create({
      data: {
        orgId: ws.org.id,
        userId: ws.viewer.id,
        title: message.trim().replace(/\s+/g, " ").slice(0, 60),
        system: await buildSystemPrompt(ws, slug, await school(), persona, now),
        tools: JSON.stringify(toolsFor(ws).map((t) => t.name)),
        provider: cfg.provider,
        model: cfg.model,
      },
    });
  }
  const conversation = convo;
  emit({ type: "conversation", id: conversation.id, title: conversation.title });

  // Tools frozen at the start, minus any the person has since lost access to.
  const frozen = (JSON.parse(conversation.tools) as string[]).map((n) => getTool(n)).filter((t): t is NonNullable<typeof t> => !!t && t.available(ws));
  const specs = frozen.map((t) => toSpec(t, ws));

  const lastUser = await db.flowMessage.findFirst({ where: { conversationId: conversation.id, role: "user" }, orderBy: { seq: "desc" }, select: { createdAt: true } });
  const updates = await updatesSince(conversation.id, lastUser?.createdAt ?? null);
  await append(conversation.id, { role: "user", text: message.trim(), context: buildContextBlock({ now, timeZone: tz, page, updates }) });
  await db.flowConversation.update({ where: { id: conversation.id }, data: { turns: { increment: 1 } } });

  const t = createT(ws.viewer.prefs.locale);
  const ctx: FlowCtx = {
    ws,
    slug,
    locale: ws.viewer.prefs.locale,
    t,
    fmt: createFormatter({ locale: ws.viewer.prefs.locale, digits: ws.viewer.prefs.digits, currency: ws.org.currency, timeZone: tz }),
    now,
    conversationId: conversation.id,
    school,
    page,
  };

  let total = 0;
  let priced = true;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (signal?.aborted) break;
      if (step > 0) {
        if (limit != null && (await monthSpend(ws.org.id, tz)).micros >= limit) {
          emit({ type: "error", code: "limit", message: "" });
          break;
        }
        emit({ type: "step" });
      }
      const history = await loadHistory(conversation.id);
      const result = await adapter.step({ system: conversation.system, tools: specs, history, model: cfg.model, effort: cfg.effort, apiKey, baseUrl: cfg.baseUrl, signal }, (delta) => emit({ type: "text", delta }));
      const cost = costMicros(pricesFor(cfg.provider, result.servedModel, cfg), result.usage);
      if (cost == null) priced = false;
      total += cost ?? 0;
      await db.flowUsage.create({
        data: { orgId: ws.org.id, userId: ws.viewer.id, conversationId: conversation.id, provider: cfg.provider, model: result.servedModel, inputTokens: result.usage.input, outputTokens: result.usage.output, cacheReadTokens: result.usage.cacheRead, cacheWriteTokens: result.usage.cacheWrite, costMicros: cost },
      });
      await append(conversation.id, { role: "assistant", provider: cfg.provider, model: result.servedModel, text: result.text, toolCalls: result.toolCalls, native: result.native, stop: result.stop });

      if (result.stop === "refusal") {
        emit({ type: "error", code: "refusal", message: "" });
        break;
      }
      if (!result.toolCalls.length || result.stop === "max_tokens") {
        if (result.stop === "max_tokens") emit({ type: "error", code: "truncated", message: "" });
        break;
      }

      // Run this step's tools together; results go back in one message, in the same order.
      const results: ToolResult[] = await Promise.all(
        result.toolCalls.map(async (call): Promise<ToolResult> => {
          const tool = frozen.find((x) => x.name === call.name);
          emit({ type: "tool", id: call.id, name: call.name, status: "start" });
          if (!tool) {
            const r = { id: call.id, name: call.name, content: JSON.stringify({ error: `Unknown tool ${call.name}` }), isError: true, ui: { label: call.name } };
            emit({ type: "tool", id: call.id, name: call.name, status: "done", ui: r.ui, isError: true });
            return r;
          }
          const parsed = tool.input.safeParse(call.input ?? {});
          if (!parsed.success) {
            const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
            const r = { id: call.id, name: call.name, content: JSON.stringify({ error: `Invalid input. ${msg}` }), isError: true, ui: { label: t("flow.toolInvalid") } };
            emit({ type: "tool", id: call.id, name: call.name, status: "done", ui: r.ui, isError: true });
            return r;
          }
          try {
            const out = await tool.run(ctx, parsed.data, call.id);
            if (out.proposal) emit({ type: "proposal", proposal: out.proposal });
            emit({ type: "tool", id: call.id, name: call.name, status: "done", ui: out.ui, isError: out.isError });
            return { id: call.id, name: call.name, content: typeof out.content === "string" ? out.content : JSON.stringify(out.content), isError: out.isError, ui: out.ui };
          } catch (e) {
            console.error(`[flow] tool ${call.name} failed`, e);
            const r = { id: call.id, name: call.name, content: JSON.stringify({ error: "The tool failed unexpectedly." }), isError: true, ui: { label: t("flow.toolCrashed") } };
            emit({ type: "tool", id: call.id, name: call.name, status: "done", ui: r.ui, isError: true });
            return r;
          }
        }),
      );
      await append(conversation.id, { role: "tool", results });
    }
  } catch (e) {
    if (!signal?.aborted) {
      const err = e instanceof FlowProviderError ? e : new FlowProviderError("unknown", e instanceof Error ? e.message : String(e));
      if (!(e instanceof FlowProviderError)) console.error("[flow] turn failed", e);
      emit({ type: "error", code: err.code, message: err.message.slice(0, 300) });
    }
  } finally {
    await db.flowConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date(), provider: cfg.provider, model: cfg.model } }).catch(() => {});
    await warnSpending(ws, cfg, tz).catch(() => {});
  }
  emit({ type: "done", costMicros: priced ? total : null });
}
