import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// One client per server process (survives hot reloads in development).
const globalForDb = globalThis as unknown as { db?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./data/tamam.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const db = globalForDb.db ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
