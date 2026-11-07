import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Next document number in a series, e.g. CLM-2026-00216. Call inside a transaction. */
export async function nextNumber(db: Db, orgId: string, key: string, date = new Date()): Promise<string> {
  const year = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Qatar" }).format(date));
  const row = await db.namingSeries.upsert({
    where: { orgId_key_year: { orgId, key, year } },
    create: { orgId, key, year, current: 1 },
    update: { current: { increment: 1 } },
  });
  return `${key}-${year}-${String(row.current).padStart(5, "0")}`;
}
