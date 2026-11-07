import { db } from "../db-core";
import { ensureSetupKey, isInstalled } from "./setup-key";
import { runReminders } from "../reminders";

const globalForReminders = globalThis as unknown as { tamamReminders?: NodeJS.Timeout };

export async function announceSetup() {
  if (await isInstalled(db)) {
    startReminders();
    return;
  }
  const key = await ensureSetupKey(db);
  const port = process.env.PORT ?? "3000";
  const line = "─".repeat(64);
  console.log(`\n${line}\n  Tamam isn't installed yet. Finish setup in your browser:\n\n    http://localhost:${port}/setup?key=${key}\n\n  Setup key: ${key}   (also saved in data/setup-key.txt)\n${line}\n`);
}

/** Bills coming due and warranties ending become notifications: now, then hourly. */
function startReminders() {
  if (globalForReminders.tamamReminders) return;
  const sweep = () => runReminders(db).catch((e) => console.warn("[tamam] reminder sweep failed:", e instanceof Error ? e.message : e));
  void sweep();
  globalForReminders.tamamReminders = setInterval(sweep, 60 * 60 * 1000);
  globalForReminders.tamamReminders.unref?.();
}
