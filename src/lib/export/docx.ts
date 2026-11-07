import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IRunOptions,
} from "docx";
import { formatCell } from "../datasets/format-cell";
import { columnLabel } from "../datasets/types";
import { currencyLabel, generatedLine, isNumeric, type ExportDoc } from "./doc";

// Word documents: A4 (landscape for wide tables), the organization's logo and
// name in the header, a header row that repeats on every page, "Page X of Y"
// in the footer, and proper right-to-left paragraphs and tables for Arabic.

const FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };

export async function renderDocx(doc: ExportDoc): Promise<Buffer> {
  const rtl = doc.dir === "rtl";
  const brand = doc.brand.brandColor.replace("#", "").toUpperCase();
  const landscape = doc.columns.length > 5;
  const run = (text: string, o: Partial<IRunOptions> = {}) => new TextRun({ text, font: FONT, rightToLeft: rtl, size: 19, sizeComplexScript: 19, ...o });
  const para = (children: (TextRun | ImageRun | string)[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingAfter?: number } = {}) =>
    new Paragraph({ bidirectional: rtl, alignment: o.align ?? AlignmentType.START, spacing: { after: o.spacingAfter ?? 0 }, children: children as never });

  const thin = { style: BorderStyle.SINGLE, size: 4, color: "E6DED6" };
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cellBorders = { top: none, left: none, right: none, bottom: thin };

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: doc.columns.map(
      (c) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: brand, color: "auto" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          borders: { top: none, left: none, right: none, bottom: none },
          children: [para([run(c.type === "money" ? `${columnLabel(c, doc.t)} (${currencyLabel(doc)})` : columnLabel(c, doc.t), { bold: true, color: "FFFFFF", size: 18, sizeComplexScript: 18 })], { align: isNumeric(c) ? AlignmentType.END : AlignmentType.START })],
        }),
    ),
  });

  const bodyRows = doc.rows.map(
    (r, i) =>
      new TableRow({
        cantSplit: true,
        children: doc.columns.map(
          (c) =>
            new TableCell({
              shading: i % 2 ? { type: ShadingType.CLEAR, fill: "FAF8F6", color: "auto" } : undefined,
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              borders: cellBorders,
              children: [para([run(formatCell(c, r.cells[c.key], doc.fmt, doc.t))], { align: isNumeric(c) ? AlignmentType.END : AlignmentType.START })],
            }),
        ),
      }),
  );

  const totalsRow = Object.keys(doc.totals).length
    ? [
        new TableRow({
          cantSplit: true,
          children: doc.columns.map(
            (c, i) =>
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: "F3EFEC", color: "auto" },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                borders: { top: { style: BorderStyle.SINGLE, size: 8, color: brand }, left: none, right: none, bottom: none },
                children: [
                  para([run(i === 0 ? doc.t("toolbar.total") : c.total ? formatCell(c, doc.totals[c.key], doc.fmt, doc.t) : "", { bold: true })], { align: isNumeric(c) ? AlignmentType.END : AlignmentType.START }),
                ],
              }),
          ),
        }),
      ]
    : [];

  const totalWidth = doc.columns.reduce((s, c) => s + (c.width ?? 16), 0);
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.AUTOFIT,
    visuallyRightToLeft: rtl,
    columnWidths: doc.columns.map((c) => Math.round(((c.width ?? 16) / totalWidth) * (landscape ? 14800 : 9800))),
    rows: [headerRow, ...bodyRows, ...totalsRow],
  });

  const headerChildren: Paragraph[] = [
    para(
      [
        ...(doc.brand.logoPng ? [new ImageRun({ type: "png", data: doc.brand.logoPng, transformation: { width: 34, height: 34 } }), run("  ")] : []),
        run(doc.brand.name, { bold: true, size: 20, sizeComplexScript: 20 }),
        ...(doc.brand.address ? [run(`   ${doc.brand.address}`, { color: "777777", size: 16, sizeComplexScript: 16 })] : []),
      ],
      { spacingAfter: 120 },
    ),
  ];

  const footer = new Footer({
    children: [
      new Paragraph({
        bidirectional: rtl,
        alignment: AlignmentType.CENTER,
        children: [
          run(`${doc.appName} · `, { color: "888888", size: 16, sizeComplexScript: 16 }),
          run(doc.locale === "ar" ? "صفحة " : "Page ", { color: "888888", size: 16, sizeComplexScript: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, color: "888888", size: 16 }),
          run(doc.locale === "ar" ? " من " : " of ", { color: "888888", size: 16, sizeComplexScript: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, color: "888888", size: 16 }),
        ],
      }),
    ],
  });

  const document = new Document({
    creator: doc.appName,
    lastModifiedBy: doc.generatedBy,
    title: doc.title,
    description: doc.subtitle,
    styles: { default: { document: { run: { font: FONT, size: 19, sizeComplexScript: 19, rightToLeft: rtl } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT, width: 11906, height: 16838 },
            margin: { top: 1000, bottom: 1000, left: 900, right: 900, header: 500, footer: 500 },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: footer },
        children: [
          para([run(doc.title, { bold: true, size: 34, sizeComplexScript: 34, color: brand })], { spacingAfter: 60 }),
          ...(doc.subtitle ? [para([run(doc.subtitle, { color: "555555", size: 20, sizeComplexScript: 20 })], { spacingAfter: 60 })] : []),
          para([run(generatedLine(doc), { color: "888888", size: 16, sizeComplexScript: 16 })], { spacingAfter: 240 }),
          table,
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(document));
}
