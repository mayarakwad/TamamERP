import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";

export interface AuditEntry {
  orgId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  summaryAr?: string;
  meta?: Prisma.InputJsonValue;
  /** Security-relevant: sign-ins, role changes, exports, backups, keys, payroll. */
  sensitive?: boolean;
}

export async function audit(entry: AuditEntry) {
  let ip: string | null = null;
  try {
    ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // Called outside a request (seed scripts).
  }
  await db.auditLog.create({
    data: {
      orgId: entry.orgId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      summaryAr: entry.summaryAr,
      meta: entry.meta,
      sensitive: entry.sensitive ?? false,
      ip,
    },
  });
}
