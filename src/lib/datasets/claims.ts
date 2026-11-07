import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick } from "../i18n";
import { createFormatter, monthStart, addMonths } from "../format";
import type { Prisma } from "@/generated/prisma/client";
import type { Dataset, DatasetResult } from "./types";

export const CLAIM_STATUSES = ["submitted", "approved", "reimbursed", "rejected"] as const;

/** Build the Prisma filter from URL params, applying who-may-see-what. */
export function claimsWhere(ws: Workspace, params: URLSearchParams): Prisma.ClaimWhereInput {
  const where: Prisma.ClaimWhereInput = { orgId: ws.org.id, deletedAt: null };
  if (!ws.can("claims.viewAll")) where.submittedById = ws.viewer.id;
  else if (params.get("person")) where.submittedById = params.get("person")!;
  const status = params.get("status");
  if (status && (CLAIM_STATUSES as readonly string[]).includes(status)) where.status = status;
  const month = params.get("month");
  if (month && /^\d{4}-\d{2}$/.test(month)) where.spentOn = { gte: monthStart(month), lt: monthStart(addMonths(month, 1)) };
  const category = params.get("category");
  if (category) where.category = { key: category };
  const q = params.get("q")?.trim();
  if (q) where.OR = [{ merchant: { contains: q } }, { number: { contains: q.toUpperCase() } }, { note: { contains: q } }];
  return where;
}

export const claimsDataset: Dataset<Workspace> = {
  id: "claims",
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const claims = await db.claim.findMany({
      where: claimsWhere(ws, params),
      orderBy: [{ spentOn: "desc" }, { number: "desc" }],
      include: {
        category: { select: { key: true, name: true, nameAr: true, icon: true, color: true } },
        submittedBy: { select: { id: true, name: true, nameAr: true, avatarColor: true } },
      },
      take: 5000,
    });
    const receiptCounts = await db.attachment.groupBy({
      by: ["entityId"],
      where: { orgId: ws.org.id, entityType: "claim", entityId: { in: claims.map((c) => c.id) } },
      _count: { _all: true },
    });
    const receipts = new Map(receiptCounts.map((r) => [r.entityId, r._count._all]));

    const fmt = createFormatter({ locale, digits: "latn" });
    const parts: string[] = [];
    const month = params.get("month");
    if (month && /^\d{4}-\d{2}$/.test(month)) parts.push(fmt.monthName(monthStart(month)));
    const status = params.get("status");
    if (status) parts.push(t(`status.${status}` as never));

    return {
      title: t("claims.title"),
      subtitle: parts.join(" · ") || undefined,
      columns: [
        { key: "number", label: "claims.colNumber", type: "text", width: 17 },
        { key: "date", label: "claims.colDate", type: "date", width: 13 },
        { key: "merchant", label: "claims.colMerchant", type: "text", width: 30 },
        { key: "category", label: "claims.colCategory", type: "text", width: 20, hideOnMobile: true },
        ...(ws.can("claims.viewAll") ? [{ key: "by", label: "claims.colBy" as const, type: "text" as const, width: 22, hideOnMobile: true }] : []),
        { key: "paidWith", label: "claims.colPaidWith", type: "enum", options: { cash: "claims.cash", card: "claims.card", transfer: "claims.transfer" }, width: 12, hideOnMobile: true },
        { key: "amount", label: "claims.colAmount", type: "money", total: true, width: 15 },
        {
          key: "status",
          label: "claims.colStatus",
          type: "enum",
          options: { submitted: "status.submitted", approved: "status.approved", reimbursed: "status.reimbursed", rejected: "status.rejected" },
          width: 16,
        },
      ],
      rows: claims.map((c) => ({
        id: c.id,
        href: `claims/${c.id}`,
        cells: {
          number: c.number,
          date: c.spentOn.toISOString(),
          merchant: c.merchant,
          category: pick(locale, c.category.name, c.category.nameAr),
          by: pick(locale, c.submittedBy.name, c.submittedBy.nameAr),
          paidWith: c.paidWith,
          amount: c.amount,
          status: c.status,
        },
        meta: {
          icon: c.category.icon,
          avatarColor: c.submittedBy.avatarColor,
          byName: c.submittedBy.name,
          receipts: receipts.get(c.id) ?? 0,
          note: c.note,
        },
      })),
    };
  },
};
