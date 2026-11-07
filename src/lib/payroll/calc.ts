// Payslip arithmetic. Pure, so it is unit-tested and shared by the payroll
// screen, the demo history and the WPS file.
//
// Conventions (Qatar practice; adjustable per payslip):
// - A month counts as 30 days. An unpaid day costs 1/30 of basic + allowances.
// - Overtime is paid at 125% of the basic hourly rate (Labour Law art. 74),
//   with the hourly rate = basic ÷ 30 ÷ 8.

export interface PayInput {
  basic: number;
  housing: number;
  transport: number;
  food: number;
  other: number;
  absentDays: number;
  unpaidLeaveDays: number;
  /** hundredths of an hour */
  overtimeHours: number;
  bonus: number;
  advanceDeduction: number;
  otherDeduction: number;
}

export interface PayResult {
  workingDays: number;
  allowances: number;
  overtimePay: number;
  absenceDeduction: number;
  gross: number;
  deductions: number;
  net: number;
  /** WPS deduction reason: 01 working hours · 04 advances · 99 other */
  deductionCode: string | null;
}

export const OVERTIME_RATE = 1.25;

export function calcPayslip(p: PayInput): PayResult {
  const allowances = p.housing + p.transport + p.food + p.other;
  const unpaid = Math.min(30, Math.max(0, p.absentDays + p.unpaidLeaveDays));
  const absenceDeduction = Math.round(((p.basic + allowances) * unpaid) / 30);
  const hourly = p.basic / 30 / 8;
  const overtimePay = Math.round((hourly * OVERTIME_RATE * p.overtimeHours) / 100);
  const gross = p.basic + allowances + overtimePay + p.bonus;
  const deductions = absenceDeduction + p.advanceDeduction + p.otherDeduction;
  const kinds = [absenceDeduction > 0 && "01", p.advanceDeduction > 0 && "04", p.otherDeduction > 0 && "99"].filter(Boolean) as string[];
  return {
    workingDays: 30 - unpaid,
    allowances,
    overtimePay,
    absenceDeduction,
    gross,
    deductions,
    net: gross - deductions,
    deductionCode: kinds.length === 0 ? null : kinds.length === 1 ? kinds[0] : "99",
  };
}

/**
 * End-of-service gratuity estimate (Labour Law art. 54): at least three weeks'
 * basic wage for each year of service, once a worker has completed a year.
 * Partial years count pro rata.
 */
export function gratuityEstimate(basic: number, joinedOn: Date, asOf: Date): { years: number; amount: number } {
  const years = Math.max(0, (asOf.getTime() - joinedOn.getTime()) / (365.25 * 86400_000));
  if (years < 1) return { years, amount: 0 };
  const daily = basic / 30;
  return { years, amount: Math.round(daily * 21 * years) };
}

/** Paid annual leave earned so far this year, given days per year. */
export function leaveAccrued(daysPerYear: number, joinedOn: Date, asOf: Date): number {
  const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  const from = joinedOn > yearStart ? joinedOn : yearStart;
  const months = Math.max(0, (asOf.getTime() - from.getTime()) / (30.44 * 86400_000));
  return Math.floor((daysPerYear * Math.min(12, months)) / 12);
}
