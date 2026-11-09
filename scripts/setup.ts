// Tamam installer.
//
//   npm run setup              guided: prepares the server, then asks how to start
//   npm run setup -- --demo    load the demo workspaces, no questions
//   npm run setup -- --wizard  prepare for the browser setup wizard, no questions

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline/promises";

const args = new Set(process.argv.slice(2));
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const ok = (s: string) => console.log(`  ${green("✓")} ${s}`);
const warn = (s: string) => console.log(`  ${yellow("!")} ${s}`);

/** Run a command quietly; show its output only if it fails. */
function run(cmd: string) {
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (error) {
    const e = error as { stdout?: Buffer; stderr?: Buffer };
    process.stderr.write(e.stdout?.toString() ?? "");
    process.stderr.write(e.stderr?.toString() ?? "");
    throw new Error(`"${cmd}" failed`);
  }
}

async function main() {
  console.log(`\n${bold("Tamam · تمام")}  installation\n`);

  // 1. Node.js
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) warn(`Node.js ${process.versions.node} detected. Tamam is tested on Node.js 22 or newer.`);
  else ok(`Node.js ${process.versions.node}`);

  // 2. .env with a real secret
  if (!existsSync(".env")) {
    if (existsSync(".env.example")) {
      copyFileSync(".env.example", ".env");
      ok("Created .env from .env.example");
    } else {
      writeFileSync(".env", 'DATABASE_URL="file:./data/tamam.db"\nAPP_SECRET=""\nSTORAGE_DIR="./storage"\n');
      ok("Created .env");
    }
  }
  let env = readFileSync(".env", "utf8");
  const secret = env.match(/^APP_SECRET="?([^"\n]*)"?/m)?.[1] ?? "";
  if (secret.length < 32 || secret.startsWith("change-me")) {
    const fresh = randomBytes(32).toString("base64");
    env = /^APP_SECRET=/m.test(env) ? env.replace(/^APP_SECRET=.*$/m, `APP_SECRET="${fresh}"`) : `${env}\nAPP_SECRET="${fresh}"\n`;
    writeFileSync(".env", env);
    ok("Generated a random APP_SECRET in .env");
  } else {
    ok("APP_SECRET is set");
  }
  const dotenv = await import("dotenv");
  dotenv.config({ quiet: true });

  // 3. Folders
  for (const dir of ["data", process.env.STORAGE_DIR ?? "storage"]) mkdirSync(dir, { recursive: true });
  ok("Data and storage folders are ready");

  // 4. Database
  if (!existsSync("src/generated/prisma/client.ts")) run("npx prisma generate");
  run("npx prisma migrate deploy");
  ok("Database is up to date");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  const { isInstalled, ensureSetupKey } = await import("../src/lib/system/setup-key");
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./data/tamam.db" }) });

  try {
    if (await isInstalled(db)) {
      console.log(`\n  This server is already installed. Start it with ${bold("npm run dev")} and sign in.`);
      console.log(dim(`  (To start over from an empty server: npm run reset:fresh)\n`));
      return;
    }

    // 5. How to start
    let mode: "wizard" | "demo" = args.has("--demo") ? "demo" : "wizard";
    if (!args.has("--demo") && !args.has("--wizard") && process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log(`\n  How would you like to start?\n`);
      console.log(`    ${bold("1")}  Set up my organization in the browser ${dim("(recommended)")}`);
      console.log(`    ${bold("2")}  Explore the demo: a Doha household, a trading company and a school\n`);
      const answer = (await rl.question("  Choose 1 or 2 [1]: ")).trim();
      rl.close();
      mode = answer === "2" ? "demo" : "wizard";
    }

    if (mode === "demo") {
      await db.$disconnect();
      execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
      console.log(`\n  ${green("Ready.")} Start the app with ${bold("npm run dev")} and open ${bold("http://localhost:3000")}`);
      console.log(`  Click any demo account on the sign-in page (password ${bold("demo1234")}).\n`);
      return;
    }

    const key = await ensureSetupKey(db);
    const port = process.env.PORT ?? "3000";
    const line = "─".repeat(64);
    console.log(`\n${line}`);
    console.log(`  ${green("Almost there.")} Start the app:  ${bold("npm run dev")}   ${dim("(or npm run build && npm start)")}`);
    console.log(`\n  Then finish setup in your browser:\n\n    ${bold(`http://localhost:${port}/setup?key=${key}`)}\n`);
    console.log(`  Setup key: ${bold(key)}  ${dim("(also saved in data/setup-key.txt; the server prints it too)")}`);
    console.log(`${line}\n`);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`\n  Setup failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
