// The one-time setup key protects a fresh installation: whoever runs the
// setup wizard must prove they can see the server (its terminal output or
// data/setup-key.txt). Without it, the first stranger to find a new server
// could claim the administrator account.
//
// No server-only imports: the terminal installer (scripts/setup.ts) uses it too.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "../../generated/prisma/client";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
export const SETUP_KEY_FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "setup-key.txt");

export function generateSetupKey(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

export function normalizeSetupKey(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 12 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}` : raw;
}

export function hashSetupKey(key: string): string {
  return createHash("sha256").update(normalizeSetupKey(key)).digest("hex");
}

export function setupKeyMatches(key: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  const a = Buffer.from(hashSetupKey(key), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when nobody has installed this server yet. */
export async function isInstalled(db: PrismaClient): Promise<boolean> {
  const setting = await db.systemSetting.findUnique({ where: { id: 1 } });
  if (setting?.installedAt) return true;
  // Databases created before the wizard existed: users means installed.
  return (await db.user.count()) > 0;
}

/**
 * Returns the current setup key, creating one if needed. The key is kept in
 * data/setup-key.txt (readable only by the server's user) and its hash in the
 * database, so restarts keep the same key until installation finishes.
 */
export async function ensureSetupKey(db: PrismaClient): Promise<string> {
  const setting = await db.systemSetting.findUnique({ where: { id: 1 } });
  try {
    const existing = (await readFile(SETUP_KEY_FILE, "utf8")).trim();
    if (existing && setupKeyMatches(existing, setting?.setupKeyHash)) return existing;
  } catch {
    // no file yet
  }
  const key = generateSetupKey();
  await db.systemSetting.upsert({
    where: { id: 1 },
    create: { id: 1, setupKeyHash: hashSetupKey(key) },
    update: { setupKeyHash: hashSetupKey(key) },
  });
  await mkdir(path.dirname(SETUP_KEY_FILE), { recursive: true });
  await writeFile(SETUP_KEY_FILE, key + "\n", { mode: 0o600 });
  await chmod(SETUP_KEY_FILE, 0o600).catch(() => {});
  return key;
}

export async function removeSetupKeyFile() {
  await rm(SETUP_KEY_FILE, { force: true });
}
