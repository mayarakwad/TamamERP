import type { Prefs } from "./prefs";
import { readableOn } from "./themes";

// The same attributes are rendered on <html> by the server (root layout) and
// applied instantly in the browser when someone changes a preference.

export function htmlAttributes(prefs: Prefs) {
  return {
    lang: prefs.locale,
    dir: prefs.locale === "ar" ? "rtl" : "ltr",
    "data-theme": prefs.theme,
    "data-mode": prefs.mode,
    // "system" is resolved before first paint by an inline script.
    "data-scheme": prefs.mode === "dark" ? "dark" : "light",
    "data-density": prefs.density,
    "data-motion": prefs.motion,
  } as const;
}

export function htmlStyle(prefs: Prefs): Record<string, string> {
  const style: Record<string, string> = { fontSize: `${prefs.fontScale * 100}%` };
  if (prefs.accent) {
    style["--accent"] = prefs.accent;
    style["--accent-fg"] = readableOn(prefs.accent);
  }
  return style;
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyPrefsToDocument(prefs: Prefs) {
  const el = document.documentElement;
  const attrs = htmlAttributes(prefs);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (prefs.mode === "system") el.dataset.scheme = systemPrefersDark() ? "dark" : "light";
  el.style.fontSize = `${prefs.fontScale * 100}%`;
  if (prefs.accent) {
    el.style.setProperty("--accent", prefs.accent);
    el.style.setProperty("--accent-fg", readableOn(prefs.accent));
  } else {
    el.style.removeProperty("--accent");
    el.style.removeProperty("--accent-fg");
  }
}

/** Runs before first paint: resolves "system" to light or dark. */
export const SCHEME_SCRIPT = `(function(){try{var d=document.documentElement;if(d.getAttribute('data-mode')==='system'){d.setAttribute('data-scheme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}}catch(e){}})()`;
