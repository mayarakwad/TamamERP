// Deterministic randomness so the demo looks the same every time it's seeded.

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  /** Riyal amount with realistic fils, e.g. 127.25 */
  money(min: number, max: number): number;
}

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
    money: (min, max) => {
      const v = min + next() * (max - min);
      const quarters = [0, 0.25, 0.5, 0.75, 0, 0];
      return Math.floor(v) + quarters[Math.floor(next() * quarters.length)];
    },
  };
}

const DAY = 86400_000;

/** Same wall-clock day N days before `now` (negative = in the future). */
export function daysAgo(now: Date, n: number): Date {
  return new Date(now.getTime() - n * DAY);
}

/** Set the Qatar-local time of day (UTC+3) on a date. */
export function atHour(d: Date, hour: number, minute = 0): Date {
  const qatar = new Date(d.getTime() + 3 * 3600_000);
  return new Date(
    Date.UTC(qatar.getUTCFullYear(), qatar.getUTCMonth(), qatar.getUTCDate(), hour - 3, minute),
  );
}
