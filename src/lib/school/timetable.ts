// Timetable rules: clashes and a simple, predictable auto-fill. Pure functions,
// unit-tested.

export interface SlotLite {
  sectionId: string;
  day: number;
  period: number;
  subjectId: string;
  teacherId: string | null;
  room?: string | null;
}

export interface AssignmentLite {
  subjectId: string;
  teacherId: string | null;
  periods: number;
}

export interface Clash {
  kind: "section" | "teacher" | "room";
  /** The other class involved */
  sectionId: string;
}

/** What would go wrong if `slot` were placed, given every slot in the school. */
export function clashesFor(slot: SlotLite, all: SlotLite[]): Clash[] {
  const out: Clash[] = [];
  for (const s of all) {
    if (s.day !== slot.day || s.period !== slot.period) continue;
    if (s.sectionId === slot.sectionId) {
      if (s.subjectId !== slot.subjectId || s.teacherId !== slot.teacherId) out.push({ kind: "section", sectionId: s.sectionId });
      continue;
    }
    if (slot.teacherId && s.teacherId === slot.teacherId) out.push({ kind: "teacher", sectionId: s.sectionId });
    if (slot.room && s.room && s.room === slot.room) out.push({ kind: "room", sectionId: s.sectionId });
  }
  return out;
}

/** Periods per subject still to place in a class. */
export function remaining(assignments: AssignmentLite[], sectionSlots: SlotLite[]) {
  return assignments.map((a) => ({ ...a, left: Math.max(0, a.periods - sectionSlots.filter((s) => s.subjectId === a.subjectId).length) }));
}

/** Teacher-busy lookup built once and shared across calls (the seed fills a whole school). */
export function busyIndex(all: SlotLite[]) {
  const teacher = new Set<string>();
  for (const s of all) if (s.teacherId) teacher.add(`${s.teacherId}|${s.day}|${s.period}`);
  return teacher;
}

/**
 * Place the remaining periods of one class without clashing with any teacher's
 * other classes. Greedy and deterministic: the hardest subject to place goes
 * first; each period goes to the day with the fewest of that subject so far,
 * never three in a day, and core subjects prefer the morning.
 */
export function autoFill(
  sectionId: string,
  assignments: AssignmentLite[],
  all: SlotLite[],
  days: number[],
  periodCount: number,
  morningSubjects: Set<string> = new Set(),
  teacherBusy: Set<string> = busyIndex(all),
): { placed: SlotLite[]; unplaced: number } {
  const mine = all.filter((s) => s.sectionId === sectionId);
  const taken = new Set(mine.map((s) => `${s.day}|${s.period}`));
  const count = new Map<string, number>(); // subject|day → periods
  for (const s of mine) count.set(`${s.subjectId}|${s.day}`, (count.get(`${s.subjectId}|${s.day}`) ?? 0) + 1);
  const at = new Set(mine.map((s) => `${s.subjectId}|${s.day}|${s.period}`));
  const placed: SlotLite[] = [];
  const free = (day: number, period: number, teacherId: string | null) => !taken.has(`${day}|${period}`) && !(teacherId && teacherBusy.has(`${teacherId}|${day}|${period}`));

  const todo = remaining(assignments, mine).filter((a) => a.left > 0);
  const options = (a: AssignmentLite) => {
    let n = 0;
    for (const d of days) for (let p = 1; p <= periodCount; p++) if (free(d, p, a.teacherId)) n++;
    return n;
  };
  const opts = new Map(todo.map((a) => [a.subjectId, options(a)]));
  todo.sort((a, b) => opts.get(a.subjectId)! - opts.get(b.subjectId)! || b.left - a.left || a.subjectId.localeCompare(b.subjectId));

  let unplaced = 0;
  for (const a of todo) {
    for (let k = 0; k < a.left; k++) {
      let best: { day: number; period: number; score: number } | null = null;
      for (const d of days) {
        const sameDay = count.get(`${a.subjectId}|${d}`) ?? 0;
        if (sameDay >= 2) continue;
        for (let p = 1; p <= periodCount; p++) {
          if (!free(d, p, a.teacherId)) continue;
          const adjacent = at.has(`${a.subjectId}|${d}|${p - 1}`) || at.has(`${a.subjectId}|${d}|${p + 1}`);
          let score = sameDay * 10 + (sameDay && !adjacent ? 3 : 0);
          score += morningSubjects.has(a.subjectId) ? p : (periodCount - p) * 0.3;
          if (!best || score < best.score) best = { day: d, period: p, score };
        }
      }
      if (!best) {
        if (!swapIn(a)) unplaced++;
        continue;
      }
      put(a.subjectId, a.teacherId, best.day, best.period);
    }
  }
  return { placed, unplaced };

  function put(subjectId: string, teacherId: string | null, day: number, period: number) {
    const slot: SlotLite = { sectionId, day, period, subjectId, teacherId };
    placed.push(slot);
    taken.add(`${day}|${period}`);
    if (teacherId) teacherBusy.add(`${teacherId}|${day}|${period}`);
    count.set(`${subjectId}|${day}`, (count.get(`${subjectId}|${day}`) ?? 0) + 1);
    at.add(`${subjectId}|${day}|${period}`);
  }

  function lift(slot: SlotLite) {
    placed.splice(placed.indexOf(slot), 1);
    taken.delete(`${slot.day}|${slot.period}`);
    if (slot.teacherId) teacherBusy.delete(`${slot.teacherId}|${slot.day}|${slot.period}`);
    count.set(`${slot.subjectId}|${slot.day}`, (count.get(`${slot.subjectId}|${slot.day}`) ?? 1) - 1);
    at.delete(`${slot.subjectId}|${slot.day}|${slot.period}`);
  }

  /** No free cell: move one period placed in this call to make room (one level deep). */
  function swapIn(a: AssignmentLite) {
    for (const d of days) {
      if ((count.get(`${a.subjectId}|${d}`) ?? 0) >= 2) continue;
      for (let p = 1; p <= periodCount; p++) {
        if (a.teacherId && teacherBusy.has(`${a.teacherId}|${d}|${p}`)) continue;
        const blocker = placed.find((x) => x.day === d && x.period === p);
        if (!blocker || blocker.subjectId === a.subjectId) continue;
        for (const d2 of days) {
          if (d2 !== d && (count.get(`${blocker.subjectId}|${d2}`) ?? 0) >= 2) continue;
          for (let p2 = 1; p2 <= periodCount; p2++) {
            if (d2 === d && p2 === p) continue;
            if (!free(d2, p2, blocker.teacherId)) continue;
            lift(blocker);
            put(blocker.subjectId, blocker.teacherId, d2, p2);
            put(a.subjectId, a.teacherId, d, p);
            return true;
          }
        }
      }
    }
    return false;
  }
}
