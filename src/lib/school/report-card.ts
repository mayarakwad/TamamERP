// Report cards: the frozen snapshot printed for parents, how it's built from
// marks and rolls, and a bank of suggested comments. No server-only imports.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { termPercent } from "./grading";
import { bandFor, sectionLabel, sectionLabelAr, type GradeBand, type SchoolSettings } from "./settings";

type Db = PrismaClient | Prisma.TransactionClient;
const DAY = 86400_000;

export interface ReportSnapshot {
  student: { name: string; nameAr: string | null; number: string; dob: string; gender: string };
  className: string;
  classNameAr: string;
  grade: string;
  gradeAr: string | null;
  campus: string;
  campusAr: string | null;
  year: string;
  term: string;
  termAr: string | null;
  homeroom: string | null;
  homeroomAr: string | null;
  subjects: { code: string; name: string; nameAr: string | null; percent: number | null; letter: string | null; teacher: string | null; comment: string | null }[];
  attendance: { days: number; absent: number; late: number; excused: number };
  average: number | null;
  teacherComment: string | null;
  principalComment: string | null;
  scale: GradeBand[];
  passMark: number;
}

/** Everything a report card shows, computed from this term's marks and rolls. */
export async function buildSnapshot(db: Db, studentId: string, termId: string, sectionId: string, settings: SchoolSettings, comments: { teacher: string | null; principal: string | null; subjects: Record<string, string> }): Promise<ReportSnapshot> {
  const [st, term, section, assignments, assessments] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: studentId } }),
    db.term.findUniqueOrThrow({ where: { id: termId }, include: { year: true } }),
    db.section.findUniqueOrThrow({ where: { id: sectionId }, include: { grade: true, campus: true, homeroom: true } }),
    db.teachingAssignment.findMany({ where: { sectionId }, include: { subject: true, teacher: true }, orderBy: { subject: { sort: "asc" } } }),
    db.assessment.findMany({ where: { sectionId, termId }, include: { marks: { where: { studentId } } } }),
  ]);
  const until = new Date(Math.min(term.endDate.getTime() + DAY, Date.now() + DAY));
  const [days, rows] = await Promise.all([
    db.attendanceRoll.count({ where: { sectionId, date: { gte: term.startDate, lt: until } } }),
    db.studentAttendance.findMany({ where: { studentId, date: { gte: term.startDate, lt: until } } }),
  ]);
  const subjects = assignments.map((a) => {
    const mine = assessments.filter((x) => x.subjectId === a.subjectId);
    const percent = termPercent(
      mine.map((x) => ({ id: x.id, maxScore: x.maxScore, weight: x.weight })),
      mine.flatMap((x) => x.marks.map((m) => ({ assessmentId: x.id, score: m.score, absent: m.absent }))),
    );
    return { code: a.subject.code, name: a.subject.name, nameAr: a.subject.nameAr, percent, letter: bandFor(settings.scale, percent)?.letter ?? null, teacher: a.teacher?.name ?? null, comment: comments.subjects[a.subjectId] ?? null };
  });
  const scored = subjects.filter((x) => x.percent != null);
  return {
    student: { name: st.name, nameAr: st.nameAr, number: st.number, dob: st.dob.toISOString(), gender: st.gender },
    className: sectionLabel(section.grade, section.name),
    classNameAr: sectionLabelAr(section.grade, section.name),
    grade: section.grade.name,
    gradeAr: section.grade.nameAr,
    campus: section.campus.name,
    campusAr: section.campus.nameAr,
    year: term.year.name,
    term: term.name,
    termAr: term.nameAr,
    homeroom: section.homeroom?.name ?? null,
    homeroomAr: section.homeroom?.nameAr ?? null,
    subjects,
    attendance: { days: Math.max(days, rows.length), absent: rows.filter((x) => x.status === "absent").length, late: rows.filter((x) => x.status === "late").length, excused: rows.filter((x) => x.status === "excused").length },
    average: scored.length ? Math.round((scored.reduce((s, x) => s + x.percent!, 0) / scored.length) * 10) / 10 : null,
    teacherComment: comments.teacher,
    principalComment: comments.principal,
    scale: settings.scale,
    passMark: settings.passMark,
  };
}

/** Suggested comments by how the term went. {name} is the child's first name; no pronouns needed. */
export const COMMENT_BANK: { band: "high" | "good" | "steady" | "support"; en: string; ar: string; arF: string }[] = [
  { band: "high", en: "{name} has had an excellent term, working with focus and real curiosity. A pleasure to teach; keep aiming high.", ar: "قدّم {name} أداءً ممتازاً هذا الفصل بتركيز وفضول حقيقي. سعدنا بتدريسه، ونتمنى له مواصلة التميز.", arF: "قدّمت {name} أداءً ممتازاً هذا الفصل بتركيز وفضول حقيقي. سعدنا بتدريسها، ونتمنى لها مواصلة التميز." },
  { band: "high", en: "{name} is a confident, capable learner who contributes thoughtfully to every lesson and helps classmates generously.", ar: "{name} متعلم واثق وقادر، يشارك بعمق في كل حصة ويساعد زملاءه بسخاء.", arF: "{name} متعلمة واثقة وقادرة، تشارك بعمق في كل حصة وتساعد زملاءها بسخاء." },
  { band: "good", en: "{name} has made strong progress this term and takes pride in presenting work neatly. Reading every evening will build on this.", ar: "أحرز {name} تقدماً جيداً هذا الفصل ويهتم بتقديم عمله بإتقان. القراءة كل مساء ستعزز هذا التقدم.", arF: "أحرزت {name} تقدماً جيداً هذا الفصل وتهتم بتقديم عملها بإتقان. القراءة كل مساء ستعزز هذا التقدم." },
  { band: "good", en: "{name} works well with others and is growing in independence. Asking questions in class more often will help even further.", ar: "يعمل {name} بشكل جيد مع زملائه ويزداد استقلالية. طرح الأسئلة في الحصة بشكل أكبر سيساعده أكثر.", arF: "تعمل {name} بشكل جيد مع زملائها وتزداد استقلالية. طرح الأسئلة في الحصة بشكل أكبر سيساعدها أكثر." },
  { band: "steady", en: "{name} is making steady progress. More careful checking of written work and regular revision will lift results next term.", ar: "يتقدم {name} بثبات. مراجعة الواجبات المكتوبة بعناية والمذاكرة المنتظمة سترفع النتائج في الفصل القادم.", arF: "تتقدم {name} بثبات. مراجعة الواجبات المكتوبة بعناية والمذاكرة المنتظمة سترفع النتائج في الفصل القادم." },
  { band: "steady", en: "{name} is settling into routines well. Completing homework on time and practising times tables at home will make a difference.", ar: "يتأقلم {name} جيداً مع الروتين المدرسي. إنجاز الواجبات في وقتها والتدرب في المنزل سيحدث فرقاً واضحاً.", arF: "تتأقلم {name} جيداً مع الروتين المدرسي. إنجاز الواجبات في وقتها والتدرب في المنزل سيحدث فرقاً واضحاً." },
  { band: "support", en: "{name} has found some topics challenging this term. Short daily practice at home and asking for help early will make a real difference; we'll keep supporting in class.", ar: "وجد {name} بعض الموضوعات صعبة هذا الفصل. التدرب اليومي القصير في المنزل وطلب المساعدة مبكراً سيصنعان فرقاً حقيقياً، وسنواصل الدعم في الفصل.", arF: "وجدت {name} بعض الموضوعات صعبة هذا الفصل. التدرب اليومي القصير في المنزل وطلب المساعدة مبكراً سيصنعان فرقاً حقيقياً، وسنواصل الدعم في الفصل." },
  { band: "support", en: "{name} is capable of more and we'd like to see greater focus in lessons. Let's work together on a simple plan for next term.", ar: "لدى {name} قدرات أكبر، ونأمل أن نرى تركيزاً أكثر في الحصص. لنعمل معاً على خطة بسيطة للفصل القادم.", arF: "لدى {name} قدرات أكبر، ونأمل أن نرى تركيزاً أكثر في الحصص. لنعمل معاً على خطة بسيطة للفصل القادم." },
];

export const PRINCIPAL_BANK = [
  { min: 85, en: "An outstanding term. Congratulations, {name}!", ar: "فصل متميز. تهانينا يا {name}!", arF: "فصل متميز. تهانينا يا {name}!" },
  { min: 72, en: "A good term with clear progress. Well done, {name}.", ar: "فصل جيد بتقدم واضح. أحسنتَ يا {name}.", arF: "فصل جيد بتقدم واضح. أحسنتِ يا {name}." },
  { min: 60, en: "Steady work this term. Keep going, {name}.", ar: "عمل ثابت هذا الفصل. واصِل يا {name}.", arF: "عمل ثابت هذا الفصل. واصِلي يا {name}." },
  { min: 0, en: "We believe in you, {name}. Let's make next term your best yet.", ar: "نحن نثق بكَ يا {name}. لنجعل الفصل القادم أفضل فصولك.", arF: "نحن نثق بكِ يا {name}. لنجعل الفصل القادم أفضل فصولكِ." },
];

export function bandOf(avg: number | null): (typeof COMMENT_BANK)[number]["band"] {
  if (avg == null) return "steady";
  return avg >= 85 ? "high" : avg >= 72 ? "good" : avg >= 60 ? "steady" : "support";
}

/** Arabic comments agree with the child's gender. */
export function suggestComments(avg: number | null, firstName: string, locale: "en" | "ar", gender: string) {
  const band = bandOf(avg);
  return COMMENT_BANK.filter((c) => c.band === band).map((c) => (locale === "ar" ? (gender === "f" ? c.arF : c.ar) : c.en).replaceAll("{name}", firstName));
}

export function principalLine(avg: number | null, firstName: string, locale: "en" | "ar", gender: string) {
  const line = PRINCIPAL_BANK.find((p) => (avg ?? 0) >= p.min)!;
  return (locale === "ar" ? (gender === "f" ? line.arF : line.ar) : line.en).replaceAll("{name}", firstName);
}
