// Fills the database with three living demo workspaces.
// Run: npm run db:seed   (wipes existing data first)

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedWorkspaces, DEMO_PASSWORD } from "../src/lib/demo/workspaces";
import { wipeAll } from "./wipe";

const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./data/tamam.db" }),
});

async function main() {
  const started = Date.now();
  await wipeAll(db);
  const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  // One transaction: far fewer disk syncs, and a failed seed leaves nothing half-done.
  const { home, biz, school } = await db.$transaction((tx) => seedWorkspaces(tx, passwordHash), { timeout: 600_000, maxWait: 20_000 });
  // The demo counts as an installed server (open sign-up, demo accounts shown).
  await db.systemSetting.create({ data: { id: 1, installedAt: new Date(), demoData: true, allowSignup: true, version: "demo" } });
  const claims = await db.claim.count();
  console.log(`Seeded: ${home.name}, ${biz.name}, ${school.name}`);
  console.log(`        ${claims} claims, ${await db.recurringBill.count()} bills, ${await db.possession.count()} possessions`);
  console.log(`Demo password for every account: ${DEMO_PASSWORD}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
