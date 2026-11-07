// Returns this server to a fresh, uninstalled state so the setup wizard runs
// again. Deletes ALL data and uploads. For testing and demos only.
//
//   npm run reset:fresh            asks for confirmation
//   npm run reset:fresh -- --yes   no questions (CI)

import "dotenv/config";
import { rmSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { ensureSetupKey } from "../src/lib/system/setup-key";
import { wipeAll } from "../prisma/wipe";

async function main() {
  if (!process.argv.includes("--yes")) {
    if (!process.stdin.isTTY) throw new Error("Refusing to delete everything without --yes");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("\n  This deletes every workspace, user and upload on this server.\n  Type \"reset\" to continue: ");
    rl.close();
    if (answer.trim().toLowerCase() !== "reset") return console.log("  Nothing was changed.\n");
  }
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./data/tamam.db" }) });
  await wipeAll(db);
  const storage = path.resolve(process.env.STORAGE_DIR ?? "./storage");
  for (const sub of ["users", "orgs"]) rmSync(path.join(storage, sub), { recursive: true, force: true });
  const key = await ensureSetupKey(db);
  await db.$disconnect();
  console.log(`\n  Server reset. Open http://localhost:${process.env.PORT ?? "3000"}/setup?key=${key}\n`);
}

main().catch((e) => {
  console.error(`\n  ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
