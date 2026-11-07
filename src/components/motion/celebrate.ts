"use client";

import confetti from "canvas-confetti";

/**
 * A short burst of confetti in the theme's colours, for moments worth
 * celebrating (installation done, claim approved, fee paid). Skipped when
 * motion is reduced.
 */
export function celebrate(reduced: boolean) {
  if (reduced) return;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim() || "#8a1538";
  const colors = [accent, "#f2c060", "#ffffff", "#5ccb98", "#6aaee6"];
  const base = { particleCount: 70, spread: 62, startVelocity: 42, ticks: 180, scalar: 0.9, colors, disableForReducedMotion: true };
  confetti({ ...base, angle: 60, origin: { x: 0, y: 0.75 } });
  confetti({ ...base, angle: 120, origin: { x: 1, y: 0.75 } });
}
