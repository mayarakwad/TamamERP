// Qatar Wage Protection System: the Salary Information File (SIF).
//
// Layout (WPS file format specification):
//   row 1  header field names        row 2  header values
//   row 3  record field names        row 4… one row per employee
// CSV per RFC 4180, decimals with a dot and exactly two places, dates YYYYMMDD,
// times HHMM, file name SIF_<EmployerEID>_<BankShortName>_<YYYYMMDD>_<HHMM>.csv
//
// Net Salary = Basic Salary + Extra income − Deductions. Allowances, overtime
// and bonuses go in Extra income; the optional allowance columns repeat them
// for information only.

import { isValidIban, WPS_BANK_CODES } from "./banks";

export const SIF_HEADER_FIELDS = [
  "Employer EID",
  "File Creation Date",
  "File Creation Time",
  "Payer EID",
  "Payer QID",
  "Payer Bank Short Name",
  "Payer IBAN",
  "Salary Year and Month",
  "Total Salaries",
  "Total Records",
  "SIF Version",
] as const;

export const SIF_RECORD_FIELDS = [
  "Record Sequence",
  "Employee QID",
  "Employee Visa ID",
  "Employee Name",
  "Employee Bank Short Name",
  "Employee Account",
  "Salary Frequency",
  "Number of Working days",
  "Net Salary",
  "Basic Salary",
  "Extra hours",
  "Extra income",
  "Deductions",
  "Payment Type",
  "Notes / Comments",
  "Housing Allowance",
  "Food Allowance",
  "Transportation Allowance",
  "Over Time Allowance",
  "Deduction Reason Code",
  "Extra Field 1",
  "Extra Field 2",
] as const;

export const DEDUCTION_REASONS: Record<string, { en: string; ar: string }> = {
  "01": { en: "Working hours (absence, lateness)", ar: "ساعات العمل (غياب، تأخير)" },
  "02": { en: "Work arrangements", ar: "ترتيبات العمل" },
  "03": { en: "Harm or damage", ar: "ضرر أو تلف" },
  "04": { en: "Advance repayment", ar: "سداد سلفة" },
  "99": { en: "Other (explain in notes)", ar: "أخرى (يُذكر السبب في الملاحظات)" },
};

export interface SifEmployer {
  /** Establishment ID (7–8 digits) */
  employerEid: string;
  /** Usually the same as the employer */
  payerEid?: string | null;
  /** Only when salaries are paid from a person's account */
  payerQid?: string | null;
  bankShortName: string;
  iban: string;
  sifVersion?: string | null;
}

export interface SifRecord {
  employeeName: string;
  qid?: string | null;
  visaId?: string | null;
  bankShortName: string;
  account: string;
  workingDays: number;
  /** dirhams */
  net: number;
  basic: number;
  /** hundredths of an hour */
  overtimeHours: number;
  /** allowances + overtime + bonus, dirhams */
  extraIncome: number;
  deductions: number;
  housing: number;
  food: number;
  transport: number;
  overtimePay: number;
  deductionCode?: string | null;
  notes?: string | null;
}

export interface SifIssue {
  /** 0 = header, otherwise the record's sequence */
  row: number;
  who: string;
  field: string;
  message: string;
}

const money = (dirhams: number) => (dirhams / 100).toFixed(2);

/** RFC 4180 quoting: wrap in quotes when the value has a comma, quote, or line break. */
export function csvField(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dohaStamp(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}${parts.month}${parts.day}`, time: `${parts.hour}${parts.minute}` };
}

export function validateSif(employer: SifEmployer, records: SifRecord[]): SifIssue[] {
  const issues: SifIssue[] = [];
  const h = (field: string, message: string) => issues.push({ row: 0, who: "", field, message });
  if (!/^\d{7,8}$/.test(employer.employerEid ?? "")) h("Employer EID", "must be the 7- or 8-digit establishment ID");
  if (employer.payerQid && employer.payerEid) h("Payer", "give either a payer EID or a payer QID, not both");
  if (employer.payerEid && !/^\d{7,8}$/.test(employer.payerEid)) h("Payer EID", "must be 7 or 8 digits");
  if (employer.payerQid && !/^\d{11}$/.test(employer.payerQid)) h("Payer QID", "must be 11 digits");
  if (!WPS_BANK_CODES.has(employer.bankShortName)) h("Payer Bank Short Name", "is not a WPS bank code");
  if (!isValidIban(employer.iban ?? "")) h("Payer IBAN", "is not a valid IBAN");
  if (!records.length) h("Records", "there are no employees to pay by bank transfer");

  records.forEach((r, i) => {
    const add = (field: string, message: string) => issues.push({ row: i + 1, who: r.employeeName, field, message });
    if (!r.qid && !r.visaId) add("Employee QID", "needs a QID or, for new arrivals, a visa number");
    if (r.qid && !/^\d{11}$/.test(r.qid)) add("Employee QID", "must be 11 digits");
    if (r.visaId && r.visaId.length > 12) add("Employee Visa ID", "is longer than 12 characters");
    if (r.employeeName.trim().split(/\s+/).length < 2) add("Employee Name", "must have at least two parts, as on the QID");
    if (r.employeeName.length > 70) add("Employee Name", "is longer than 70 characters");
    if (!WPS_BANK_CODES.has(r.bankShortName)) add("Employee Bank Short Name", "is missing or not a WPS bank code");
    if (!r.account) add("Employee Account", "is missing");
    else if (r.account.startsWith("QA") && !isValidIban(r.account)) add("Employee Account", "IBAN check digits are wrong");
    if (r.basic <= 0) add("Basic Salary", "must be more than zero");
    if (r.workingDays < 0 || r.workingDays > 999) add("Number of Working days", "is out of range");
    if (r.net !== r.basic + r.extraIncome - r.deductions) add("Net Salary", "must equal basic + extra income − deductions");
    if (r.overtimeHours >= 100_000) add("Extra hours", "is more than 999.99");
    if (r.deductions > 0 && !r.deductionCode) add("Deduction Reason Code", "is required when there are deductions");
    if (r.deductionCode === "99" && !r.notes?.trim()) add("Notes / Comments", "are required with reason code 99");
  });
  return issues;
}

/** Build the file. Returns its name and contents; check `issues` before handing it to the bank. */
export function buildSif(employer: SifEmployer, month: string, records: SifRecord[], createdAt = new Date()) {
  const { date, time } = dohaStamp(createdAt);
  const total = records.reduce((s, r) => s + r.net, 0);
  const header = [
    employer.employerEid,
    date,
    time,
    employer.payerQid ? "" : (employer.payerEid || employer.employerEid),
    employer.payerQid ?? "",
    employer.bankShortName,
    employer.iban.replace(/\s/g, "").toUpperCase(),
    month.replace("-", ""),
    money(total),
    records.length,
    employer.sifVersion ?? "",
  ];
  const rows = records.map((r, i) => [
    String(i + 1).padStart(6, "0"),
    r.qid ?? "",
    r.qid ? "" : (r.visaId ?? ""),
    r.employeeName.trim(),
    r.bankShortName,
    r.account.replace(/\s/g, "").toUpperCase(),
    "M",
    r.workingDays,
    money(r.net),
    money(r.basic),
    (r.overtimeHours / 100).toFixed(2),
    money(r.extraIncome),
    money(r.deductions),
    "Normal Payment",
    r.notes ?? "",
    money(r.housing),
    money(r.food),
    money(r.transport),
    money(r.overtimePay),
    r.deductions > 0 ? (r.deductionCode ?? "") : "",
    "",
    "",
  ]);
  const lines = [SIF_HEADER_FIELDS, header, SIF_RECORD_FIELDS, ...rows].map((row) => row.map(csvField).join(","));
  return {
    fileName: `SIF_${employer.employerEid}_${employer.bankShortName}_${date}_${time}.csv`,
    content: lines.join("\r\n") + "\r\n",
    total,
    issues: validateSif(employer, records),
  };
}
