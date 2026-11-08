"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { encryptKey, FlowSecretMissing, keyHint } from "@/lib/flow/crypto";
import { FLOW_AVATARS, FLOW_EFFORTS, FLOW_PROVIDERS, FLOW_TONES, PROVIDERS, type FlowProvider } from "@/lib/flow/models";
import { adapterFor } from "@/lib/flow/providers";
import { scriptedEnabled } from "@/lib/flow/providers/scripted";
import { loadApiKey } from "@/lib/flow/settings";
import { FlowProviderError } from "@/lib/flow/types";
import { ROLES_BY_TYPE, type Role } from "@/lib/rbac";

// Settings → Flow. Only people with flow.configure (owners and admins) get
// here. The key goes in and never comes back out: the page only ever sees a
// short hint like "sk-ant-…a1B2".

type Result = { ok: true } | { ok: false; error: string };

async function admin(slug: string) {
  const ws = await getWorkspace(slug);
  if (!ws.can("flow.configure")) throw new Error("not allowed");
  return ws;
}

const providers = scriptedEnabled() ? ([...FLOW_PROVIDERS, "scripted"] as const) : FLOW_PROVIDERS;

const patchInput = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(providers as unknown as [string, ...string[]]).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  baseUrl: z.union([z.url().max(300), z.literal("")]).optional(),
  effort: z.enum(FLOW_EFFORTS).optional(),
  /** dollars per million tokens; null = built-in prices */
  priceIn: z.number().min(0).max(1000).nullable().optional(),
  priceOut: z.number().min(0).max(1000).nullable().optional(),
  /** US dollars; null = no limit */
  monthlyLimit: z.number().min(0).max(100_000).nullable().optional(),
  roles: z.array(z.string()).optional(),
  name: z.string().trim().min(1).max(24).optional(),
  avatar: z.enum(FLOW_AVATARS).optional(),
  tone: z.enum(FLOW_TONES).optional(),
});

export async function saveFlowSettings(slug: string, raw: z.input<typeof patchInput>): Promise<Result> {
  const ws = await admin(slug);
  const parsed = patchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const p = parsed.data;
  const allowedRoles = ROLES_BY_TYPE[ws.orgType];
  const roles = p.roles ? ["owner", ...p.roles.filter((r): r is Role => (allowedRoles as string[]).includes(r) && r !== "owner")] : undefined;
  const data = {
    ...(p.enabled !== undefined ? { enabled: p.enabled } : {}),
    ...(p.provider ? { provider: p.provider } : {}),
    ...(p.model ? { model: p.model } : {}),
    ...(p.baseUrl !== undefined ? { baseUrl: p.baseUrl || null } : {}),
    ...(p.effort ? { effort: p.effort } : {}),
    ...(p.priceIn !== undefined ? { priceIn: p.priceIn == null ? null : Math.round(p.priceIn * 1_000_000) } : {}),
    ...(p.priceOut !== undefined ? { priceOut: p.priceOut == null ? null : Math.round(p.priceOut * 1_000_000) } : {}),
    ...(p.monthlyLimit !== undefined ? { monthlyLimit: p.monthlyLimit == null ? null : Math.round(p.monthlyLimit * 100), warned80: null, warned100: null } : {}),
    ...(roles ? { roles: [...new Set(roles)].join(",") } : {}),
    ...(p.name ? { name: p.name } : {}),
    ...(p.avatar ? { avatar: p.avatar } : {}),
    ...(p.tone ? { tone: p.tone } : {}),
  };
  // Switching provider: a key for one provider won't work with another.
  const before = await db.flowSettings.findUnique({ where: { orgId: ws.org.id } });
  const switching = p.provider && before && before.provider !== p.provider;
  await db.flowSettings.upsert({
    where: { orgId: ws.org.id },
    create: { orgId: ws.org.id, ...data },
    update: { ...data, ...(switching ? { keyCipher: null, keyHint: null, keySetAt: null, keySetById: null } : {}) },
  });
  const what = Object.keys(p).join(", ");
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "flow.settings", entityType: "flow", entityId: ws.org.id, summary: `changed Flow settings (${what})`, summaryAr: `غيّر إعدادات فلو (${what})`, sensitive: p.monthlyLimit !== undefined || !!p.provider });
  refresh();
  return { ok: true };
}

export async function saveFlowKey(slug: string, key: string): Promise<Result> {
  const ws = await admin(slug);
  const k = key.trim();
  if (k.length < 8 || k.length > 400 || /\s/.test(k)) return { ok: false, error: "errors.generic" };
  let cipher: string;
  try {
    cipher = encryptKey(ws.org.id, k);
  } catch (e) {
    if (e instanceof FlowSecretMissing) return { ok: false, error: "flowSettings.keyNeedSecret" };
    throw e;
  }
  const data = { keyCipher: cipher, keyHint: keyHint(k), keySetAt: new Date(), keySetById: ws.viewer.id };
  await db.flowSettings.upsert({ where: { orgId: ws.org.id }, create: { orgId: ws.org.id, ...data }, update: data });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "flow.key", entityType: "flow", entityId: ws.org.id, summary: "saved a new Flow AI key", summaryAr: "حفظ مفتاح ذكاء اصطناعي جديداً لفلو", sensitive: true });
  refresh();
  return { ok: true };
}

export async function removeFlowKey(slug: string): Promise<Result> {
  const ws = await admin(slug);
  await db.flowSettings.updateMany({ where: { orgId: ws.org.id }, data: { keyCipher: null, keyHint: null, keySetAt: null, keySetById: null } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "flow.key", entityType: "flow", entityId: ws.org.id, summary: "removed the Flow AI key", summaryAr: "أزال مفتاح فلو", sensitive: true });
  refresh();
  return { ok: true };
}

export type TestResult = { ok: true; models: string[]; hasModel: boolean } | { ok: false; code: "auth" | "network" | "model" | "nokey" | "other"; message?: string };

/** Check a key without spending anything: list the provider's models. Uses the typed key, or the saved one. */
export async function testFlowConnection(slug: string, input: { provider: string; baseUrl?: string; key?: string; model?: string }): Promise<TestResult> {
  const ws = await admin(slug);
  const provider = input.provider as FlowProvider;
  const adapter = adapterFor(provider);
  if (!adapter) return { ok: false, code: "other", message: "Unknown provider" };
  const saved = await db.flowSettings.findUnique({ where: { orgId: ws.org.id }, select: { provider: true } });
  const key = input.key?.trim() || (saved?.provider === provider ? await loadApiKey(ws.org.id) : null);
  if (!key) return { ok: false, code: "nokey" };
  const baseUrl = provider === "compatible" ? input.baseUrl : provider === "google" ? PROVIDERS.google.baseUrl : undefined;
  try {
    const models = await adapter.listModels(key, baseUrl);
    return { ok: true, models: models.slice(0, 300), hasModel: !input.model || models.includes(input.model) };
  } catch (e) {
    const code = e instanceof FlowProviderError ? e.code : "unknown";
    return { ok: false, code: code === "auth" ? "auth" : code === "network" ? "network" : code === "model" ? "model" : "other", message: e instanceof Error ? e.message.slice(0, 200) : undefined };
  }
}
