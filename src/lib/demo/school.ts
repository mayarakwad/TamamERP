// Al Manara International School: three campuses, about 690 students from
// 420 families, a hundred staff, full timetables, and everything that happens
// in a term: rolls, marks, fees, buses and library loans.
//
// Bulk rows go in with createMany (fast); anything that touches the ledger
// goes through the same functions the app uses, so the books balance.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { createYear, CORE_SUBJECTS, CURRICULUM, ensureSchoolDefaults } from "../school/defaults";
import { DEFAULT_SCHOOL_SETTINGS, stageOf } from "../school/settings";
import { autoFill, busyIndex, type SlotLite } from "../school/timetable";
import { makeIban } from "../payroll/banks";
import { dohaNoon } from "../hr/ops";
import { BLOOD_GROUPS, CULTURE_MIX, EMPLOYERS, MEDICAL_NOTES, POOLS, type Culture } from "./school-names";
import { rng, type Rng } from "./random";
import { seedSchoolLife } from "./school-life";
import { seedSchoolMoney } from "./school-money";
import { seedSchoolExtras } from "./school-extras";

type Db = PrismaClient | Prisma.TransactionClient;
const DAY = 86400_000;
const q = (riyals: number) => Math.round(riyals * 100);

let idSeq = 0;
/** Ids made here so related rows can be inserted in bulk. */
export const cid = () => `cs${(++idSeq).toString(36).padStart(6, "0")}${Math.random().toString(36).slice(2, 10)}`;

export interface SchoolUsers {
  fatima: string;
  sarah: string;
  rami: string;
  aisha: string;
  hessa: string;
  khalid: string;
  yousef: string;
}

export type CampusKey = "WAB" | "LUS" | "WAK";

/** Grades each campus runs and how many classes per grade. */
const CAMPUS_PLAN: Record<CampusKey, { levels: [number, number]; double: number[] }> = {
  WAB: { levels: [-1, 12], double: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8] },
  LUS: { levels: [-1, 8], double: [1, 2] },
  WAK: { levels: [-1, 5], double: [] },
};

const AVATAR_COLORS = ["#4B3FA8", "#0B6E8A", "#B5541C", "#1F7A4D", "#8A1538", "#2F7DB8", "#A86B00", "#C4467A", "#5A6B7A", "#8E5CC9", "#D9644A", "#0B8A7A"];

function pickWeighted<T>(r: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r.next() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
}

const phone = (r: Rng) => `+974 ${r.pick(["3", "5", "6", "7"])}${r.int(100, 999)} ${r.int(1000, 9999)}`;
const slug = (s: string) => s.toLowerCase().replace(/^al-/, "al").replace(/[^a-z]/g, "");

/** 11-digit Qatar ID: century digit, birth year, nationality code, serial. */
export function qidFor(r: Rng, birthYear: number, nat: string) {
  const codes: Record<string, string> = { QA: "634", SA: "682", KW: "414", BH: "048", OM: "512", AE: "784", JO: "400", LB: "422", SY: "760", PS: "275", EG: "818", SD: "729", IN: "356", PK: "586", BD: "050", LK: "144", GB: "826", IE: "372", ZA: "710", US: "840", CA: "124", AU: "036", NZ: "554", FR: "250", PH: "608", TN: "788", MA: "504", DZ: "012", KE: "404", NP: "524" };
  const century = birthYear >= 2000 ? "3" : "2";
  return `${century}${String(birthYear % 100).padStart(2, "0")}${codes[nat] ?? "999"}${String(r.int(10000, 99999))}`;
}

export async function seedSchoolDemo(db: Db, orgId: string, users: SchoolUsers, campusIds: Record<CampusKey, string>, now = new Date()) {
  const r = rng(2026);
  await ensureSchoolDefaults(db, orgId, now);
  const year = await db.academicYear.findFirstOrThrow({ where: { orgId, current: true }, include: { terms: { orderBy: { sort: "asc" } } } });
  const startYear = year.startDate.getUTCFullYear();
  const nextYear = await createYear(db, orgId, startYear + 1, false);
  const lastYear = await createYear(db, orgId, startYear - 1, false);
  const grades = await db.grade.findMany({ where: { orgId }, orderBy: { level: "asc" } });
  const gradeByLevel = new Map(grades.map((g) => [g.level, g]));
  const subjects = await db.subject.findMany({ where: { orgId } });
  const subjectByCode = new Map(subjects.map((s) => [s.code, s]));

  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  await db.organization.update({
    where: { id: orgId },
    data: {
      crNumber: "MoEHE-PS-0417",
      settings: JSON.parse(JSON.stringify({
        ...(org.settings as object),
        fiscalYearStartMonth: 8,
        school: { ...DEFAULT_SCHOOL_SETTINGS, feeTerms: "Fees are payable by the due date by bank transfer, card at the school office, or cheque payable to Al Manara International School. A place is held only while fees are paid up." },
        sales: { bankName: "Commercial Bank of Qatar, Al Waab branch", iban: makeIban("QA", "CBQA000000004620019838001") },
        payroll: { employerEid: "10662718", bankShortName: "CBQ", iban: makeIban("QA", "CBQA000000004620019838001") },
      })) as Prisma.InputJsonValue,
    },
  });

  // ── Classes ──
  type SectionRow = { id: string; campus: CampusKey; level: number; name: string; capacity: number; target: number };
  const sections: SectionRow[] = [];
  const roomNo: Record<CampusKey, number> = { WAB: 100, LUS: 100, WAK: 100 };
  for (const campus of ["WAB", "LUS", "WAK"] as CampusKey[]) {
    const plan = CAMPUS_PLAN[campus];
    for (let level = plan.levels[0]; level <= plan.levels[1]; level++) {
      const letters = plan.double.includes(level) ? ["A", "B"] : ["A"];
      for (const name of letters) {
        const capacity = level <= 0 ? 20 : 24;
        sections.push({ id: cid(), campus, level, name, capacity, target: Math.min(capacity, r.int(level <= 0 ? 13 : 14, level <= 0 ? 18 : 21)) });
      }
    }
  }
  // Grade 5-B at Al Waab is Aisha's class; 7-A has Ahmed; keep them comfortably full.
  const find = (campus: CampusKey, level: number, name: string) => sections.find((s) => s.campus === campus && s.level === level && s.name === name)!;
  find("WAB", 5, "B").target = 19;
  find("WAB", 7, "A").target = 20;

  // ── Buses (riders are assigned with the students) ──
  const routes = await seedRoutes(db, orgId, campusIds, r);

  // ── Staff ──
  const staff = await seedStaff(db, orgId, users, campusIds, sections, subjectByCode, r, now);

  await db.section.createMany({
    data: sections.map((s) => ({
      id: s.id,
      orgId,
      yearId: year.id,
      campusId: campusIds[s.campus],
      gradeId: gradeByLevel.get(s.level)!.id,
      name: s.name,
      room: `${s.campus === "WAB" ? (s.level <= 0 ? "K" : s.level <= 5 ? "P" : "S") : s.campus === "LUS" ? "L" : "W"}-${++roomNo[s.campus]}`,
      capacity: s.capacity,
      homeroomId: staff.homeroom.get(s.id) ?? null,
    })),
  });
  await db.teachingAssignment.createMany({ data: staff.assignments.map((a) => ({ ...a, id: cid(), orgId })) });

  // Timetables: every class, every period, no teacher in two rooms at once.
  const all: SlotLite[] = [];
  const busy = busyIndex(all);
  const morning = new Set([...CORE_SUBJECTS].map((c) => subjectByCode.get(c)!.id));
  let unplaced = 0;
  for (const s of sections) {
    const mine = staff.assignments.filter((a) => a.sectionId === s.id).map((a) => ({ subjectId: a.subjectId, teacherId: a.teacherId, periods: a.periods }));
    const res = autoFill(s.id, mine, all, [0, 1, 2, 3, 4], DEFAULT_SCHOOL_SETTINGS.periods.length, morning, busy);
    all.push(...res.placed);
    unplaced += res.unplaced;
  }
  await db.timetableSlot.createMany({ data: all.map((x) => ({ id: cid(), orgId, sectionId: x.sectionId, day: x.day, period: x.period, subjectId: x.subjectId, teacherId: x.teacherId })) });

  // ── Families and students ──
  const people = await seedFamilies(db, orgId, users, campusIds, sections, gradeByLevel, routes, staff.staffParents, r, now, startYear);

  // ── A term of school life, the money, and the rest ──
  const ctx = { orgId, year, nextYear, lastYear, sections, campusIds, grades, gradeByLevel, subjects, subjectByCode, staff, people, routes, users, now, startYear };
  await seedSchoolLife(db, ctx, r);
  await seedSchoolMoney(db, ctx, r);
  await seedSchoolExtras(db, ctx, r);
  return { unplaced, students: people.students.length, staff: staff.count };
}

export type SchoolSeedCtx = {
  orgId: string;
  year: { id: string; startDate: Date; endDate: Date; terms: { id: string; sort: number; name: string; nameAr: string | null; startDate: Date; endDate: Date }[] };
  nextYear: { id: string; terms: { id: string }[] };
  lastYear: { id: string; name: string; terms: { id: string; sort: number; name: string; nameAr: string | null; startDate: Date; endDate: Date }[] };
  sections: { id: string; campus: CampusKey; level: number; name: string; capacity: number }[];
  campusIds: Record<CampusKey, string>;
  grades: { id: string; level: number; name: string; nameAr: string | null }[];
  gradeByLevel: Map<number, { id: string; level: number; name: string; nameAr: string | null }>;
  subjects: { id: string; code: string; name: string; nameAr: string | null }[];
  subjectByCode: Map<string, { id: string; code: string; name: string; nameAr: string | null }>;
  staff: Awaited<ReturnType<typeof seedStaff>>;
  people: Awaited<ReturnType<typeof seedFamilies>>;
  routes: Awaited<ReturnType<typeof seedRoutes>>;
  users: SchoolUsers;
  now: Date;
  startYear: number;
};

// ───────────────────────── Transport ─────────────────────────

const ROUTES: { campus: CampusKey; code: string; name: string; nameAr: string; fee: number; capacity: number; stops: [string, string][] }[] = [
  { campus: "WAB", code: "Bus 1", name: "Aspire – Al Waab", nameAr: "أسباير – الوعب", fee: 6500, capacity: 30, stops: [["Aspire Zone", "أسباير"], ["Al Aziziya", "العزيزية"], ["Al Waab Street", "شارع الوعب"], ["Villaggio", "فيلاجيو"]] },
  { campus: "WAB", code: "Bus 2", name: "Al Sadd – Bin Mahmoud", nameAr: "السد – بن محمود", fee: 6500, capacity: 30, stops: [["Al Sadd", "السد"], ["Fereej Bin Mahmoud", "فريج بن محمود"], ["Al Muntazah", "المنتزه"], ["Najma", "نجمة"]] },
  { campus: "WAB", code: "Bus 3", name: "Gharrafa – Al Rayyan", nameAr: "الغرافة – الريان", fee: 7000, capacity: 30, stops: [["Al Gharrafa", "الغرافة"], ["Al Rayyan", "الريان"], ["Muaither", "معيذر"], ["Fereej Al Soudan", "فريج السودان"]] },
  { campus: "WAB", code: "Bus 4", name: "West Bay – The Pearl", nameAr: "الخليج الغربي – اللؤلؤة", fee: 7500, capacity: 26, stops: [["The Pearl", "اللؤلؤة"], ["West Bay", "الخليج الغربي"], ["Corniche", "الكورنيش"], ["Al Dafna", "الدفنة"]] },
  { campus: "WAB", code: "Bus 5", name: "Abu Hamour – Ain Khaled", nameAr: "أبو هامور – عين خالد", fee: 6500, capacity: 30, stops: [["Abu Hamour", "أبو هامور"], ["Ain Khaled", "عين خالد"], ["Al Thumama", "الثمامة"], ["Old Airport", "المطار القديم"]] },
  { campus: "WAB", code: "Bus 6", name: "Madinat Khalifa – Duhail", nameAr: "مدينة خليفة – الدحيل", fee: 7000, capacity: 30, stops: [["Duhail", "الدحيل"], ["Madinat Khalifa", "مدينة خليفة"], ["Al Markhiya", "المرخية"], ["Fereej Kulaib", "فريج كليب"]] },
  { campus: "LUS", code: "Bus 7", name: "Lusail Marina – Fox Hills", nameAr: "مارينا لوسيل – فوكس هيلز", fee: 6500, capacity: 30, stops: [["Lusail Marina", "مارينا لوسيل"], ["Fox Hills", "فوكس هيلز"], ["Al Erkyah", "العركية"], ["Lusail Boulevard", "بوليفارد لوسيل"]] },
  { campus: "LUS", code: "Bus 8", name: "The Pearl – Al Wasmia", nameAr: "اللؤلؤة – الوسمية", fee: 6500, capacity: 30, stops: [["Porto Arabia", "بورتو أرابيا"], ["Viva Bahriya", "فيفا بحرية"], ["Al Wasmia", "الوسمية"], ["Qetaifan", "قطيفان"]] },
  { campus: "LUS", code: "Bus 9", name: "Al Kheesa – Umm Salal", nameAr: "الخيسة – أم صلال", fee: 7000, capacity: 30, stops: [["Umm Salal Ali", "أم صلال علي"], ["Al Kheesa", "الخيسة"], ["Al Ebb", "العب"], ["Leabaib", "لعبيب"]] },
  { campus: "LUS", code: "Bus 10", name: "Al Dafna – Onaiza", nameAr: "الدفنة – عنيزة", fee: 7000, capacity: 30, stops: [["Onaiza", "عنيزة"], ["Al Dafna", "الدفنة"], ["Katara", "كتارا"], ["Legtaifiya", "لقطيفية"]] },
  { campus: "WAK", code: "Bus 11", name: "Al Wakra – Al Wukair", nameAr: "الوكرة – الوكير", fee: 6000, capacity: 30, stops: [["Al Wukair", "الوكير"], ["Al Wakra Souq", "سوق الوكرة"], ["Barwa City", "مدينة بروة"], ["Al Wakra Corniche", "كورنيش الوكرة"]] },
  { campus: "WAK", code: "Bus 12", name: "Mesaimeer – Ezdan", nameAr: "مسيمير – إزدان", fee: 6000, capacity: 30, stops: [["Mesaimeer", "مسيمير"], ["Ezdan Village", "قرية إزدان"], ["Al Meshaf", "المشاف"], ["Abu Hamour South", "جنوب أبو هامور"]] },
];

const DRIVERS = [["Rajesh Kumar", "راجيش كومار"], ["Mohammed Aslam", "محمد أسلم"], ["Peter Otieno", "بيتر أوتيينو"], ["Suresh Babu", "سوريش بابو"], ["Imran Ali", "عمران علي"], ["Joseph Kariuki", "جوزيف كاريوكي"], ["Anil Thapa", "أنيل ثابا"], ["Shafiq Rahman", "شفيق رحمن"], ["Ramon Villanueva", "رامون فيلانويفا"], ["Babu Varghese", "بابو فارغيس"], ["Kamal Hossain", "كمال حسين"], ["Dawit Bekele", "داويت بيكيلي"]] as const;
const ATTENDANTS = [["Mary Wanjiku", "ماري وانجيكو"], ["Rosalie Santos", "روزالي سانتوس"], ["Fatima Bibi", "فاطمة بيبي"], ["Grace Achieng", "غريس أشينغ"], ["Lorna Reyes", "لورنا رييس"], ["Shanthi Devi", "شانتي ديفي"], ["Joy Mendoza", "جوي ميندوزا"], ["Esther Mwangi", "إستر موانجي"], ["Aileen Cruz", "آيلين كروز"], ["Sunita Rai", "سونيتا راي"], ["Mercy Njeri", "ميرسي نجيري"], ["Liza Ramos", "ليزا راموس"]] as const;

async function seedRoutes(db: Db, orgId: string, campusIds: Record<CampusKey, string>, r: Rng) {
  const out: { id: string; campus: CampusKey; code: string; capacity: number; fee: number; stops: { id: string; sort: number }[] }[] = [];
  const colors = ["#F2B705", "#2F7DB8", "#1F7A4D", "#D9644A", "#8E5CC9", "#0B8A7A", "#C4467A", "#A86B00", "#4B3FA8", "#5A6B7A", "#B5541C", "#0B6E8A"];
  for (const [i, def] of ROUTES.entries()) {
    const id = cid();
    const startMin = 6 * 60 + r.int(5, 20);
    const stops = def.stops.map(([name, nameAr], k) => {
      const pick = startMin + k * r.int(7, 11);
      const drop = 14 * 60 + 15 + (def.stops.length - 1 - k) * r.int(7, 10);
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return { id: cid(), orgId, routeId: id, name, nameAr, sort: k, pickup: hhmm(pick), dropoff: hhmm(drop) };
    });
    await db.busRoute.create({
      data: {
        id,
        orgId,
        campusId: campusIds[def.campus],
        code: def.code,
        name: def.name,
        nameAr: def.nameAr,
        driverName: DRIVERS[i][0],
        driverPhone: phone(r),
        attendantName: ATTENDANTS[i][0],
        attendantPhone: phone(r),
        plate: `${r.int(100000, 999999)}`,
        capacity: def.capacity,
        annualFee: q(def.fee),
        color: colors[i],
      },
    });
    await db.busStop.createMany({ data: stops });
    out.push({ id, campus: def.campus, code: def.code, capacity: def.capacity, fee: q(def.fee), stops: stops.map((s) => ({ id: s.id, sort: s.sort })) });
  }
  return out;
}

// ───────────────────────── Staff ─────────────────────────

interface Bundle {
  sectionId: string;
  subjectIds: string[];
  periods: number;
}

type Pool = "homeroom" | "arabicLower" | "arabicUpper" | "islamicUpper" | "english" | "maths" | "science" | "ict" | "pe" | "art" | "music" | "french";

const POOL_TITLES: Record<Pool, [string, string, string]> = {
  homeroom: ["Class teacher", "معلم فصل", "Primary"],
  arabicLower: ["Arabic & Islamic teacher", "معلم اللغة العربية والتربية الإسلامية", "Arabic & Islamic"],
  arabicUpper: ["Arabic teacher", "معلم اللغة العربية", "Arabic & Islamic"],
  islamicUpper: ["Islamic Studies & Qatar History teacher", "معلم التربية الإسلامية وتاريخ قطر", "Arabic & Islamic"],
  english: ["English teacher", "معلم اللغة الإنجليزية", "English"],
  maths: ["Mathematics teacher", "معلم الرياضيات", "Mathematics"],
  science: ["Science teacher", "معلم العلوم", "Science"],
  ict: ["Computing teacher", "معلم الحاسوب", "Computing"],
  pe: ["PE teacher", "معلم التربية البدنية", "PE"],
  art: ["Art teacher", "معلم التربية الفنية", "Arts"],
  music: ["Music teacher", "معلم الموسيقى", "Arts"],
  french: ["French teacher", "معلم اللغة الفرنسية", "Languages"],
};

/** Who tends to teach what (keeps the staff list believable). */
const POOL_CULTURES: Record<Pool, Culture[]> = {
  homeroom: ["western", "western", "southAsia", "philippines", "levant", "western"],
  arabicLower: ["egypt", "levant", "gulf", "maghreb"],
  arabicUpper: ["egypt", "levant", "gulf"],
  islamicUpper: ["egypt", "gulf", "levant"],
  english: ["western", "western", "southAsia"],
  maths: ["southAsia", "western", "egypt", "levant"],
  science: ["southAsia", "western", "levant", "egypt"],
  ict: ["southAsia", "philippines", "levant"],
  pe: ["western", "maghreb", "levant", "southAsia"],
  art: ["western", "philippines", "levant"],
  music: ["western", "philippines"],
  french: ["maghreb", "western"],
};

function poolFor(level: number, code: string): Pool {
  const lower = level <= 5;
  if (lower && ["ENG", "MATH", "SCI"].includes(code)) return "homeroom";
  if (level <= 0 && code === "ART") return "homeroom";
  if (lower && ["ARB", "ISL", "QH"].includes(code)) return "arabicLower";
  if (code === "ARB") return "arabicUpper";
  if (code === "ISL" || code === "QH") return "islamicUpper";
  return ({ ENG: "english", MATH: "maths", SCI: "science", ICT: "ict", PE: "pe", ART: "art", MUS: "music", FR: "french" } as Record<string, Pool>)[code];
}

const MAX_LOAD = 26;

async function seedStaff(
  db: Db,
  orgId: string,
  users: SchoolUsers,
  campusIds: Record<CampusKey, string>,
  sections: { id: string; campus: CampusKey; level: number; name: string }[],
  subjectByCode: Map<string, { id: string }>,
  r: Rng,
  now: Date,
) {
  type T = { id: string; campus: CampusKey; pool: Pool; load: number; userKey?: keyof SchoolUsers };
  const teachers: T[] = [];
  const assignments: { sectionId: string; subjectId: string; teacherId: string; periods: number }[] = [];
  const homeroom = new Map<string, string>();

  for (const campus of ["WAB", "LUS", "WAK"] as CampusKey[]) {
    const mine = sections.filter((s) => s.campus === campus);
    // Bundles: one per class per pool (a class teacher takes English, maths and science together).
    const bundles = new Map<string, Bundle & { pool: Pool }>();
    for (const s of mine) {
      for (const [code, periods] of Object.entries(CURRICULUM[stageOf(s.level)])) {
        const pool = poolFor(s.level, code);
        const key = `${s.id}|${pool}`;
        const b = bundles.get(key) ?? { sectionId: s.id, subjectIds: [], periods: 0, pool };
        b.subjectIds.push(subjectByCode.get(code)!.id);
        b.periods += periods;
        bundles.set(key, b);
      }
    }
    // Class teachers: one per lower-school class.
    for (const b of [...bundles.values()].filter((b) => b.pool === "homeroom")) {
      const t: T = { id: cid(), campus, pool: "homeroom", load: b.periods };
      teachers.push(t);
      homeroom.set(b.sectionId, t.id);
      for (const subjectId of b.subjectIds) assignments.push({ sectionId: b.sectionId, subjectId, teacherId: t.id, periods: 0 });
    }
    // Specialists: fill each teacher up to a full load before hiring the next.
    for (const b of [...bundles.values()].filter((b) => b.pool !== "homeroom").sort((a, z) => a.pool.localeCompare(z.pool) || z.periods - a.periods)) {
      let t = teachers.filter((x) => x.campus === campus && x.pool === b.pool && x.load + b.periods <= MAX_LOAD).sort((a, z) => z.load - a.load)[0];
      if (!t) {
        t = { id: cid(), campus, pool: b.pool, load: 0 };
        teachers.push(t);
      }
      t.load += b.periods;
      for (const subjectId of b.subjectIds) assignments.push({ sectionId: b.sectionId, subjectId, teacherId: t.id, periods: 0 });
    }
  }
  // Periods per assignment from the curriculum.
  const codeById = new Map([...subjectByCode.entries()].map(([code, s]) => [s.id, code]));
  for (const a of assignments) {
    const s = sections.find((x) => x.id === a.sectionId)!;
    a.periods = CURRICULUM[stageOf(s.level)][codeById.get(a.subjectId)!];
  }
  // Upper-school classes get a form tutor from the subject teachers on their campus.
  for (const s of sections.filter((x) => x.level > 5)) {
    const candidates = teachers.filter((t) => t.campus === s.campus && t.pool !== "homeroom" && ![...homeroom.values()].includes(t.id) && assignments.some((a) => a.sectionId === s.id && a.teacherId === t.id));
    if (candidates[0]) homeroom.set(s.id, candidates[0].id);
  }

  // Aisha Rahman is the Grade 5-B class teacher at Al Waab.
  const aishaSection = sections.find((s) => s.campus === "WAB" && s.level === 5 && s.name === "B")!;
  const aisha = teachers.find((t) => t.id === homeroom.get(aishaSection.id))!;
  aisha.userKey = "aisha";

  // ── Office and leadership ──
  const office: { campus: CampusKey | null; title: string; titleAr: string; dept: string; culture?: Culture; name?: [string, string]; nat?: string; userKey?: keyof SchoolUsers; pay: [number, number, number] }[] = [
    { campus: null, title: "Group Director", titleAr: "مديرة المجموعة", dept: "Leadership", name: ["Dr. Fatima Al-Sulaiti", "د. فاطمة السليطي"], nat: "QA", userKey: "fatima", pay: [38000, 12000, 3000] },
    { campus: null, title: "Finance Officer", titleAr: "مسؤول المالية", dept: "Finance", name: ["Rami Khoury", "رامي خوري"], nat: "LB", userKey: "rami", pay: [15000, 5000, 1500] },
    { campus: null, title: "Accounts Assistant", titleAr: "مساعدة حسابات", dept: "Finance", culture: "philippines", pay: [6500, 2000, 800] },
    { campus: null, title: "HR Officer", titleAr: "مسؤولة الموارد البشرية", dept: "Administration", culture: "levant", pay: [11000, 4000, 1000] },
    { campus: null, title: "Transport Coordinator", titleAr: "منسق النقل", dept: "Operations", name: ["Yousef Al-Emadi", "يوسف العمادي"], nat: "QA", userKey: "yousef", pay: [12000, 4000, 1500] },
    { campus: "WAB", title: "Principal, Al Waab", titleAr: "مدير فرع الوعب", dept: "Leadership", name: ["Dr. Hamad Al-Naimi", "د. حمد النعيمي"], nat: "QA", pay: [30000, 10000, 2500] },
    { campus: "WAB", title: "Head of Secondary", titleAr: "رئيسة المرحلة الثانوية", dept: "Leadership", culture: "western", pay: [24000, 8000, 2000] },
    { campus: "WAB", title: "Registrar", titleAr: "مسجلة القبول", dept: "Administration", culture: "levant", pay: [9000, 3500, 1000] },
    { campus: "WAB", title: "School Nurse", titleAr: "ممرضة المدرسة", dept: "Health", culture: "philippines", pay: [8500, 3000, 800] },
    { campus: "WAB", title: "Librarian", titleAr: "أمينة المكتبة", dept: "Library", culture: "southAsia", pay: [8000, 3000, 800] },
    { campus: "WAB", title: "Receptionist", titleAr: "موظفة الاستقبال", dept: "Administration", culture: "philippines", pay: [5000, 1800, 600] },
    { campus: "WAB", title: "IT Technician", titleAr: "فني تقنية المعلومات", dept: "Operations", culture: "southAsia", pay: [7000, 2500, 800] },
    { campus: "LUS", title: "Principal, Lusail", titleAr: "مديرة فرع لوسيل", dept: "Leadership", name: ["Sarah Mitchell", "سارة ميتشل"], nat: "GB", userKey: "sarah", pay: [27000, 9000, 2500] },
    { campus: "LUS", title: "Registrar", titleAr: "مسجل القبول", dept: "Administration", culture: "egypt", pay: [8500, 3000, 900] },
    { campus: "LUS", title: "School Nurse", titleAr: "ممرضة المدرسة", dept: "Health", culture: "southAsia", pay: [8000, 3000, 800] },
    { campus: "LUS", title: "Librarian", titleAr: "أمين المكتبة", dept: "Library", culture: "egypt", pay: [7500, 2800, 800] },
    { campus: "WAK", title: "Principal, Al Wakra", titleAr: "مديرة فرع الوكرة", dept: "Leadership", culture: "levant", pay: [24000, 8000, 2000] },
    { campus: "WAK", title: "Registrar & Receptionist", titleAr: "مسجلة واستقبال", dept: "Administration", culture: "philippines", pay: [6000, 2200, 700] },
    { campus: "WAK", title: "School Nurse", titleAr: "ممرضة المدرسة", dept: "Health", culture: "philippines", pay: [7500, 2800, 800] },
  ];

  const usedNames = new Set<string>();
  const personName = (culture: Culture, female: boolean): { name: string; nameAr: string; nat: string } => {
    const pool = POOLS[culture];
    for (let i = 0; i < 50; i++) {
      const first = r.pick(female ? pool.girls : pool.boys);
      const fam = r.pick(pool.families);
      const mid = pool.patronymic ? r.pick(pool.boys) : null;
      const name = [first[0], mid?.[0], fam[0]].filter(Boolean).join(" ");
      if (usedNames.has(name)) continue;
      usedNames.add(name);
      return { name, nameAr: [first[1], mid?.[1], fam[1]].filter(Boolean).join(" "), nat: r.pick(pool.nationalities) };
    }
    throw new Error("names ran out");
  };

  const rows: Prisma.EmployeeCreateManyInput[] = [];
  const teacherInfo = new Map<string, { name: string; female: boolean }>();
  const staffParents: { employeeId: string; name: string; nameAr: string; nat: string; campus: CampusKey | null; female: boolean }[] = [];
  let n = 0;
  const bankFor = () => r.pick([["QNB", "QNBA"], ["CBQ", "CBQA"], ["DBQ", "DOHB"], ["QIB", "QISB"], ["QIIB", "QIIB"]] as const);
  const employee = (e: { id: string; campus: CampusKey | null; name: string; nameAr: string; nat: string; title: string; titleAr: string; dept: string; pay: [number, number, number]; userKey?: keyof SchoolUsers; joinedYear: number }) => {
    const [code, prefix] = bankFor();
    const birth = 1965 + r.int(0, 30);
    rows.push({
      id: e.id,
      orgId,
      number: `EMP-${String(++n).padStart(3, "0")}`,
      userId: e.userKey ? users[e.userKey] : null,
      name: e.name,
      nameAr: e.nameAr,
      jobTitle: e.title,
      jobTitleAr: e.titleAr,
      department: e.dept,
      campusId: e.campus ? campusIds[e.campus] : null,
      nationality: e.nat,
      phone: phone(r),
      email: `${slug(e.name.split(" ")[0])}.${slug(e.name.split(" ").slice(-1)[0])}@almanara.example`,
      qid: qidFor(r, birth, e.nat),
      qidExpiry: new Date(now.getTime() + r.int(90, 900) * DAY),
      passportNumber: e.nat === "QA" ? null : `${e.nat === "IN" ? "Z" : e.nat === "PH" ? "P" : "N"}${r.int(1000000, 9999999)}`,
      passportExpiry: e.nat === "QA" ? null : new Date(now.getTime() + r.int(200, 2400) * DAY),
      joinedOn: dohaNoon(`${e.joinedYear}-08-${String(r.int(10, 20)).padStart(2, "0")}`),
      basicSalary: q(e.pay[0]),
      housingAllowance: q(e.pay[1]),
      transportAllowance: q(e.pay[2]),
      payMethod: "bank",
      bankShortName: code,
      iban: makeIban("QA", `${prefix}${String(r.int(10000, 99999))}${String(r.int(1000000000, 9999999999))}${String(r.int(100000, 999999))}`),
      annualLeaveDays: 2026 - e.joinedYear >= 5 ? 28 : 21,
    });
  };

  for (const o of office) {
    const female = /a$|ess|Nurse|Registrar|Receptionist|Librarian|Assistant|HR/.test(o.titleAr) || ["Head of Secondary", "School Nurse", "Librarian", "Receptionist", "Accounts Assistant", "HR Officer", "Registrar & Receptionist", "Principal, Al Wakra"].includes(o.title) || o.userKey === "fatima" || o.userKey === "sarah";
    const p = o.name ? { name: o.name[0], nameAr: o.name[1], nat: o.nat! } : personName(o.culture!, female);
    if (o.name) usedNames.add(o.name[0]);
    employee({ id: cid(), campus: o.campus, ...p, title: o.title, titleAr: o.titleAr, dept: o.dept, pay: o.pay, userKey: o.userKey, joinedYear: o.userKey === "fatima" ? 2014 : 2012 + r.int(4, 13) });
  }

  for (const t of teachers) {
    const culture = r.pick(POOL_CULTURES[t.pool]);
    const female = t.pool === "homeroom" ? r.chance(0.85) : r.chance(0.55);
    const p = t.userKey === "aisha" ? { name: "Aisha Rahman", nameAr: "عائشة رحمن", nat: "GB" } : personName(culture, female);
    const [title, titleAr, dept] = POOL_TITLES[t.pool];
    const senior = r.chance(0.3);
    const base = t.pool === "homeroom" ? 11000 : 12500;
    employee({
      id: t.id,
      campus: t.campus,
      ...p,
      title,
      titleAr: female ? titleAr.replace("معلم", "معلمة") : titleAr,
      dept,
      pay: [base + (senior ? 3000 : 0) + r.int(0, 8) * 250, 4500 + (senior ? 1000 : 0), 1000],
      userKey: t.userKey,
      joinedYear: t.userKey === "aisha" ? 2021 : 2014 + r.int(0, 12),
    });
    teacherInfo.set(t.id, { name: p.name, female: t.userKey === "aisha" ? true : female });
    // About one teacher in eight has children at the school (staff discount).
    if (r.chance(0.13) && t.userKey !== "aisha") staffParents.push({ employeeId: t.id, name: p.name, nameAr: p.nameAr, nat: p.nat, campus: t.campus, female });
  }
  await db.employee.createMany({ data: rows });
  return { teachers, assignments, homeroom, teacherInfo, staffParents, count: rows.length, aishaSectionId: aishaSection.id, employeeIds: rows.map((x) => x.id as string) };
}

// ───────────────────────── Families ─────────────────────────

async function seedFamilies(
  db: Db,
  orgId: string,
  users: SchoolUsers,
  campusIds: Record<CampusKey, string>,
  sections: { id: string; campus: CampusKey; level: number; name: string; capacity: number; target: number }[],
  gradeByLevel: Map<number, { id: string }>,
  routes: { id: string; campus: CampusKey; code: string; capacity: number; stops: { id: string }[] }[],
  staffParents: { employeeId: string; name: string; nameAr: string; nat: string; campus: CampusKey | null; female: boolean }[],
  r: Rng,
  now: Date,
  startYear: number,
) {
  const fill = new Map(sections.map((s) => [s.id, 0]));
  const riders = new Map(routes.map((x) => [x.id, 0]));
  const guardians: Prisma.GuardianCreateManyInput[] = [];
  const students: (Prisma.StudentCreateManyInput & { id: string; level: number; campus: CampusKey; familyId: string; joinYear: number })[] = [];
  const links: Prisma.StudentGuardianCreateManyInput[] = [];
  const families: { id: string; primaryGuardianId: string; guardianIds: string[]; culture: Culture; childIds: string[] }[] = [];
  const seqByYear = new Map<number, number>();
  const usedChild = new Set<string>();

  const sectionFor = (campus: CampusKey, level: number) =>
    sections
      .filter((s) => s.campus === campus && s.level === level && fill.get(s.id)! < s.target)
      .sort((a, b) => fill.get(a.id)! / a.target - fill.get(b.id)! / b.target)[0];

  const birthYearFor = (level: number) => startYear - 6 - level; // Grade 1 in 2026–27 → born 2020
  const maxLevel = (c: CampusKey) => CAMPUS_PLAN[c].levels[1];

  type Kid = { level: number; female: boolean; first?: readonly [string, string] };
  const addFamily = (opts: { culture: Culture; campus: CampusKey; kids: Kid[]; family?: readonly [string, string]; father?: { name: string; nameAr: string; userId?: string; email?: string; phone?: string }; mother?: { name: string; nameAr: string; userId?: string; email?: string; phone?: string }; staffEmployee?: string; motherPays?: boolean; nat?: string }) => {
    const pool = POOLS[opts.culture];
    const fam = opts.family ?? r.pick(pool.families);
    const fatherFirst = r.pick(pool.boys);
    const nat = opts.nat ?? r.pick(pool.nationalities);
    const familyId = cid();
    const fatherId = cid();
    const motherId = cid();
    const fatherName = opts.father ?? (() => {
      const grand = pool.patronymic ? r.pick(pool.boys) : null;
      return { name: [fatherFirst[0], grand?.[0], fam[0]].filter(Boolean).join(" "), nameAr: [fatherFirst[1], grand?.[1], fam[1]].filter(Boolean).join(" ") };
    })();
    const motherFam = pool.patronymic ? r.pick(pool.families) : fam;
    const motherFirst = r.pick(pool.girls);
    const motherName = opts.mother ?? { name: `${motherFirst[0]} ${motherFam[0]}`, nameAr: `${motherFirst[1]} ${motherFam[1]}` };
    const zone = r.int(20, 90);
    const addr = `Villa ${r.int(1, 60)}, Street ${r.int(200, 990)}, Zone ${zone}`;
    const addrAr = `فيلا ${r.int(1, 60)}، شارع ${r.int(200, 990)}، منطقة ${zone}`;
    const mail = (n: string) => `${slug(n.split(" ")[0])}.${slug(n.split(" ").slice(-1)[0])}${r.int(1, 99)}@${r.pick(["example.com", "example.net", "example.org"])}`;
    guardians.push(
      { id: fatherId, orgId, name: fatherName.name, nameAr: fatherName.nameAr, phone: opts.father?.phone ?? phone(r), email: opts.father?.email ?? mail(fatherName.name), qid: qidFor(r, 1975 + r.int(0, 15), nat), employer: r.pick(EMPLOYERS), address: addr, addressAr: addrAr, userId: opts.father?.userId ?? null },
      { id: motherId, orgId, name: motherName.name, nameAr: motherName.nameAr, phone: opts.mother?.phone ?? phone(r), email: opts.mother?.email ?? mail(motherName.name), qid: qidFor(r, 1978 + r.int(0, 15), nat), employer: r.chance(0.55) ? r.pick(EMPLOYERS) : null, address: addr, addressAr: addrAr, userId: opts.mother?.userId ?? null },
    );
    const primary = opts.motherPays ? motherId : fatherId;
    const route = r.chance(0.3) ? r.pick(routes.filter((x) => x.campus === opts.campus)) : null;
    const stop = route ? r.pick(route.stops) : null;
    const childIds: string[] = [];
    for (const kid of opts.kids) {
      const s = sectionFor(opts.campus, kid.level);
      if (!s) continue;
      const first = kid.first ?? (() => {
        for (let i = 0; i < 20; i++) {
          const f = r.pick(kid.female ? pool.girls : pool.boys);
          if (!usedChild.has(`${f[0]}|${fam[0]}`) && f[0] !== fatherName.name.split(" ")[0]) return f;
        }
        return r.pick(kid.female ? pool.girls : pool.boys);
      })();
      usedChild.add(`${first[0]}|${fam[0]}`);
      const name = pool.patronymic ? `${first[0]} ${fatherName.name.split(" ")[0]} ${fam[0]}` : `${first[0]} ${fam[0]}`;
      const nameAr = pool.patronymic ? `${first[1]} ${fatherName.nameAr.split(" ")[0]} ${fam[1]}` : `${first[1]} ${fam[1]}`;
      const birthYear = birthYearFor(kid.level);
      const dob = dohaNoon(`${birthYear}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`);
      // Most joined in KG1 or Grade 1; some later; about one in ten is new this year.
      const joinLevel = r.chance(0.1) ? kid.level : Math.max(-1, Math.min(kid.level, r.pick([-1, -1, -1, 1, 1, kid.level - r.int(0, 4)])));
      const joinYear = Math.min(startYear, startYear - (kid.level - joinLevel));
      const seq = (seqByYear.get(joinYear) ?? 0) + 1;
      seqByYear.set(joinYear, seq);
      const id = cid();
      const useBus = !!stop && route && riders.get(route.id)! < route.capacity;
      if (useBus) riders.set(route.id, riders.get(route.id)! + 1);
      students.push({
        id,
        orgId,
        number: `ADM-${joinYear}-${String(seq).padStart(5, "0")}`,
        name,
        nameAr,
        gender: kid.female ? "f" : "m",
        dob,
        nationality: nat,
        qid: qidFor(r, birthYear, nat),
        qidExpiry: new Date(now.getTime() + r.int(-20, 1400) * DAY),
        passportNumber: nat === "QA" ? null : `${nat.slice(0, 1)}${r.int(1000000, 9999999)}`,
        campusId: campusIds[opts.campus],
        gradeId: gradeByLevel.get(kid.level)!.id,
        sectionId: s.id,
        status: "active",
        joinedOn: dohaNoon(`${joinYear}-08-${String(r.int(20, 26)).padStart(2, "0")}`),
        bloodGroup: r.pick(BLOOD_GROUPS),
        medical: r.chance(0.07) ? r.pick(MEDICAL_NOTES) : null,
        busStopId: useBus ? stop!.id : null,
        discountKind: opts.staffEmployee ? "staff" : null,
        previousSchool: joinLevel > 1 ? r.pick(["Doha British School", "International School of Choueifat", "Qatar Academy", "Birla Public School", "Lebanese School Doha", "Gulf English School", "a school in Amman", "a school in Cairo", "a school in Kerala", "a school in Manchester"]) : null,
        avatarColor: r.pick(AVATAR_COLORS),
        level: kid.level,
        campus: opts.campus,
        familyId,
        joinYear,
      });
      fill.set(s.id, fill.get(s.id)! + 1);
      childIds.push(id);
      links.push({ id: cid(), orgId, studentId: id, guardianId: fatherId, relation: "father", primary: primary === fatherId });
      links.push({ id: cid(), orgId, studentId: id, guardianId: motherId, relation: "mother", primary: primary === motherId });
    }
    if (!childIds.length) {
      guardians.splice(guardians.length - 2, 2);
      return null;
    }
    families.push({ id: familyId, primaryGuardianId: primary, guardianIds: [fatherId, motherId], culture: opts.culture, childIds });
    return { familyId, fatherId, motherId, childIds };
  };

  // The Al-Mansouri family: Khalid and Hessa, with Ahmed in 7-A and Mariam in 3-B.
  const almansouri = addFamily({
    culture: "gulf",
    campus: "WAB",
    nat: "QA",
    family: ["Al-Mansouri", "المنصوري"],
    father: { name: "Khalid Al-Mansouri", nameAr: "خالد المنصوري", userId: users.khalid, email: "khalid@tamam.demo", phone: "+974 3345 6612" },
    mother: { name: "Hessa Al-Mansouri", nameAr: "حصة المنصوري", userId: users.hessa, email: "hessa@tamam.demo", phone: "+974 5512 3344" },
    kids: [
      { level: 7, female: false, first: ["Ahmed", "أحمد"] },
      { level: 3, female: true, first: ["Mariam", "مريم"] },
    ],
  });
  // Put them in the classes the story mentions.
  const ahmed = students.find((s) => s.id === almansouri!.childIds[0])!;
  const mariam = students.find((s) => s.id === almansouri!.childIds[1])!;
  const sec7A = sections.find((s) => s.campus === "WAB" && s.level === 7 && s.name === "A")!;
  const sec3B = sections.find((s) => s.campus === "WAB" && s.level === 3 && s.name === "B")!;
  for (const [st, sec] of [[ahmed, sec7A], [mariam, sec3B]] as const) {
    fill.set(st.sectionId as string, fill.get(st.sectionId as string)! - 1);
    st.sectionId = sec.id;
    fill.set(sec.id, fill.get(sec.id)! + 1);
  }
  ahmed.medical = "Asthma. Inhaler in school bag; avoid dusty activities.";
  ahmed.busStopId = null;
  mariam.busStopId = null;

  // Staff families get the staff discount.
  for (const sp of staffParents) {
    const campus = sp.campus ?? "WAB";
    const culture: Culture = (Object.entries(POOLS).find(([, p]) => p.nationalities.includes(sp.nat))?.[0] as Culture) ?? "western";
    const famName = sp.name.split(" ").slice(-1)[0];
    const pool = POOLS[culture];
    const fam = pool.families.find((f) => f[0] === famName) ?? ([famName, sp.nameAr.split(" ").slice(-1)[0]] as const);
    const kids = Array.from({ length: r.int(1, 2) }, () => ({ level: r.int(-1, maxLevel(campus)), female: r.chance(0.5) }));
    addFamily({ culture, campus, kids, family: fam, staffEmployee: sp.employeeId, ...(sp.female ? { mother: { name: sp.name, nameAr: sp.nameAr }, motherPays: true } : { father: { name: sp.name, nameAr: sp.nameAr } }) });
  }

  // Everyone else, until the classes are full.
  let guard = 0;
  const open = () => sections.filter((s) => fill.get(s.id)! < s.target);
  while (open().length && guard++ < 3000) {
    const target = r.pick(open());
    const campus = target.campus;
    const culture = pickWeighted(r, CULTURE_MIX);
    const n = pickWeighted(r, [[1, 52], [2, 32], [3, 13], [4, 3]] as [number, number][]);
    const kids: Kid[] = [{ level: target.level, female: r.chance(0.5) }];
    for (let k = 1; k < n; k++) {
      const level = target.level + r.pick([-4, -3, -2, -2, 2, 2, 3, 4]);
      if (level < -1 || level > maxLevel(campus) || kids.some((x) => x.level === level)) continue;
      kids.push({ level, female: r.chance(0.5) });
    }
    addFamily({ culture, campus, kids, motherPays: r.chance(0.08) });
  }

  // Bus 4 runs full: the morning briefing mentions it.
  const bus4 = routes.find((x) => x.code === "Bus 4")!;
  for (const s of students.filter((x) => x.campus === "WAB" && !x.busStopId && x.id !== ahmed.id && x.id !== mariam.id)) {
    if (riders.get(bus4.id)! >= bus4.capacity) break;
    if (!r.chance(0.2)) continue;
    s.busStopId = r.pick(bus4.stops).id;
    riders.set(bus4.id, riders.get(bus4.id)! + 1);
  }

  // A few scholarships.
  for (const s of students.filter((x) => !x.discountKind && x.level >= 6).slice(0, 400).filter(() => r.chance(0.03))) {
    s.discountKind = "scholarship";
    s.discountPct = r.pick([2500, 5000, 5000, 10000]);
  }

  await db.guardian.createMany({ data: guardians });
  await db.student.createMany({ data: students.map(({ level: _l, campus: _c, familyId: _f, joinYear: _j, ...s }) => s) });
  await db.studentGuardian.createMany({ data: links });
  // Admission numbers continue from the demo's highest number each year.
  for (const [yr, current] of seqByYear) {
    await db.namingSeries.upsert({ where: { orgId_key_year: { orgId, key: "ADM", year: yr } }, create: { orgId, key: "ADM", year: yr, current: Math.max(current, 40) }, update: { current: Math.max(current, 40) } });
  }
  return {
    students: students.map((s) => ({ id: s.id, number: s.number as string, name: s.name, nameAr: s.nameAr ?? null, level: s.level, campus: s.campus, sectionId: s.sectionId as string, familyId: s.familyId, joinYear: s.joinYear, dob: s.dob as Date, busStopId: (s.busStopId as string | null) ?? null, discountKind: (s.discountKind as string | null) ?? null, discountPct: (s.discountPct as number | undefined) ?? 0, gender: s.gender })),
    families,
    guardians: guardians.map((g) => ({ id: g.id as string, name: g.name, nameAr: g.nameAr ?? null, email: g.email ?? null, phone: g.phone ?? null })),
    almansouri: { ahmed: ahmed.id, mariam: mariam.id, khalidGuardian: almansouri!.fatherId, hessaGuardian: almansouri!.motherId },
    riders,
  };
}
