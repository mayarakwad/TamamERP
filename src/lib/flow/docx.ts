import "server-only";
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, type IRunOptions } from "docx";

// Flow's drafts as a Word file: headings, paragraphs, bullet and numbered
// lists, tables, bold and italic. Arabic paragraphs are right-to-left.

const FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };
const ARABIC = /[؀-ۿ]/;

function runs(text: string, rtl: boolean, base: Partial<IRunOptions> = {}): TextRun[] {
  // **bold**, *italic*, `code`, [label](url) → label
  const clean = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const out: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  for (const m of clean.matchAll(re)) {
    if (m.index! > last) out.push(new TextRun({ text: clean.slice(last, m.index), font: FONT, rightToLeft: rtl, ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, font: FONT, rightToLeft: rtl, ...base }));
    else if (tok.startsWith("`")) out.push(new TextRun({ text: tok.slice(1, -1), font: "Consolas", rightToLeft: rtl, ...base }));
    else out.push(new TextRun({ text: tok.slice(1, -1), italics: true, font: FONT, rightToLeft: rtl, ...base }));
    last = m.index! + tok.length;
  }
  if (last < clean.length) out.push(new TextRun({ text: clean.slice(last), font: FONT, rightToLeft: rtl, ...base }));
  return out;
}

function para(text: string, opts: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; bullet?: boolean; number?: boolean; docRtl: boolean }) {
  const rtl = ARABIC.test(text) || opts.docRtl;
  return new Paragraph({
    heading: opts.heading,
    bidirectional: rtl,
    alignment: AlignmentType.START,
    spacing: { after: opts.heading ? 120 : 100 },
    ...(opts.bullet ? { bullet: { level: 0 } } : {}),
    ...(opts.number ? { numbering: { reference: "flow-numbers", level: 0 } } : {}),
    children: runs(text, rtl, { size: opts.heading ? undefined : 22, sizeComplexScript: opts.heading ? undefined : 22 }),
  });
}

function table(lines: string[], docRtl: boolean): Table {
  const rows = lines
    .filter((l) => !/^\|?\s*:?-{2,}/.test(l.replace(/\|/g, "|").trim().replace(/^\|/, "").trim()))
    .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
  const cols = Math.max(...rows.map((r) => r.length));
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D4CF" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: docRtl,
    rows: rows.map(
      (r, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: Array.from({ length: cols }, (_, c) => {
            const text = r[c] ?? "";
            const rtl = ARABIC.test(text) || docRtl;
            return new TableCell({
              borders: { top: border, bottom: border, left: border, right: border },
              shading: i === 0 ? { fill: "F3EFEB" } : undefined,
              children: [new Paragraph({ bidirectional: rtl, children: runs(text, rtl, { bold: i === 0, size: 20, sizeComplexScript: 20 }) })],
            });
          }),
        }),
    ),
  });
}

export async function markdownToDocx(markdown: string, title: string): Promise<Buffer> {
  const docRtl = (markdown.match(/[؀-ۿ]/g)?.length ?? 0) > markdown.length * 0.25;
  const children: (Paragraph | Table)[] = [];
  if (title) children.push(para(title, { heading: HeadingLevel.TITLE, docRtl }));
  const lines = markdown.replace(/\r/g, "").split("\n");
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) children.push(para(buffer.join(" "), { docRtl }));
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (trimmed.startsWith("|")) {
      flush();
      const block: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) block.push(lines[i++]);
      i--;
      children.push(table(block, docRtl));
      children.push(new Paragraph({ children: [] }));
      continue;
    }
    const h = trimmed.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      flush();
      children.push(para(h[2], { heading: h[1].length === 1 ? HeadingLevel.HEADING_1 : h[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, docRtl }));
      continue;
    }
    const b = trimmed.match(/^[-*•]\s+(.*)/);
    if (b) {
      flush();
      children.push(para(b[1], { bullet: true, docRtl }));
      continue;
    }
    const n = trimmed.match(/^\d+[.)]\s+(.*)/);
    if (n) {
      flush();
      children.push(para(n[1], { number: true, docRtl }));
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      flush();
      continue;
    }
    buffer.push(trimmed);
  }
  flush();
  const doc = new Document({
    creator: "Tamam · Flow",
    title,
    styles: { default: { document: { run: { font: FONT } } } },
    numbering: { config: [{ reference: "flow-numbers", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}
