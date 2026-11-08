// School settings kept in Organization.settings.school, with sensible defaults
// for a private school in Qatar. No server-only imports: pages, actions and the
// seed all read them.

export interface Period {
  start: string;
  end: string;
}

export interface Installment {
  label: string;
  labelAr: string;
  /** "MM-DD"; the year comes from the academic year (Aug–Dec → start year, Jan–Jul → end year) */
  due: string;
  /** Share of tuition and transport, in percent */
  pct: number;
}

export interface GradeBand {
  /** Lowest percentage for this band */
  min: number;
  letter: string;
  label: string;
  labelAr: string;
}

export interface SchoolSettings {
  /** Teaching periods in order */
  periods: Period[];
  /** Breaks after a period number */
  breaks: { after: number; label: string; labelAr: string }[];
  /** School days, 0 = Sunday */
  days: number[];
  /** Roll call should be done by this time (Doha) */
  rollBy: string;
  installments: Installment[];
  /** Tuition discount by child order in a family, basis points: [first, second, third, fourth+] */
  sibling: number[];
  /** Tuition discount for children of staff, basis points */
  staffDiscount: number;
  scale: GradeBand[];
  passMark: number;
  /** Library loan length in days */
  loanDays: number;
  /** Families can apply online at /apply/[slug] */
  admissionsOpen: boolean;
  /** Printed at the bottom of fee invoices */
  feeTerms?: string;
}

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  periods: [
    { start: "07:15", end: "08:00" },
    { start: "08:00", end: "08:45" },
    { start: "08:45", end: "09:30" },
    { start: "09:50", end: "10:35" },
    { start: "10:35", end: "11:20" },
    { start: "11:20", end: "12:05" },
    { start: "12:35", end: "13:20" },
    { start: "13:20", end: "14:05" },
  ],
  breaks: [
    { after: 3, label: "Break", labelAr: "استراحة" },
    { after: 6, label: "Lunch", labelAr: "الغداء" },
  ],
  days: [0, 1, 2, 3, 4],
  rollBy: "08:30",
  installments: [
    { label: "Term 1", labelAr: "الفصل الأول", due: "08-15", pct: 40 },
    { label: "Term 2", labelAr: "الفصل الثاني", due: "12-01", pct: 30 },
    { label: "Term 3", labelAr: "الفصل الثالث", due: "03-01", pct: 30 },
  ],
  sibling: [0, 500, 1000, 1500],
  staffDiscount: 5000,
  scale: [
    { min: 90, letter: "A", label: "Excellent", labelAr: "ممتاز" },
    { min: 80, letter: "B", label: "Very good", labelAr: "جيد جداً" },
    { min: 70, letter: "C", label: "Good", labelAr: "جيد" },
    { min: 60, letter: "D", label: "Satisfactory", labelAr: "مقبول" },
    { min: 0, letter: "F", label: "Needs improvement", labelAr: "يحتاج إلى تحسين" },
  ],
  passMark: 60,
  loanDays: 14,
  admissionsOpen: true,
};

export function schoolSettings(org: { settings: unknown }): SchoolSettings {
  const raw = org.settings && typeof org.settings === "object" ? (org.settings as { school?: Partial<SchoolSettings> }).school : undefined;
  return { ...DEFAULT_SCHOOL_SETTINGS, ...(raw ?? {}) };
}

/** Grade band for a percentage. */
export function bandFor(scale: GradeBand[], pct: number | null): GradeBand | null {
  if (pct == null) return null;
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.find((b) => pct >= b.min) ?? sorted[sorted.length - 1] ?? null;
}

/** Due date of an installment within an academic year that starts in `startYear`. */
export function installmentDue(inst: Installment, startYear: number): Date {
  const [m, d] = inst.due.split("-").map(Number);
  const year = m >= 8 ? startYear : startYear + 1;
  return new Date(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00+03:00`);
}

/** "5-B", "KG1-A": how a class is written everywhere. */
export function sectionLabel(grade: { level: number; name: string }, name: string) {
  const short = grade.level <= 0 ? grade.name.replace(/\s+/g, "") : String(grade.level);
  return `${short}-${name}`;
}

export function sectionLabelAr(grade: { level: number; name: string; nameAr: string | null }, name: string) {
  const short = grade.level <= 0 ? (grade.level === -1 ? "روضة1" : "روضة2") : String(grade.level);
  return `${short}-${arLetter(name)}`;
}

const AR_LETTERS: Record<string, string> = { A: "أ", B: "ب", C: "ج", D: "د", E: "هـ", F: "و" };
const arLetter = (s: string) => AR_LETTERS[s] ?? s;

export const sectionName = (locale: "en" | "ar", grade: { level: number; name: string; nameAr: string | null }, name: string) =>
  locale === "ar" ? sectionLabelAr(grade, name) : sectionLabel(grade, name);

export const STAGES = ["kg", "primary", "middle", "secondary"] as const;
export type Stage = (typeof STAGES)[number];

export const stageOf = (level: number): Stage => (level <= 0 ? "kg" : level <= 5 ? "primary" : level <= 8 ? "middle" : "secondary");

export const FEE_COMPONENTS = ["tuition", "books", "registration"] as const;
export type FeeComponent = (typeof FEE_COMPONENTS)[number];

export const APPLICATION_STAGES = ["applied", "assessment", "offered", "enrolled"] as const;
export const APPLICATION_CLOSED = ["declined", "withdrawn"] as const;

export const ASSESSMENT_KINDS = ["exam", "quiz", "assignment", "project"] as const;

export const RELATIONS = ["father", "mother", "guardian", "grandparent", "other"] as const;

/** Nationalities offered first in pickers (ISO 3166 alpha-2). */
export const NATIONALITIES = ["QA", "SA", "KW", "BH", "OM", "AE", "JO", "LB", "SY", "PS", "IQ", "YE", "EG", "SD", "LY", "TN", "DZ", "MA", "IN", "PK", "BD", "LK", "NP", "PH", "ID", "MY", "TR", "IR", "GB", "IE", "FR", "DE", "IT", "ES", "NL", "US", "CA", "AU", "NZ", "ZA", "KE", "NG", "ET", "RU", "CN"];
