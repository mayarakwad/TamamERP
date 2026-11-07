// Fills the database with three living demo workspaces.
// Run: npm run db:seed   (wipes existing data first)

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedWorkspaces, DEMO_PASSWORD } from "../src/lib/demo/workspaces";

const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./data/tamam.db" }),
});

async function wipe() {
  // Children first. Organization deletes cascade to most tables.
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.comment.deleteMany();
  await db.attachment.deleteMany();
  await db.billPayment.deleteMany();
  await db.claim.deleteMany();
  await db.organization.deleteMany();
  await db.session.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.user.deleteMany();
}

async function main() {
  const started = Date.now();
  await wipe();
  const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const { home, biz, school } = await seedWorkspaces(db, passwordHash);
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
