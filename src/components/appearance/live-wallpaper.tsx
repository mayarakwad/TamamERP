"use client";

import { usePrefs } from "@/components/providers";
import { WallpaperLayer } from "./wallpapers";

/**
 * The person's wallpaper, updated live as they change it.
 * scope="dashboard" renders on the dashboard; scope="everywhere" renders in the
 * shell only when they chose to show it on every page.
 */
export function LiveWallpaper({ scope }: { scope: "dashboard" | "everywhere" }) {
  const { prefs } = usePrefs();
  if (scope === "everywhere" && !prefs.wallpaperEverywhere) return null;
  if (scope === "dashboard" && prefs.wallpaperEverywhere) return null;
  return <WallpaperLayer id={prefs.wallpaper} uploadUrl={prefs.wallpaperUpload} dim={prefs.wallpaperDim} blur={prefs.wallpaperBlur} />;
}
