import { z } from "zod";
import { THEME_IDS } from "./themes";

// Personal preferences, saved on the user record so they follow the person to
// any device. Every field has a safe fallback, so old or partial data never
// breaks rendering.

export const WALLPAPER_IDS = [
  "none",
  "mashrabiya",
  "dunes",
  "corniche",
  "sadu",
  "pearls",
  "contours",
  "night",
  "upload",
] as const;
export type WallpaperId = (typeof WALLPAPER_IDS)[number];

export const FONT_SCALES = [0.9, 1, 1.1, 1.2] as const;

export const prefsSchema = z.object({
  locale: z.enum(["en", "ar"]).catch("en"),
  mode: z.enum(["light", "dark", "system"]).catch("system"),
  theme: z.enum(THEME_IDS).catch("pearl"),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .catch(null),
  wallpaper: z.enum(WALLPAPER_IDS).catch("mashrabiya"),
  wallpaperUpload: z.string().nullable().catch(null),
  wallpaperDim: z.number().min(0).max(90).catch(30),
  wallpaperBlur: z.number().min(0).max(24).catch(0),
  wallpaperEverywhere: z.boolean().catch(false),
  fontScale: z.number().min(0.85).max(1.3).catch(1),
  density: z.enum(["comfortable", "compact"]).catch("comfortable"),
  digits: z.enum(["latn", "arab"]).catch("latn"),
  showHijri: z.boolean().catch(true),
  motion: z.enum(["system", "full", "reduced"]).catch("system"),
});

export type Prefs = z.infer<typeof prefsSchema>;

export const DEFAULT_PREFS: Prefs = prefsSchema.parse({});

export function parsePrefs(raw: unknown): Prefs {
  const obj = raw && typeof raw === "object" ? raw : {};
  return prefsSchema.parse(obj);
}

/** Validate a partial update coming from the browser. Unknown keys are dropped. */
export function mergePrefs(current: Prefs, patch: unknown): Prefs {
  const p = patch && typeof patch === "object" ? patch : {};
  return prefsSchema.parse({ ...current, ...p });
}
