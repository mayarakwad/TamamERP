"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getViewer, getRequestPrefs, PREFS_COOKIE } from "@/lib/auth/dal";
import { mergePrefs, type Prefs } from "@/lib/prefs";

/** Save a partial preferences change. Works signed in (account) and signed out (this device). */
export async function savePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const viewer = await getViewer();
  const current = await getRequestPrefs();
  const next = mergePrefs(current, patch);
  if (viewer) {
    await db.user.update({ where: { id: viewer.id }, data: { preferences: next } });
  }
  await writePrefsCookie(next);
  // Language changes re-render server components; visual changes are applied in the browser already.
  if (patch.locale && patch.locale !== current.locale) refresh();
  return next;
}

export async function writePrefsCookie(prefs: Prefs) {
  const { locale, mode, theme, accent, digits, density, fontScale, motion } = prefs;
  (await cookies()).set(
    PREFS_COOKIE,
    JSON.stringify({ locale, mode, theme, accent, digits, density, fontScale, motion }),
    { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax" },
  );
}
