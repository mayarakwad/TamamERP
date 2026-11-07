import type { Metadata } from "next";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSystem, runSystemChecks } from "@/lib/system";
import { ensureSetupKey, setupKeyMatches } from "@/lib/system/setup-key";
import { PREFERRED_TIMEZONES } from "@/lib/system/options";
import { SetupWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up" };

// Reads the setup cookie and ?key=; always rendered at request time.
export const instant = false;

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const system = await getSystem();
  // Once installed, the wizard is locked. (It stays mounted rather than
  // redirecting, so the person who just installed still sees the finish screen.)
  if (system.installed) return <SetupWizard installed unlocked={false} initialChecks={[]} initialKey="" timezones={[]} />;

  // Make sure a key exists (e.g. the server started before the database was migrated).
  await ensureSetupKey(db);
  const setting = await db.systemSetting.findUnique({ where: { id: 1 } });
  const cookieKey = (await cookies()).get("tamam_setup")?.value ?? "";
  const unlocked = setupKeyMatches(cookieKey, setting?.setupKeyHash);
  const checks = unlocked ? await runSystemChecks() : [];

  const { key } = await searchParams;
  const all = Intl.supportedValuesOf("timeZone");
  const timezones = [...PREFERRED_TIMEZONES, ...all.filter((tz) => !PREFERRED_TIMEZONES.includes(tz))];

  return <SetupWizard unlocked={unlocked} initialChecks={checks} initialKey={typeof key === "string" ? key : ""} timezones={timezones} />;
}
