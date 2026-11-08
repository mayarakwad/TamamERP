import { describe, expect, it } from "vitest";
import { parseMark, parsePastedGrid, stats, termPercent } from "../src/lib/school/grading";
import { childOrders, installmentLines, splitYearly, tuitionDiscount } from "../src/lib/school/fees";
import { autoFill, clashesFor, type SlotLite } from "../src/lib/school/timetable";
import { planPromotion } from "../src/lib/school/rollover";
import { bandFor, DEFAULT_SCHOOL_SETTINGS, installmentDue, sectionLabel, sectionLabelAr } from "../src/lib/school/settings";
import { CURRICULUM } from "../src/lib/school/defaults";

describe("grading", () => {
  const assessments = [
    { id: "q", maxScore: 20, weight: 10 },
    { id: "m", maxScore: 50, weight: 30 },
    { id: "f", maxScore: 100, weight: 60 },
  ];

  it("weights marks and scales up while the term is half marked", () => {
    // 15/20 = 75% (weight 10), 40/50 = 80% (weight 30), final not marked yet.
    expect(termPercent(assessments, [{ assessmentId: "q", score: 1500, absent: false }, { assessmentId: "m", score: 4000, absent: false }])).toBe(78.8);
    expect(termPercent(assessments, [])).toBeNull();
  });

  it("leaves out a missed assessment unless told to count it as zero", () => {
    const marks = [{ assessmentId: "q", score: 2000, absent: false }, { assessmentId: "m", score: null, absent: true }];
    expect(termPercent(assessments, marks)).toBe(100);
    expect(termPercent(assessments, marks, false)).toBe(25);
  });

  it("reads typed marks in either script", () => {
    expect(parseMark("17.5", 20)).toEqual({ score: 1750, absent: false });
    expect(parseMark("17,5", 20)).toEqual({ score: 1750, absent: false });
    expect(parseMark("١٨", 20)).toEqual({ score: 1800, absent: false });
    expect(parseMark("a", 20)).toEqual({ score: null, absent: true });
    expect(parseMark("غ", 20)).toEqual({ score: null, absent: true });
    expect(parseMark("", 20)).toEqual({ score: null, absent: false });
    expect(parseMark("21", 20)).toBe("invalid");
    expect(parseMark("abc", 20)).toBe("invalid");
  });

  it("splits a block pasted from Excel", () => {
    expect(parsePastedGrid("12\t15\r\n14\t18\r\n")).toEqual([["12", "15"], ["14", "18"]]);
  });

  it("summarises a column", () => {
    expect(stats([10, null, 20, 30])).toEqual({ count: 3, mean: 20, median: 20, min: 10, max: 30 });
  });

  it("maps percentages to the grade scale", () => {
    expect(bandFor(DEFAULT_SCHOOL_SETTINGS.scale, 91)?.letter).toBe("A");
    expect(bandFor(DEFAULT_SCHOOL_SETTINGS.scale, 60)?.letter).toBe("D");
    expect(bandFor(DEFAULT_SCHOOL_SETTINGS.scale, 12)?.letter).toBe("F");
    expect(bandFor(DEFAULT_SCHOOL_SETTINGS.scale, null)).toBeNull();
  });
});

describe("fees", () => {
  const settings = DEFAULT_SCHOOL_SETTINGS;

  it("splits a yearly amount into whole riyals that add back up", () => {
    const parts = splitYearly(3_850_000, settings.installments);
    expect(parts.reduce((s, x) => s + x, 0)).toBe(3_850_000);
    expect(parts.every((p) => p % 100 === 0)).toBe(true);
  });

  it("gives the larger of the sibling and staff discounts", () => {
    expect(tuitionDiscount({ childOrder: 0, discountKind: null, discountPct: 0, transportFee: 0 }, settings)).toEqual({ pct: 0, reason: null });
    expect(tuitionDiscount({ childOrder: 2, discountKind: null, discountPct: 0, transportFee: 0 }, settings)).toEqual({ pct: 1000, reason: "sibling" });
    expect(tuitionDiscount({ childOrder: 7, discountKind: null, discountPct: 0, transportFee: 0 }, settings)).toEqual({ pct: 1500, reason: "sibling" });
    expect(tuitionDiscount({ childOrder: 1, discountKind: "staff", discountPct: 0, transportFee: 0 }, settings)).toEqual({ pct: 5000, reason: "staff" });
    expect(tuitionDiscount({ childOrder: 3, discountKind: "scholarship", discountPct: 1000, transportFee: 0 }, settings)).toEqual({ pct: 1500, reason: "sibling" });
  });

  it("bills books with the first installment and the bus with every one", () => {
    const kid = { childOrder: 1, discountKind: null, discountPct: 0, transportFee: 650_000 };
    const first = installmentLines(kid, { tuition: 3_200_000, books: 185_000 }, 0, settings);
    const second = installmentLines(kid, { tuition: 3_200_000, books: 185_000 }, 1, settings);
    expect(first.map((l) => l.component)).toEqual(["tuition", "books", "transport"]);
    expect(second.map((l) => l.component)).toEqual(["tuition", "transport"]);
    expect(first[0]).toMatchObject({ amount: 1_280_000, discountPct: 500, discountReason: "sibling" });
  });

  it("orders children eldest first within a family", () => {
    const orders = childOrders([
      { id: "c", dob: new Date("2018-01-01"), familyKey: "f1" },
      { id: "a", dob: new Date("2012-01-01"), familyKey: "f1" },
      { id: "x", dob: new Date("2015-01-01"), familyKey: null },
    ]);
    expect(orders.get("a")).toBe(0);
    expect(orders.get("c")).toBe(1);
    expect(orders.get("x")).toBe(0);
  });

  it("dates installments within the academic year", () => {
    expect(installmentDue(settings.installments[0], 2026).toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(installmentDue(settings.installments[2], 2026).toISOString().slice(0, 10)).toBe("2027-03-01");
  });
});

describe("timetable", () => {
  it("spots a teacher booked in two classes at once", () => {
    const all: SlotLite[] = [{ sectionId: "a", day: 0, period: 1, subjectId: "math", teacherId: "t1" }];
    expect(clashesFor({ sectionId: "b", day: 0, period: 1, subjectId: "math", teacherId: "t1" }, all)).toEqual([{ kind: "teacher", sectionId: "a" }]);
    expect(clashesFor({ sectionId: "b", day: 0, period: 2, subjectId: "math", teacherId: "t1" }, all)).toEqual([]);
  });

  it("fills two classes sharing teachers with no clashes and at most two of a subject a day", () => {
    const days = [0, 1, 2, 3, 4];
    const plan = Object.entries(CURRICULUM.primary).map(([code, periods]) => ({ subjectId: code, teacherId: ["ENG", "MATH", "SCI"].includes(code) ? null : `t-${code}`, periods }));
    const all: SlotLite[] = [];
    for (const section of ["5A", "5B"]) {
      const res = autoFill(section, plan.map((p) => ({ ...p, teacherId: p.teacherId ?? `home-${section}` })), all, days, 8);
      expect(res.unplaced).toBe(0);
      all.push(...res.placed);
    }
    expect(all).toHaveLength(80);
    const seen = new Set<string>();
    for (const s of all) {
      const key = `${s.teacherId}|${s.day}|${s.period}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    for (const section of ["5A", "5B"]) for (const d of days) for (const code of Object.keys(CURRICULUM.primary)) expect(all.filter((s) => s.sectionId === section && s.day === d && s.subjectId === code).length).toBeLessThanOrEqual(2);
  });
});

describe("new school year", () => {
  const sections = [
    { key: "W6A", campusId: "W", level: 6, letter: "A", capacity: 2 },
    { key: "W6B", campusId: "W", level: 6, letter: "B", capacity: 2 },
    { key: "W1A", campusId: "W", level: 1, letter: "A", capacity: 20 },
    { key: "K1A", campusId: "K", level: 1, letter: "A", capacity: 20 },
  ];

  it("moves children up, keeps classmates together, graduates the oldest and transfers when a campus stops", () => {
    const plan = planPromotion(
      [
        { id: "a", campusId: "W", level: 5, letter: "B", status: "active" },
        { id: "b", campusId: "W", level: 12, letter: "A", status: "active" },
        { id: "c", campusId: "K", level: 5, letter: "A", status: "active" },
        { id: "d", campusId: "K", level: 1, letter: null, status: "upcoming" },
      ],
      sections,
      12,
      ["W", "K"],
    );
    const by = new Map(plan.map((p) => [p.studentId, p]));
    expect(by.get("a")!.to).toEqual({ campusId: "W", level: 6, sectionKey: "W6B" });
    expect(by.get("b")!.to).toBeNull();
    expect(by.get("c")).toMatchObject({ transfer: true, to: { campusId: "W", level: 6 } });
    expect(by.get("d")!.to).toEqual({ campusId: "K", level: 1, sectionKey: "K1A" });
  });

  it("spills into the emptier class when the usual one is full", () => {
    const kids = ["x", "y", "z"].map((id) => ({ id, campusId: "W", level: 5, letter: "A", status: "active" as const }));
    const plan = planPromotion(kids, sections, 12, ["W"]);
    expect(plan.filter((p) => p.to?.sectionKey === "W6A")).toHaveLength(2);
    expect(plan.filter((p) => p.to?.sectionKey === "W6B")).toHaveLength(1);
  });
});

describe("class names", () => {
  it("writes classes the way schools do in both languages", () => {
    expect(sectionLabel({ level: 5, name: "Grade 5" }, "B")).toBe("5-B");
    expect(sectionLabel({ level: -1, name: "KG1" }, "A")).toBe("KG1-A");
    expect(sectionLabelAr({ level: 5, name: "Grade 5", nameAr: "الصف الخامس" }, "B")).toBe("5-ب");
  });
});
