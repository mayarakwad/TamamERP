import "server-only";
import { db } from "../db";
import { createT, type MessageKey } from "../i18n";
import { buildSnapshot, type ReportSnapshot } from "../school/report-card";
import { bandFor, schoolSettings } from "../school/settings";
import { documentShell, esc } from "./html";
import type { ExportDoc } from "./doc";

const en = createT("en");
const ar = createT("ar");

/** One label in both languages: "Subject · المادة". */
const bi = (key: MessageKey) => `<span class="en">${esc(en(key))}</span><span class="ar" dir="rtl">${esc(ar(key))}</span>`;

/**
 * Bilingual report cards (English and Arabic on the same page), one per
 * page. Published cards print their frozen snapshot; drafts are computed now
 * so staff can preview them.
 */
export async function renderReportCards(doc: ExportDoc, orgId: string, ids: string[], mode: "print" | "pdf"): Promise<string> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const settings = schoolSettings(org);
  const cards = await db.reportCard.findMany({ where: { id: { in: ids }, orgId }, include: { student: true } });
  const order = new Map(ids.map((id, i) => [id, i]));
  cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const snaps: ReportSnapshot[] = [];
  for (const c of cards) {
    if (c.status === "published" && c.snapshot) snaps.push(c.snapshot as unknown as ReportSnapshot);
    else if (c.sectionId) {
      const s = await buildSnapshot(db, c.studentId, c.termId, c.sectionId, settings, { teacher: c.teacherComment, principal: c.principalComment, subjects: (c.subjectComments as Record<string, string> | null) ?? {} });
      s.student.number = c.student.number;
      snaps.push(s);
    }
  }
  const accent = doc.brand.brandColor;
  const pages = snaps.map((s) => page(s, org, doc, accent)).join("");
  const body = `
<style>
.rc { page-break-after: always; break-after: page; }
.rc:last-child { page-break-after: auto; break-after: auto; }
.rc .en { display:block; }
.rc .ar { display:block; font-size:0.92em; color:#6b625c; }
.rc-head { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; padding-bottom:10px; border-bottom:3px solid ${accent}; }
.rc-head .l { text-align:left; } .rc-head .r { text-align:right; }
.rc-head img { width:60px; height:60px; object-fit:contain; }
.rc-head .n { font-weight:600; font-size:12.5pt; }
.rc-head .s { color:#6b625c; font-size:8pt; }
.rc-title { text-align:center; margin:12px 0 10px; }
.rc-title h1 { margin:0; color:${accent}; font-size:17pt; font-weight:600; }
.rc-title .ar { color:${accent}; font-size:14pt; }
.rc-title .t { color:#555; font-size:9pt; margin-top:2px; }
.rc-who { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px 14px; padding:10px 12px; border-radius:10px; background:#f6f2ee; font-size:9pt; }
.rc-who .k { font-size:7pt; color:#888; } .rc-who .k .ar { color:#888; }
.rc-who .v { font-weight:600; }
.rc table { margin-top:12px; }
.rc th { font-size:8pt; line-height:1.2; }
.rc th .ar { color:#fff; opacity:.85; }
.rc td.g { font-weight:700; text-align:center; width:48px; }
.rc td.pct { width:64px; }
.rc .avg td { font-weight:700; border-top:2px solid ${accent}; background:#f6f2ee !important; }
.rc-att { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:12px; }
.rc-att div { border:1px solid #ece5de; border-radius:8px; padding:6px 10px; }
.rc-att b { font-size:13pt; display:block; }
.rc-att .k { font-size:7pt; color:#888; }
.rc-com { margin-top:12px; display:grid; gap:10px; }
.rc-com div { border-inline-start:3px solid ${accent}; padding:4px 10px; break-inside:avoid; }
.rc-com .k { font-size:7.5pt; color:#888; display:flex; gap:10px; }
.rc-com .k .ar, .rc-com .k .en { display:inline; }
.rc-key { margin-top:12px; font-size:7.5pt; color:#6b625c; display:flex; flex-wrap:wrap; gap:4px 14px; }
.rc-sign { display:grid; grid-template-columns:repeat(3,1fr); gap:28px; margin-top:34px; }
.rc-sign div { border-top:1px solid #999; padding-top:4px; font-size:7.5pt; color:#666; }
.rc-sign div { display:flex; justify-content:space-between; gap:8px; }
.rc-sign .ar, .rc-sign .en { display:inline; }
</style>
${pages}`;
  const title = snaps.length === 1 ? `${en("reportCards.single")} · ${snaps[0].student.name} · ${snaps[0].term} ${snaps[0].year}` : `${en("reportCards.title")} · ${snaps[0]?.className ?? ""}`;
  return documentShell({ ...doc, title, dir: "ltr", locale: "en" }, body, { mode, landscape: false });
}

function page(s: ReportSnapshot, org: { name: string; nameAr: string | null; address: string | null; addressAr: string | null }, doc: ExportDoc, accent: string) {
  const fmtDate = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Qatar" }).format(new Date(d));
  const present = s.attendance.days - s.attendance.absent - s.attendance.excused;
  const rows = s.subjects
    .map((x) => {
      const band = bandFor(s.scale, x.percent);
      return `<tr>
  <td><span class="en">${esc(x.name)}</span>${x.comment ? `<div style="font-size:7.5pt;color:#6b625c">${esc(x.comment)}</div>` : ""}</td>
  <td dir="rtl" style="text-align:right">${esc(x.nameAr ?? "")}</td>
  <td class="num pct">${x.percent != null ? `${x.percent.toFixed(1)}%` : "—"}</td>
  <td class="g" style="color:${x.percent != null && x.percent < s.passMark ? "#B42318" : accent}">${esc(x.letter ?? "—")}</td>
  <td>${esc(band?.label ?? "")}</td>
  <td dir="rtl" style="text-align:right">${esc(band?.labelAr ?? "")}</td>
</tr>`;
    })
    .join("");
  const avgBand = bandFor(s.scale, s.average);
  return `<section class="rc">
<div class="rc-head">
  <div class="l"><div class="n">${esc(org.name)}</div>${org.address ? `<div class="s">${esc(org.address)}</div>` : ""}</div>
  <div>${doc.brand.logo ? `<img src="${doc.brand.logo}" alt="">` : ""}</div>
  <div class="r" dir="rtl"><div class="n">${esc(org.nameAr ?? org.name)}</div>${org.addressAr ? `<div class="s">${esc(org.addressAr)}</div>` : ""}</div>
</div>
<div class="rc-title">
  <h1>${esc(en("reportCards.single"))} <span class="ar" style="display:inline">· ${esc(ar("reportCards.single"))}</span></h1>
  <div class="t">${esc(s.term)} ${esc(s.year)} · <span dir="rtl">${esc(s.termAr ?? s.term)} <span dir="ltr">${esc(s.year)}</span></span></div>
</div>
<div class="rc-who">
  <div><div class="k">${bi("reportCards.student")}</div><div class="v">${esc(s.student.name)}</div><div class="v" dir="rtl" style="font-weight:500">${esc(s.student.nameAr ?? "")}</div></div>
  <div><div class="k">${bi("school.section")}</div><div class="v">${esc(s.className)} · <span dir="rtl">${esc(s.classNameAr)}</span></div><div style="font-size:8pt;color:#6b625c">${esc(s.grade)} · ${esc(s.campus)}</div></div>
  <div><div class="k">${bi("students.colNumber")}</div><div class="v" style="font-family:ui-monospace,monospace;font-size:8.5pt">${esc(s.student.number || "—")}</div><div class="k" style="margin-top:4px">${bi("students.dob")}</div><div>${esc(fmtDate(s.student.dob))}</div></div>
  <div><div class="k">${bi("school.homeroom")}</div><div class="v">${esc(s.homeroom ?? "—")}</div></div>
</div>
<table>
  <thead><tr><th>${esc(en("school.subject"))}</th><th style="text-align:right" dir="rtl">${esc(ar("school.subject"))}</th><th class="num">%</th><th style="text-align:center">${bi("exams.grade")}</th><th colspan="2">${bi("schoolSetup.gradingTitle")}</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr class="avg"><td>${esc(en("reportCards.average"))}</td><td dir="rtl" style="text-align:right">${esc(ar("reportCards.average"))}</td><td class="num">${s.average != null ? `${s.average.toFixed(1)}%` : "—"}</td><td class="g">${esc(avgBand?.letter ?? "—")}</td><td>${esc(avgBand?.label ?? "")}</td><td dir="rtl" style="text-align:right">${esc(avgBand?.labelAr ?? "")}</td></tr></tfoot>
</table>
<div class="rc-att">
  <div><span class="k">${bi("reportCards.attendance")}</span><b>${s.attendance.days ? `${Math.round((present / s.attendance.days) * 100)}%` : "—"}</b></div>
  <div><span class="k">${bi("roll.colPresent")}</span><b>${present} / ${s.attendance.days}</b></div>
  <div><span class="k">${bi("roll.colAbsent")}</span><b>${s.attendance.absent + s.attendance.excused}</b></div>
  <div><span class="k">${bi("roll.colLate")}</span><b>${s.attendance.late}</b></div>
</div>
<div class="rc-com">
  <div><div class="k">${bi("reportCards.teacherComment")}</div>${esc(s.teacherComment ?? "—")}</div>
  <div><div class="k">${bi("reportCards.principalComment")}</div>${esc(s.principalComment ?? "—")}</div>
</div>
<div class="rc-key">${s.scale.map((b) => `<span><b style="color:${accent}">${esc(b.letter)}</b> ${b.min}%+ ${esc(b.label)} · <span dir="rtl">${esc(b.labelAr)}</span></span>`).join("")}</div>
<div class="rc-sign">
  <div>${bi("school.homeroom")}</div>
  <div><span class="en">Principal</span><span class="ar" dir="rtl">المدير</span></div>
  <div><span class="en">Parent</span><span class="ar" dir="rtl">ولي الأمر</span></div>
</div>
</section>`;
}
