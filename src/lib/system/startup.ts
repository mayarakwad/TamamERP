import { db } from "../db-core";
import { ensureSetupKey, isInstalled } from "./setup-key";

export async function announceSetup() {
  if (await isInstalled(db)) return;
  const key = await ensureSetupKey(db);
  const port = process.env.PORT ?? "3000";
  const line = "─".repeat(64);
  console.log(`\n${line}\n  Tamam isn't installed yet. Finish setup in your browser:\n\n    http://localhost:${port}/setup?key=${key}\n\n  Setup key: ${key}   (also saved in data/setup-key.txt)\n${line}\n`);
}
