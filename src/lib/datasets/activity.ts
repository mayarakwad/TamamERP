import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick } from "../i18n";
import { addMonths, createFormatter, monthStart } from "../format";
import type { Prisma } from "@/generated/prisma/client";
import type { Dataset, DatasetResult } from "./types";

export const activityDataset: Dataset<Workspace> = {
  id: "activity",
  permissions: ["audit.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const where: Prisma.AuditLogWhereInput = { orgId: ws.org.id };
    if (params.get("type") === "security") where.sensitive = true;
    if (params.get("person")) where.userId = params.get("person")!;
    const month = params.get("month");
    if (month && /^\d{4}-\d{2}$/.test(month)) where.createdAt = { gte: monthStart(month), lt: monthStart(addMonths(month, 1)) };
    const logs = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000 });
    const users = new Map((await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[] } } })).map((u) => [u.id, u]));
    const fmt = createFormatter({ locale, digits: "latn" });
    return {
      title: t("activity.title"),
      subtitle: [month && /^\d{4}-\d{2}$/.test(month) ? fmt.monthName(monthStart(month)) : null, params.get("type") === "security" ? t("activity.security") : null].filter(Boolean).join(" · ") || undefined,
      columns: [
        { key: "when", label: "activity.colWhen", type: "datetime", width: 20 },
        { key: "who", label: "activity.colWho", type: "text", width: 22 },
        { key: "what", label: "activity.colWhat", type: "text", width: 50 },
        { key: "type", label: "activity.colType", type: "enum", options: { security: "activity.sensitive", normal: "activity.normal" }, width: 12, hideOnMobile: true },
        { key: "ip", label: "activity.colIp", type: "text", width: 16, hideOnMobile: true },
      ],
      rows: logs.map((l) => {
        const u = l.userId ? users.get(l.userId) : null;
        return {
          id: l.id,
          href: l.entityType === "claim" && l.entityId ? `claims/${l.entityId}` : undefined,
          cells: { when: l.createdAt.toISOString(), who: u ? pick(locale, u.name, u.nameAr) : "—", what: pick(locale, l.summary ?? l.action, l.summaryAr), type: l.sensitive ? "security" : "normal", ip: l.ip },
          meta: { avatarColor: u?.avatarColor ?? null, name: u?.name ?? "?", action: l.action },
        };
      }),
    };
  },
};
