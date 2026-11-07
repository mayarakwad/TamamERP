// Money is stored as whole dirhams (1 QAR = 100 dirhams).

export function toDirhams(riyals: number): number {
  return Math.round(riyals * 100);
}

export function toRiyals(dirhams: number): number {
  return dirhams / 100;
}

/** Parse user input such as "1,250.5" or "١٬٢٥٠٫٥" into dirhams. */
export function parseMoney(input: string): number | null {
  const western = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٬,\s]/g, "")
    .replace(/٫/g, ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(western)) return null;
  return toDirhams(Number(western));
}
