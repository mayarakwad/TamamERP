import { describe, expect, it } from "vitest";
import { addMonths, createFormatter, monthKey, monthStart } from "@/lib/format";
import { parseMoney, toDirhams } from "@/lib/money";

const d = new Date("2026-11-07T09:30:00Z"); // 12:30 in Doha
// Intl puts a non-breaking space between the currency code and the amount (keeps them on one line).
const sp = (s: string) => s.replace(/\u00a0/g, " ");

describe("money", () => {
  it("parses Western and Arabic-Indic input into dirhams", () => {
    expect(parseMoney("1,250.5")).toBe(125050);
    expect(parseMoney("١٬٢٥٠٫٥")).toBe(125050);
    expect(parseMoney("۳۰")).toBe(3000);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
  it("avoids float drift", () => {
    expect(toDirhams(0.1 + 0.2)).toBe(30);
  });
});

describe("formatter", () => {
  const en = createFormatter({ locale: "en", digits: "latn" });
  const ar = createFormatter({ locale: "ar", digits: "latn" });
  const arIndic = createFormatter({ locale: "ar", digits: "arab" });

  it("formats QAR in both languages", () => {
    expect(sp(en.money(125050))).toBe("QAR 1,250.50");
    expect(sp(en.money(450000))).toBe("QAR 4,500");
    expect(ar.money(125050)).toContain("1,250.50");
    expect(ar.money(125050)).toContain("ر.ق");
    expect(arIndic.money(125050)).toContain("١٬٢٥٠٫٥٠");
  });

  it("shows Gregorian and Umm al-Qura Hijri dates in Doha time", () => {
    expect(en.date(d)).toBe("7 Nov 2026");
    expect(en.hijri(d)).toBe("27 Jumada I 1448 AH");
    expect(ar.hijri(d)).toContain("جمادى الأولى");
    expect(en.time(d)).toBe("12:30");
  });

  it("keeps English digits Western even if Arabic-Indic is chosen", () => {
    const enArabDigits = createFormatter({ locale: "en", digits: "arab" });
    expect(enArabDigits.number(1234)).toBe("1,234");
  });
});

describe("month helpers (Asia/Qatar, UTC+3)", () => {
  it("assigns late-evening UTC times to the next Doha day", () => {
    expect(monthKey(new Date("2026-10-31T21:30:00Z"))).toBe("2026-11");
    expect(monthKey(new Date("2026-10-31T20:30:00Z"))).toBe("2026-10");
  });
  it("computes month starts and offsets", () => {
    expect(monthStart("2026-11").toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });
});
