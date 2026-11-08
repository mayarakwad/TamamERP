// Turning marks into term results. Pure functions, unit-tested.

export interface MarkInput {
  assessmentId: string;
  score: number | null; // hundredths
  absent: boolean;
}

export interface AssessmentInput {
  id: string;
  maxScore: number;
  weight: number;
}

/**
 * Weighted term percentage for one student in one subject.
 * Assessments without a mark yet are left out and the remaining weights are
 * scaled up, so a half-marked term still gives a fair running figure.
 * A missed assessment (absent) is left out by default, the usual policy when a
 * child is off sick; pass `excuseAbsent = false` to count it as zero instead.
 */
export function termPercent(assessments: AssessmentInput[], marks: MarkInput[], excuseAbsent = true): number | null {
  const byId = new Map(marks.map((m) => [m.assessmentId, m]));
  let weighted = 0;
  let weights = 0;
  for (const a of assessments) {
    const m = byId.get(a.id);
    if (!m || a.maxScore <= 0 || a.weight <= 0) continue;
    if (m.absent) {
      if (excuseAbsent) continue;
      weights += a.weight;
      continue;
    }
    if (m.score == null) continue;
    weighted += (m.score / 100 / a.maxScore) * a.weight;
    weights += a.weight;
  }
  if (!weights) return null;
  return Math.round((weighted / weights) * 1000) / 10;
}

/** Parse a typed mark: "17", "17.5", "17,5", "a"/"abs"/"غ" for absent, "" to clear. */
export function parseMark(raw: string, max: number): { score: number | null; absent: boolean } | "invalid" {
  const s = raw.trim().toLowerCase();
  if (!s) return { score: null, absent: false };
  if (["a", "ab", "abs", "absent", "غ", "غائب"].includes(s)) return { score: null, absent: true };
  const n = Number(s.replace(",", ".").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  if (!Number.isFinite(n) || n < 0 || n > max) return "invalid";
  return { score: Math.round(n * 100), absent: false };
}

/** Class statistics for one assessment or one term column. */
export function stats(values: (number | null)[]) {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return { count: 0, mean: null, median: null, min: null, max: null };
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { count: v.length, mean: Math.round(mean * 10) / 10, median, min: v[0], max: v[v.length - 1] };
}

/**
 * Parse a block pasted from Excel or Google Sheets into rows of cells.
 * Handles tabs, CRLF and a trailing newline.
 */
export function parsePastedGrid(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t"));
}
