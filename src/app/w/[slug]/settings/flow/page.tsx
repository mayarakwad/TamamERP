import type { Metadata } from "next";
import { connection } from "next/server";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { addMonths, monthKey, monthStart } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { getFlowConfig, monthSpend } from "@/lib/flow/settings";
import { scriptedEnabled } from "@/lib/flow/providers/scripted";
import { ROLES_BY_TYPE } from "@/lib/rbac";
import { FlowSettingsView } from "./flow-settings-view";
import { flowUsageDataset } from "@/lib/datasets/flow";
import { createT } from "@/lib/i18n";

export const metadata: Metadata = { title: "Flow" };

export default async function FlowSettingsPage({ params }: PageProps<"/w/[slug]/settings/flow">) {
  const { slug } = await params;
  const ws = await requirePermission(slug, "flow.configure");
  await connection();
  const now = new Date();
  const tz = ws.org.timezone;
  const cfg = await getFlowConfig(ws.org.id);
  const month = monthKey(now, tz);
  const from = monthStart(month);
  const to = monthStart(addMonths(month, 1));
  const sixAgo = monthStart(addMonths(month, -5));

  const [rows, older, setBy, spend] = await Promise.all([
    db.flowUsage.findMany({ where: { orgId: ws.org.id, createdAt: { gte: from, lt: to } }, select: { userId: true, conversationId: true, model: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, costMicros: true, createdAt: true } }),
    db.flowUsage.findMany({ where: { orgId: ws.org.id, createdAt: { gte: sixAgo, lt: to } }, select: { costMicros: true, createdAt: true } }),
    cfg.keySetById ? db.user.findUnique({ where: { id: cfg.keySetById }, select: { name: true, nameAr: true } }) : null,
    monthSpend(ws.org.id, tz, now),
  ]);

  // Per day this month
  const dayOf = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: tz }).format(d));
  const daily = Array.from({ length: dayOf(new Date(to.getTime() - 1)) }, (_, i) => ({ day: i + 1, micros: 0 }));
  for (const r of rows) {
    const d = daily[dayOf(r.createdAt) - 1];
    if (d) d.micros += r.costMicros ?? 0;
  }

  // Per person and per model
  const people = new Map<string, { steps: number; chats: Set<string>; tokensIn: number; tokensOut: number; micros: number }>();
  const models = new Map<string, { steps: number; micros: number }>();
  for (const r of rows) {
    const p = people.get(r.userId) ?? { steps: 0, chats: new Set<string>(), tokensIn: 0, tokensOut: 0, micros: 0 };
    p.steps++;
    if (r.conversationId) p.chats.add(r.conversationId);
    p.tokensIn += r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    p.tokensOut += r.outputTokens;
    p.micros += r.costMicros ?? 0;
    people.set(r.userId, p);
    const m = models.get(r.model) ?? { steps: 0, micros: 0 };
    m.steps++;
    m.micros += r.costMicros ?? 0;
    models.set(r.model, m);
  }
  const users = await db.user.findMany({ where: { id: { in: [...people.keys()] } }, select: { id: true, name: true, nameAr: true, avatarColor: true } });
  const locale = ws.viewer.prefs.locale;

  // Last six months
  const months = Array.from({ length: 6 }, (_, i) => ({ month: addMonths(month, i - 5), micros: 0 }));
  for (const r of older) {
    const m = months.find((x) => x.month === monthKey(r.createdAt, tz));
    if (m) m.micros += r.costMicros ?? 0;
  }

  const usageTable = await flowUsageDataset.load(ws, new URLSearchParams({ month }), { locale, t: createT(locale) });
  return (
    <FlowSettingsView
      usageTable={usageTable}
      usageQuery={`month=${month}`}
      canShare={ws.can("exports.share")}
      slug={slug}
      scripted={scriptedEnabled()}
      roles={ROLES_BY_TYPE[ws.orgType]}
      secretOk={(process.env.APP_SECRET ?? "").length >= 32}
      config={{
        enabled: cfg.enabled,
        provider: cfg.provider,
        model: cfg.model,
        baseUrl: cfg.baseUrl ?? "",
        hasKey: cfg.hasKey,
        keyHint: cfg.keyHint,
        keySetAt: cfg.keySetAt?.toISOString() ?? null,
        keySetBy: setBy ? pick(locale, setBy.name, setBy.nameAr) : null,
        effort: cfg.effort,
        priceIn: cfg.priceIn == null ? null : cfg.priceIn / 1_000_000,
        priceOut: cfg.priceOut == null ? null : cfg.priceOut / 1_000_000,
        monthlyLimit: cfg.monthlyLimit == null ? null : cfg.monthlyLimit / 100,
        roles: cfg.roles,
        name: cfg.name,
        avatar: cfg.avatar,
        tone: cfg.tone,
      }}
      usage={{
        month,
        nextMonth: to.toISOString(),
        micros: spend.micros,
        unpriced: spend.unpriced,
        daily,
        people: [...people.entries()]
          .map(([id, p]) => {
            const u = users.find((x) => x.id === id);
            return { id, name: u ? pick(locale, u.name, u.nameAr) : "—", color: u?.avatarColor ?? null, steps: p.steps, chats: p.chats.size, tokensIn: p.tokensIn, tokensOut: p.tokensOut, micros: p.micros };
          })
          .sort((a, b) => b.micros - a.micros || b.steps - a.steps),
        models: [...models.entries()].map(([model, m]) => ({ model, ...m })).sort((a, b) => b.micros - a.micros),
        months,
      }}
    />
  );
}
