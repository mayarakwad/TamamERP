// What a new school starts with: grades KG1–12, the usual subjects in Qatar's
// private schools, the current academic year with three terms, and the ledger.
// No server-only imports: setup, signup and the seed all call this.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { ensureSchoolLedger } from "../ledger/chart";
import { DEFAULT_SCHOOL_SETTINGS, stageOf, type Stage } from "./settings";

type Db = PrismaClient | Prisma.TransactionClient;

const ORDINAL_AR = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر"];

export const DEFAULT_GRADES = [
  { level: -1, name: "KG1", nameAr: "الروضة الأولى" },
  { level: 0, name: "KG2", nameAr: "الروضة الثانية" },
  ...Array.from({ length: 12 }, (_, i) => ({ level: i + 1, name: `Grade ${i + 1}`, nameAr: `الصف ${ORDINAL_AR[i]}` })),
].map((g) => ({ ...g, stage: stageOf(g.level) }));

export const DEFAULT_SUBJECTS = [
  { code: "ENG", name: "English", nameAr: "اللغة الإنجليزية", color: "#2F7DB8" },
  { code: "ARB", name: "Arabic", nameAr: "اللغة العربية", color: "#1F7A4D" },
  { code: "MATH", name: "Mathematics", nameAr: "الرياضيات", color: "#8E5CC9" },
  { code: "SCI", name: "Science", nameAr: "العلوم", color: "#0B8A7A" },
  { code: "ISL", name: "Islamic Studies", nameAr: "التربية الإسلامية", color: "#2E9E6B" },
  { code: "QH", name: "Qatar History", nameAr: "تاريخ قطر", color: "#8A1538" },
  { code: "ICT", name: "Computing", nameAr: "الحاسوب", color: "#5A6B7A" },
  { code: "FR", name: "French", nameAr: "اللغة الفرنسية", color: "#3B5BDB" },
  { code: "PE", name: "Physical Education", nameAr: "التربية البدنية", color: "#D9644A" },
  { code: "ART", name: "Art", nameAr: "التربية الفنية", color: "#C4467A" },
  { code: "MUS", name: "Music", nameAr: "الموسيقى", color: "#A86B00" },
];

/** Periods per week for each subject, by stage. Every stage adds up to 40 (8 periods × 5 days). */
export const CURRICULUM: Record<Stage, Record<string, number>> = {
  kg: { ENG: 9, ARB: 8, MATH: 7, SCI: 3, ISL: 3, ART: 4, MUS: 2, PE: 4 },
  primary: { ENG: 7, ARB: 6, MATH: 7, SCI: 5, ISL: 3, QH: 2, ICT: 2, PE: 3, ART: 3, MUS: 2 },
  middle: { ENG: 6, ARB: 5, MATH: 6, SCI: 6, ISL: 3, QH: 2, ICT: 3, PE: 3, ART: 2, FR: 4 },
  secondary: { ENG: 6, ARB: 5, MATH: 7, SCI: 8, ISL: 3, QH: 2, ICT: 3, PE: 2, FR: 4 },
};

/** Subjects best taught in the morning (the timetable auto-fill puts them first). */
export const CORE_SUBJECTS = new Set(["ENG", "ARB", "MATH", "SCI"]);

/** The academic year a date falls in: August to July. */
export function academicYearOf(date: Date) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(date);
  const [y, m] = ymd.split("-").map(Number);
  const start = m >= 8 ? y : y - 1;
  return { startYear: start, name: `${start}–${String(start + 1).slice(2)}` };
}

const noon = (s: string) => new Date(`${s}T12:00:00+03:00`);

/** Dates of the year and its three terms. */
export function yearPlan(startYear: number) {
  const y = startYear;
  return {
    name: `${y}–${String(y + 1).slice(2)}`,
    startDate: noon(`${y}-08-01`),
    endDate: noon(`${y + 1}-07-31`),
    terms: [
      { sort: 1, name: "Term 1", nameAr: "الفصل الأول", startDate: noon(`${y}-08-23`), endDate: noon(`${y}-12-17`) },
      { sort: 2, name: "Term 2", nameAr: "الفصل الثاني", startDate: noon(`${y + 1}-01-04`), endDate: noon(`${y + 1}-03-26`) },
      { sort: 3, name: "Term 3", nameAr: "الفصل الثالث", startDate: noon(`${y + 1}-04-12`), endDate: noon(`${y + 1}-06-25`) },
    ],
  };
}

export async function createYear(db: Db, orgId: string, startYear: number, current: boolean) {
  const plan = yearPlan(startYear);
  if (current) await db.academicYear.updateMany({ where: { orgId }, data: { current: false } });
  return db.academicYear.create({
    data: { orgId, name: plan.name, startDate: plan.startDate, endDate: plan.endDate, current, terms: { create: plan.terms.map((t) => ({ ...t, orgId })) } },
    include: { terms: { orderBy: { sort: "asc" } } },
  });
}

/** Everything a school workspace needs before anyone adds a student. Safe to call repeatedly. */
export async function ensureSchoolDefaults(db: Db, orgId: string, now = new Date()) {
  await ensureSchoolLedger(db, orgId);
  if (!(await db.grade.count({ where: { orgId } }))) {
    await db.grade.createMany({ data: DEFAULT_GRADES.map((g) => ({ ...g, orgId })) });
  }
  if (!(await db.subject.count({ where: { orgId } }))) {
    await db.subject.createMany({ data: DEFAULT_SUBJECTS.map((s, i) => ({ ...s, orgId, sort: i })) });
  }
  if (!(await db.academicYear.count({ where: { orgId } }))) {
    await createYear(db, orgId, academicYearOf(now).startYear, true);
  }
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { settings: true } });
  const settings = (org.settings && typeof org.settings === "object" ? org.settings : {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (!settings.school) patch.school = DEFAULT_SCHOOL_SETTINGS;
  if (!settings.fiscalYearStartMonth) patch.fiscalYearStartMonth = 8;
  if (Object.keys(patch).length) {
    await db.organization.update({ where: { id: orgId }, data: { settings: { ...settings, ...patch } as Prisma.InputJsonValue } });
  }
}
