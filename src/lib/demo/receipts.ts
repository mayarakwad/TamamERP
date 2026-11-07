// Generates realistic receipt "photos" for demo claims: merchant header,
// itemised lines that add up to the claim amount, a bilingual thank-you, a
// slight rotation and shadow as if photographed on a table.

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { Rng } from "./random";

const ITEMS: Record<string, string[]> = {
  groceries: ["Milk 2L", "Arabic bread x4", "Eggs 30 pcs", "Tomatoes 1kg", "Basmati rice 5kg", "Chicken breast 1kg", "Laban 1L", "Khalas dates 1kg", "Cucumbers 1kg", "Bananas", "Labneh 400g", "Water 12x1.5L", "Olive oil 1L", "Onions 2kg", "Arabic coffee 250g", "Tea bags x100", "Halloumi", "Apples 1kg"],
  dining: ["Chicken shawarma x2", "Mixed grill", "Hummus", "Karak tea x3", "Fresh orange juice", "Fattoush", "Delivery fee"],
  transport: ["Super 95 fuel", "Car wash"],
  school: ["Scientific calculator", "A4 notebooks x5", "Art supplies set", "Geometry set", "Highlighters x6"],
  electronics: ["Wireless earbuds", "Extended warranty 2 yrs", "USB-C cable"],
  health: ["Paracetamol 500mg", "Vitamin D3", "Consultation"],
  kids: ["Lesson fee", "Swim cap & goggles"],
  furniture: ["Side table", "Cushion covers x4", "Lamp"],
  maintenance: ["AC service", "Filter replacement"],
  gifts: ["Gift box", "Wrapping"],
  other: ["Item"],
};

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function splitAmount(total: number, n: number, r: Rng): number[] {
  if (n <= 1) return [total];
  const weights = Array.from({ length: n }, () => 0.4 + r.next());
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.max(100, Math.round(((total * w) / sum) / 25) * 25));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

export async function renderReceipt(opts: { merchant: string; category: string; amount: number; date: Date; paidWith: string; number: string }, r: Rng): Promise<Buffer> {
  const pool = ITEMS[opts.category] ?? ITEMS.other;
  // Roughly QAR 25-45 per grocery line keeps prices believable; other shops have a few lines.
  const n = opts.category === "groceries" ? Math.max(2, Math.min(pool.length, Math.round(opts.amount / (2500 + r.next() * 2000)))) : Math.min(pool.length, 1 + Math.floor(r.next() * 3));
  const names = [...pool].sort(() => r.next() - 0.5).slice(0, n);
  const prices = splitAmount(opts.amount, n, r);
  const W = 380;
  const lineH = 20;
  const top = 150;
  const H = top + n * lineH + 190;
  const money = (d: number) => (d / 100).toFixed(2);
  const when = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Qatar" }).format(opts.date);
  const pay = opts.paidWith === "cash" ? "CASH" : opts.paidWith === "transfer" ? "BANK TRANSFER" : `VISA **** ${1000 + Math.floor(r.next() * 8999)}`;
  const zig = Array.from({ length: Math.ceil(W / 12) + 1 }, (_, i) => `${i * 12},${H - (i % 2 ? 0 : 7)}`).join(" ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <polygon points="0,0 ${W},0 ${W},${H - 7} ${zig.split(" ").reverse().join(" ")} 0,${H - 7}" fill="#fdfcf8"/>
  <g font-family="DejaVu Sans Mono, monospace" fill="#2b2b2b" font-size="13">
    <text x="${W / 2}" y="40" text-anchor="middle" font-size="17" font-weight="bold">${esc(opts.merchant.toUpperCase().slice(0, 30))}</text>
    <text x="${W / 2}" y="62" text-anchor="middle">Doha, State of Qatar</text>
    <text x="${W / 2}" y="80" text-anchor="middle">Tel +974 44${10 + Math.floor(r.next() * 89)} ${1000 + Math.floor(r.next() * 8999)}</text>
    <text x="24" y="110">${when}</text>
    <text x="${W - 24}" y="110" text-anchor="end">INV ${opts.number.slice(-5)}</text>
    <line x1="24" y1="124" x2="${W - 24}" y2="124" stroke="#888" stroke-dasharray="4 3"/>
    ${names.map((name, i) => `<text x="24" y="${top + i * lineH}">${esc(name)}</text><text x="${W - 24}" y="${top + i * lineH}" text-anchor="end">${money(prices[i])}</text>`).join("")}
    <line x1="24" y1="${top + n * lineH - 6}" x2="${W - 24}" y2="${top + n * lineH - 6}" stroke="#888" stroke-dasharray="4 3"/>
    <text x="24" y="${top + n * lineH + 20}" font-size="16" font-weight="bold">TOTAL QAR</text>
    <text x="${W - 24}" y="${top + n * lineH + 20}" text-anchor="end" font-size="16" font-weight="bold">${money(opts.amount)}</text>
    <text x="24" y="${top + n * lineH + 46}">${pay}</text>
    <text x="${W / 2}" y="${top + n * lineH + 90}" text-anchor="middle">Thank you for shopping with us</text>
    <text x="${W / 2}" y="${top + n * lineH + 114}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="15">شكراً لزيارتكم</text>
    <text x="${W / 2}" y="${top + n * lineH + 140}" text-anchor="middle" font-size="10" fill="#777">||| |||| | ||||| || ||| | |||| ||| |||||</text>
  </g>
</svg>`;

  const receipt = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  const angle = (r.next() - 0.5) * 5;
  const rotated = await sharp(receipt).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(rotated).metadata();
  const pad = 70;
  const alpha = await sharp(rotated).extractChannel(3).linear(0.28, 0).blur(12).toBuffer();
  const shadow = await sharp({ create: { width: meta.width!, height: meta.height!, channels: 3, background: "#000" } }).joinChannel(alpha).png().toBuffer();
  return sharp({ create: { width: meta.width! + pad * 2, height: meta.height! + pad * 2, channels: 3, background: { r: 214 + Math.floor(r.next() * 18), g: 203 + Math.floor(r.next() * 14), b: 188 } } })
    .composite([
      { input: shadow, left: pad + 10, top: pad + 14 },
      { input: rotated, left: pad, top: pad },
    ])
    .webp({ quality: 78 })
    .toBuffer();
}

/** Write a receipt image + thumbnail under STORAGE_DIR and return their relative paths. */
export async function saveReceiptFiles(orgId: string, id: string, image: Buffer) {
  const storage = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
  const rel = path.join("orgs", orgId, "attachments");
  await mkdir(path.join(/*turbopackIgnore: true*/ storage, rel), { recursive: true });
  const meta = await sharp(image).metadata();
  const thumb = await sharp(image).resize({ width: 480, height: 480, fit: "inside" }).webp({ quality: 70 }).toBuffer();
  await writeFile(path.join(/*turbopackIgnore: true*/ storage, rel, `${id}.webp`), image);
  await writeFile(path.join(/*turbopackIgnore: true*/ storage, rel, `${id}-thumb.webp`), thumb);
  return { path: path.join(rel, `${id}.webp`), thumbPath: path.join(rel, `${id}-thumb.webp`), width: meta.width ?? null, height: meta.height ?? null, size: image.length };
}
