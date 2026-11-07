// Simple generated logos for the demo organizations, so printed documents and
// exports show real branding from the first run.

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const MARKS: Record<string, (c: string) => string> = {
  // A house with a palm frond
  home: (c) => `<rect width="256" height="256" rx="64" fill="${c}"/><path d="M58 132 L128 70 L198 132 V196 a10 10 0 0 1 -10 10 H68 a10 10 0 0 1 -10 -10 Z" fill="#fff"/><rect x="110" y="150" width="36" height="56" rx="6" fill="${c}"/><path d="M168 64 q20 -10 34 8 q-22 -2 -30 18" fill="#f2c060"/>`,
  // Stacked boxes (supplies)
  business: (c) => `<rect width="256" height="256" rx="64" fill="${c}"/><rect x="62" y="122" width="62" height="62" rx="8" fill="#fff"/><rect x="132" y="122" width="62" height="62" rx="8" fill="#fff" opacity=".85"/><rect x="97" y="56" width="62" height="62" rx="8" fill="#f2c060"/>`,
  // A lighthouse (manara)
  school: (c) => `<rect width="256" height="256" rx="64" fill="${c}"/><path d="M108 206 L116 96 H140 L148 206 Z" fill="#fff"/><rect x="104" y="80" width="48" height="18" rx="4" fill="#f2c060"/><path d="M128 50 L150 80 H106 Z" fill="#fff"/><path d="M152 86 L214 66 V106 Z" fill="#f2c060" opacity=".7"/><rect x="84" y="200" width="88" height="10" rx="5" fill="#fff"/>`,
};

export async function writeDemoLogo(orgId: string, kind: keyof typeof MARKS, color: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">${MARKS[kind](color)}</svg>`;
  const png = await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer();
  const rel = path.join("orgs", orgId, "logo.png");
  const full = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage", rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, png);
  return rel.split(path.sep).join("/");
}
