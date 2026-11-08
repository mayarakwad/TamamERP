import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick } from "../i18n";
import { addMonths, createFormatter, monthKey, monthStart } from "../format";
import type { Dataset, DatasetResult } from "./types";

/** Flow usage for a month, per person: chats, steps, tokens and cost (US dollars, as the provider bills). */
export const flowUsageDataset: Dataset<Workspace> = {
  id: "flow-usage",
  permissions: ["flow.configure"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const m = params.get("month");
    const month = m && /^\d{4}-\d{2}$/.test(m) ? m : monthKey(new Date(), ws.org.timezone);
    const rows = await db.flowUsage.findMany({ where: { orgId: ws.org.id, createdAt: { gte: monthStart(month), lt: monthStart(addMonths(month, 1)) } } });
    const per = new Map<string, { steps: number; chats: Set<string>; tin: number; tout: number; micros: number }>();
    for (const r of rows) {
      const p = per.get(r.userId) ?? { steps: 0, chats: new Set<string>(), tin: 0, tout: 0, micros: 0 };
      p.steps++;
      if (r.conversationId) p.chats.add(r.conversationId);
      p.tin += r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens;
      p.tout += r.outputTokens;
      p.micros += r.costMicros ?? 0;
      per.set(r.userId, p);
    }
    const users = await db.user.findMany({ where: { id: { in: [...per.keys()] } }, select: { id: true, name: true, nameAr: true } });
    const fmt = createFormatter({ locale, digits: "latn", currency: ws.org.currency, timeZone: ws.org.timezone });
    return {
      title: t("flowSettings.usageDataset"),
      subtitle: fmt.monthName(monthStart(month)),
      columns: [
        { key: "person", label: "flowSettings.colPerson", type: "text", width: 28 },
        { key: "chats", label: "flowSettings.colChats", type: "number", total: true, width: 10 },
        { key: "steps", label: "flowSettings.colCalls", type: "number", total: true, width: 10 },
        { key: "tokensIn", label: "flowSettings.colTokensIn", type: "number", total: true, width: 14 },
        { key: "tokensOut", label: "flowSettings.colTokensOut", type: "number", total: true, width: 14 },
        { key: "cost", label: "flowSettings.colCost", header: locale === "ar" ? "التكلفة (دولار)" : "Cost (USD)", type: "number", total: true, width: 12 },
      ],
      rows: [...per.entries()]
        .sort((a, b) => b[1].micros - a[1].micros)
        .map(([id, p]) => {
          const u = users.find((x) => x.id === id);
          return { id, cells: { person: u ? pick(locale, u.name, u.nameAr) : "—", chats: p.chats.size, steps: p.steps, tokensIn: p.tin, tokensOut: p.tout, cost: Math.round(p.micros / 100) / 10_000 } };
        }),
    };
  },
};
