import { describe, expect, it } from "vitest";
import { agingBucket, docTotals, lineParts, movingAverage, parseQty, stockValue } from "../src/lib/docs/math";
import { amountInWords, numberToArabic, numberToEnglish } from "../src/lib/words";
import { bankFromIban, isValidIban, makeIban } from "../src/lib/payroll/banks";
import { calcPayslip, gratuityEstimate } from "../src/lib/payroll/calc";
import { buildSif, csvField, SIF_HEADER_FIELDS, SIF_RECORD_FIELDS, type SifRecord } from "../src/lib/payroll/wps";
import { tidyLines } from "../src/lib/ledger/post";

describe("document math", () => {
  it("parses quantities in hundredths, including Arabic digits", () => {
    expect(parseQty("2.5")).toBe(250);
    expect(parseQty("١٢")).toBe(1200);
    expect(parseQty("1,200")).toBe(120000);
    expect(parseQty("-1")).toBeNull();
    expect(parseQty("abc")).toBeNull();
  });

  it("computes line amounts with discounts in dirhams", () => {
    // 3 × QAR 18.50 = 55.50, 10% off = 49.95
    expect(lineParts({ qty: 300, unitPrice: 1850, discountPct: 1000 })).toEqual({ gross: 5550, discount: 555, amount: 4995 });
    // 2.5 hours × QAR 120 = 300
    expect(lineParts({ qty: 250, unitPrice: 12000 }).amount).toBe(30000);
  });

  it("totals a document", () => {
    expect(docTotals([{ qty: 100, unitPrice: 10000 }, { qty: 200, unitPrice: 2500, discountPct: 500 }])).toEqual({ subtotal: 15000, discount: 250, total: 14750 });
  });

  it("keeps a moving average cost", () => {
    // 10 on hand at 20.00, receive 10 at 30.00 → 25.00
    expect(movingAverage(1000, 2000, 1000, 3000)).toBe(2500);
    // nothing on hand: the new cost wins
    expect(movingAverage(0, 2000, 500, 3100)).toBe(3100);
    expect(stockValue(250, 1000)).toBe(2500);
  });

  it("buckets open balances by days overdue", () => {
    const asOf = new Date("2026-11-07T12:00:00Z");
    expect(agingBucket(new Date("2026-11-10T12:00:00Z"), asOf)).toBe("current");
    expect(agingBucket(new Date("2026-10-20T12:00:00Z"), asOf)).toBe("d1_30");
    expect(agingBucket(new Date("2026-09-20T12:00:00Z"), asOf)).toBe("d31_60");
    expect(agingBucket(new Date("2026-06-01T12:00:00Z"), asOf)).toBe("d90");
  });
});

describe("amount in words", () => {
  it("writes English", () => {
    expect(numberToEnglish(1250)).toBe("One Thousand Two Hundred Fifty");
    expect(numberToEnglish(2000045)).toBe("Two Million Forty-Five");
    expect(amountInWords(125050, "en")).toBe("Qatari Riyals One Thousand Two Hundred Fifty and Fifty Dirhams Only");
  });

  it("writes Arabic with the right counted-noun forms", () => {
    expect(numberToArabic(25)).toBe("خمسة وعشرون");
    expect(numberToArabic(1250)).toBe("ألف ومئتان وخمسون");
    expect(numberToArabic(3000)).toBe("ثلاثة آلاف");
    expect(numberToArabic(11000)).toBe("أحد عشر ألفاً");
    expect(numberToArabic(2000)).toBe("ألفان");
    expect(amountInWords(125000, "ar")).toBe("فقط ألف ومئتان وخمسون ريالاً قطرياً لا غير");
    expect(amountInWords(100000, "ar")).toBe("فقط ألف ريال قطري لا غير");
    expect(amountInWords(500, "ar")).toBe("فقط خمسة ريالات قطرية لا غير");
    expect(amountInWords(200, "ar")).toBe("فقط ريالان قطريان لا غير");
    expect(amountInWords(1050, "ar")).toBe("فقط عشرة ريالات قطرية وخمسون درهماً لا غير");
  });
});

describe("IBAN", () => {
  it("validates Qatari IBANs and finds the bank", () => {
    const iban = makeIban("QA", "QNBA000000000123456789012");
    expect(iban).toHaveLength(29);
    expect(isValidIban(iban)).toBe(true);
    expect(isValidIban(iban.slice(0, -1) + (iban.endsWith("2") ? "3" : "2"))).toBe(false);
    expect(bankFromIban(iban)).toBe("QNB");
    expect(isValidIban("GB82WEST12345698765432")).toBe(true);
  });
});

describe("payroll", () => {
  const base = { basic: 400000, housing: 150000, transport: 50000, food: 0, other: 0, absentDays: 0, unpaidLeaveDays: 0, overtimeHours: 0, bonus: 0, advanceDeduction: 0, otherDeduction: 0 };

  it("pays a full month", () => {
    const r = calcPayslip(base);
    expect(r).toMatchObject({ workingDays: 30, gross: 600000, deductions: 0, net: 600000, deductionCode: null });
  });

  it("deducts unpaid days at 1/30 of basic + allowances, with WPS code 01", () => {
    const r = calcPayslip({ ...base, absentDays: 2 });
    expect(r.absenceDeduction).toBe(40000);
    expect(r.net).toBe(560000);
    expect(r.workingDays).toBe(28);
    expect(r.deductionCode).toBe("01");
  });

  it("pays overtime at 125% of the basic hourly rate", () => {
    // 4000 / 30 / 8 = 16.667 per hour × 1.25 × 10 h = 208.33
    expect(calcPayslip({ ...base, overtimeHours: 1000 }).overtimePay).toBe(20833);
  });

  it("uses reason 99 when deductions are mixed", () => {
    expect(calcPayslip({ ...base, absentDays: 1, advanceDeduction: 50000 }).deductionCode).toBe("99");
    expect(calcPayslip({ ...base, advanceDeduction: 50000 }).deductionCode).toBe("04");
  });

  it("estimates gratuity at three weeks' basic per year", () => {
    const g = gratuityEstimate(300000, new Date("2021-11-07"), new Date("2026-11-07"));
    expect(Math.round(g.years)).toBe(5);
    // 3000/30 × 21 × 5 = 10,500
    expect(Math.abs(g.amount - 1050000)).toBeLessThan(1000);
    expect(gratuityEstimate(300000, new Date("2026-03-01"), new Date("2026-11-07")).amount).toBe(0);
  });
});

describe("WPS salary file", () => {
  const employer = { employerEid: "10007230", bankShortName: "CBQ", iban: makeIban("QA", "CBQA000000004030520252101") };
  const rec = (over: Partial<SifRecord> = {}): SifRecord => ({
    employeeName: "Ravi Kumar Menon",
    qid: "28435601234",
    bankShortName: "QNB",
    account: makeIban("QA", "QNBA000000000693123456789"),
    workingDays: 30,
    basic: 300000,
    extraIncome: 120000,
    deductions: 0,
    net: 420000,
    overtimeHours: 0,
    housing: 100000,
    food: 0,
    transport: 20000,
    overtimePay: 0,
    ...over,
  });

  it("follows the four-part row layout and naming convention", () => {
    const f = buildSif(employer, "2026-10", [rec(), rec({ employeeName: "Maricel Reyes Santos", qid: "29160801111", net: 380000, deductions: 40000, deductionCode: "01", workingDays: 28 })], new Date("2026-11-01T06:52:00Z"));
    const rows = f.content.trimEnd().split("\r\n");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toBe(SIF_HEADER_FIELDS.join(","));
    expect(rows[2]).toBe(SIF_RECORD_FIELDS.join(","));
    expect(rows[1].split(",")).toEqual(["10007230", "20261101", "0952", "10007230", "", "CBQ", employer.iban, "202610", "8000.00", "2", ""]);
    const r2 = rows[4].split(",");
    expect(r2[0]).toBe("000002");
    expect(r2[6]).toBe("M");
    expect(r2.slice(7, 13)).toEqual(["28", "3800.00", "3000.00", "0.00", "1200.00", "400.00"]);
    expect(r2[13]).toBe("Normal Payment");
    expect(r2[19]).toBe("01");
    expect(r2).toHaveLength(22);
    expect(f.fileName).toBe("SIF_10007230_CBQ_20261101_0952.csv");
    expect(f.issues).toEqual([]);
  });

  it("reports problems the bank would reject", () => {
    const f = buildSif({ ...employer, employerEid: "12" }, "2026-10", [rec({ employeeName: "Ravi", qid: "123" }), rec({ deductions: 5000, net: 415000 }), rec({ deductions: 5000, net: 415000, deductionCode: "99" })]);
    const fields = f.issues.map((i) => i.field);
    expect(fields).toContain("Employer EID");
    expect(fields).toContain("Employee Name");
    expect(fields).toContain("Employee QID");
    expect(fields).toContain("Deduction Reason Code");
    expect(fields).toContain("Notes / Comments");
  });

  it("quotes CSV fields that need it", () => {
    expect(csvField('Housing, "advance"')).toBe('"Housing, ""advance"""');
    expect(csvField("plain")).toBe("plain");
  });
});

describe("ledger lines", () => {
  it("merges same-account lines and flips negatives", () => {
    const out = tidyLines([
      { accountId: "a", debit: 100, credit: 0, partyId: null, memo: null },
      { accountId: "a", debit: 50, credit: 0, partyId: null, memo: null },
      { accountId: "b", debit: -150, credit: 0, partyId: null, memo: null },
      { accountId: "c", debit: 0, credit: 0, partyId: null, memo: null },
    ]);
    expect(out).toEqual([
      { accountId: "a", debit: 150, credit: 0, partyId: null, memo: null },
      { accountId: "b", debit: 0, credit: 150, partyId: null, memo: null },
    ]);
  });
});
