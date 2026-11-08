import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatCell } from "../datasets/format-cell";
import { columnLabel } from "../datasets/types";
import { generatedLine, isNumeric, type ExportDoc } from "./doc";

// One HTML layout for print and PDF: logo, organization, title, generation
// date (Gregorian + Hijri), a table whose header repeats on every page, totals
// and page numbers. The Readex Pro font is embedded so Arabic is shaped
// correctly everywhere, without relying on fonts installed on the machine.

let fontCss: string | null = null;
function fonts(): string {
  if (fontCss) return fontCss;
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules/@fontsource-variable/readex-pro/files");
  const face = (subset: string, range: string) => {
    try {
      const b64 = readFileSync(path.join(/*turbopackIgnore: true*/ dir, `readex-pro-${subset}-wght-normal.woff2`)).toString("base64");
      return `@font-face{font-family:"Readex Pro";font-weight:160 700;font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range};}`;
    } catch {
      return "";
    }
  };
  fontCss =
    face("arabic", "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC") +
    face("latin", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD") +
    face("latin-ext", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF");
  return fontCss;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function documentShell(doc: Pick<ExportDoc, "locale" | "dir" | "title" | "brand">, body: string, opts: { mode: "print" | "pdf"; landscape: boolean; footer?: string }) {
  const accent = doc.brand.brandColor;
  return `<!doctype html>
<html lang="${doc.locale}" dir="${doc.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>
${fonts()}
@page { size: A4 ${opts.landscape ? "landscape" : "portrait"}; margin: 14mm 12mm 16mm; ${
    opts.mode === "print" ? `@bottom-center { content: counter(page) " / " counter(pages); font: 8pt "Readex Pro", Arial, sans-serif; color: #888; }` : ""
  } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Readex Pro", Arial, sans-serif; color: #1f1a17; font-size: 9.5pt; line-height: 1.45; }
${opts.mode === "print" ? "@media screen { body { max-width: 1100px; margin: 24px auto; padding: 0 24px; } }" : ""}
.head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid ${accent}; margin-bottom: 14px; }
.org { display: flex; align-items: center; gap: 12px; }
.org img { width: 46px; height: 46px; object-fit: contain; }
.org .name { font-weight: 600; font-size: 11pt; }
.org .addr { color: #6b625c; font-size: 8pt; }
.title { text-align: end; }
.title h1 { margin: 0; font-size: 16pt; color: ${accent}; font-weight: 600; }
.title .sub { color: #555; font-size: 9pt; }
.meta { color: #888; font-size: 7.5pt; margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tfoot { display: table-row-group; }
tr { break-inside: avoid; }
th { background: ${accent}; color: #fff; font-weight: 600; font-size: 8.5pt; text-align: start; padding: 6px 8px; }
td { padding: 5px 8px; border-bottom: 1px solid #ece5de; vertical-align: top; }
tbody tr:nth-child(even) td { background: #faf8f6; }
tr.em-heading td { font-weight: 600; background: #f3efec !important; padding-top: 8px; }
tr.em-subtotal td { font-weight: 600; border-top: 1px solid #cfc6bd; }
tr.em-total td { font-weight: 700; border-top: 2px solid ${accent}; background: #f6f2ee !important; }
.num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nowrap { white-space: nowrap; }
tfoot td { font-weight: 600; background: #f3efec; border-top: 2px solid ${accent}; border-bottom: 0; }
.foot { position: fixed; bottom: 0; inset-inline: 0; font-size: 7pt; color: #999; display: ${opts.mode === "print" ? "block" : "none"}; }
</style>
</head>
<body>
${body}
${opts.footer ? `<div class="foot">${esc(opts.footer)}</div>` : ""}
${opts.mode === "print" ? `<script>window.addEventListener("load",()=>{document.fonts.ready.then(()=>setTimeout(()=>window.print(),150))});</script>` : ""}
</body>
</html>`;
}

export function letterhead(doc: ExportDoc) {
  return `<header class="head">
  <div class="org">${doc.brand.logo ? `<img src="${doc.brand.logo}" alt="">` : ""}<div><div class="name">${esc(doc.brand.name)}</div>${
    doc.brand.address ? `<div class="addr">${esc(doc.brand.address)}</div>` : ""
  }</div></div>
  <div class="title"><h1>${esc(doc.title)}</h1>${doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : ""}</div>
</header>
<p class="meta">${esc(generatedLine(doc))}</p>`;
}

export function renderTableHtml(doc: ExportDoc, mode: "print" | "pdf"): string {
  const cols = doc.columns;
  const cls = (c: (typeof cols)[number]) => (isNumeric(c) ? "num" : c.type === "date" || c.type === "enum" ? "nowrap" : "");
  const thead = `<thead><tr>${cols.map((c) => `<th class="${isNumeric(c) ? "num" : ""}">${esc(columnLabel(c, doc.t))}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${doc.rows.map((r) => `<tr${r.emphasis ? ` class="em-${r.emphasis}"` : ""}>${cols.map((c) => `<td class="${cls(c)}">${esc(formatCell(c, r.cells[c.key], doc.fmt, doc.t))}</td>`).join("")}</tr>`).join("")}</tbody>`;
  const tfoot = Object.keys(doc.totals).length
    ? `<tfoot><tr>${cols
        .map((c, i) => `<td class="${cls(c)}">${i === 0 ? esc(`${doc.t("toolbar.total")} · ${doc.t("toolbar.rows", { count: doc.fmt.number(doc.rows.length) })}`) : c.total ? esc(formatCell(c, doc.totals[c.key], doc.fmt, doc.t)) : ""}</td>`)
        .join("")}</tr></tfoot>`
    : "";
  return documentShell(doc, `${letterhead(doc)}<table>${thead}${tbody}${tfoot}</table>`, {
    mode,
    landscape: cols.length > 6,
    footer: `${doc.appName} · ${doc.brand.name}`,
  });
}
