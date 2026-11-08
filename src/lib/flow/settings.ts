import "server-only";
import { db } from "../db";
import { monthKey, monthStart, addMonths } from "../format";
import type { Role } from "../rbac";
import { decryptKey } from "./crypto";
import { FLOW_AVATARS, FLOW_EFFORTS, FLOW_TONES, type FlowAvatar, type FlowEffort, type FlowProvider, type FlowTone } from "./models";
import { scriptedEnabled } from "./providers/scripted";

export interface FlowConfig {
  enabled: boolean;
  provider: FlowProvider;
  model: string;
  baseUrl: string | null;
  hasKey: boolean;
  keyHint: string | null;
  keySetAt: Date | null;
  keySetById: string | null;
  effort: FlowEffort;
  priceIn: number | null;
  priceOut: number | null;
  monthlyLimit: number | null;
  roles: Role[];
  name: string;
  avatar: FlowAvatar;
  tone: FlowTone;
}

const DEFAULT_ROLES: Role[] = ["owner", "admin", "accountant", "teacher", "employee", "member", "parent"];

export async function getFlowConfig(orgId: string): Promise<FlowConfig> {
  const s = await db.flowSettings.findUnique({ where: { orgId } });
  return {
    enabled: s?.enabled ?? true,
    provider: (s?.provider as FlowProvider) ?? "anthropic",
    model: s?.model ?? "claude-opus-5-5",
    baseUrl: s?.baseUrl ?? null,
    hasKey: !!s?.keyCipher || s?.provider === "scripted",
    keyHint: s?.keyHint ?? null,
    keySetAt: s?.keySetAt ?? null,
    keySetById: s?.keySetById ?? null,
    effort: (FLOW_EFFORTS as readonly string[]).includes(s?.effort ?? "") ? (s!.effort as FlowEffort) : "medium",
    priceIn: s?.priceIn ?? null,
    priceOut: s?.priceOut ?? null,
    monthlyLimit: s?.monthlyLimit ?? null,
    roles: s ? (s.roles.split(",").filter(Boolean) as Role[]) : DEFAULT_ROLES,
    name: s?.name || "Flow",
    avatar: (FLOW_AVATARS as readonly string[]).includes(s?.avatar ?? "") ? (s!.avatar as FlowAvatar) : "orb",
    tone: (FLOW_TONES as readonly string[]).includes(s?.tone ?? "") ? (s!.tone as FlowTone) : "friendly",
  };
}

/** The decrypted key, for the server-side call only. */
export async function loadApiKey(orgId: string): Promise<string | null> {
  const s = await db.flowSettings.findUnique({ where: { orgId }, select: { keyCipher: true, provider: true } });
  if (s?.provider === "scripted" && scriptedEnabled()) return "scripted";
  if (!s?.keyCipher) return null;
  return decryptKey(orgId, s.keyCipher);
}

export type FlowAccess =
  | { ok: true }
  | { ok: false; reason: "off" | "role" | "nokey" | "limit" | "badkey" };

/** Can this person use Flow right now? (Spending is checked separately, per step.) */
export function flowAccess(cfg: FlowConfig, role: Role): FlowAccess {
  if (!cfg.enabled) return { ok: false, reason: "off" };
  if (!cfg.roles.includes(role)) return { ok: false, reason: "role" };
  if (!cfg.hasKey) return { ok: false, reason: "nokey" };
  if (cfg.provider === "scripted" && !scriptedEnabled()) return { ok: false, reason: "nokey" };
  return { ok: true };
}

/** Spending so far this month (Doha time), in micro-dollars. */
export async function monthSpend(orgId: string, timeZone: string, now = new Date()): Promise<{ month: string; micros: number; unpriced: number }> {
  const month = monthKey(now, timeZone);
  const rows = await db.flowUsage.findMany({ where: { orgId, createdAt: { gte: monthStart(month), lt: monthStart(addMonths(month, 1)) } }, select: { costMicros: true } });
  return {
    month,
    micros: rows.reduce((s, r) => s + (r.costMicros ?? 0), 0),
    unpriced: rows.filter((r) => r.costMicros == null).length,
  };
}

export function limitMicros(cfg: FlowConfig): number | null {
  return cfg.monthlyLimit == null ? null : cfg.monthlyLimit * 10_000;
}
