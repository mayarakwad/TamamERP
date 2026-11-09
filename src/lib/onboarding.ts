import "server-only";
import { db } from "./db";
import type { Workspace } from "./auth/dal";
import type { OrgType } from "./rbac";
import { bizSettings } from "./biz";
import { schoolSettings } from "./school/settings";
import { getFlowConfig } from "./flow/settings";

// The workspace setup guide: a few steps that turn a fresh workspace into a
// working one, different for each kind of workspace. Progress is worked out
// from the data where it can be (a step is done once there are items, bills,
// fee rates...), and remembered where it can't (the person looked at their
// campuses and pressed Continue). It's stored in Organization.settings.onboarding.

export type StepId = "basics" | "branches" | "invoicing" | "catalog" | "staff" | "campuses" | "year" | "fees" | "classes" | "admissions" | "budgets" | "bills" | "things" | "people" | "flow";

export const STEPS: Record<OrgType, StepId[]> = {
  business: ["basics", "branches", "invoicing", "catalog", "staff", "people", "flow"],
  school: ["basics", "campuses", "year", "fees", "classes", "admissions", "people", "flow"],
  home: ["basics", "budgets", "bills", "things", "people", "flow"],
};

/** Steps that are nice to have; skipping them doesn't nag. */
export const OPTIONAL: StepId[] = ["things", "flow"];

export interface OnboardingState {
  startedAt?: string;
  finishedAt?: string;
  /** The dashboard card was hidden */
  hiddenAt?: string;
  confirmed?: StepId[];
  skipped?: StepId[];
}

export function onboardingState(org: { settings: unknown }): OnboardingState {
  const s = org.settings && typeof org.settings === "object" ? (org.settings as { onboarding?: OnboardingState }).onboarding : undefined;
  return s ?? {};
}

export async function saveOnboarding(orgId: string, patch: (s: OnboardingState) => OnboardingState) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { settings: true } });
  const settings = (org.settings && typeof org.settings === "object" ? org.settings : {}) as Record<string, unknown>;
  const next = patch(onboardingState(org));
  await db.organization.update({ where: { id: orgId }, data: { settings: JSON.parse(JSON.stringify({ ...settings, onboarding: next })) } });
  return next;
}

export interface StepStatus {
  id: StepId;
  done: boolean;
  skipped: boolean;
  optional: boolean;
  /** Counts shown on the step, e.g. { items: 12 } */
  counts: Record<string, number>;
}

/** Where each step stands for this workspace. */
export async function stepStatuses(ws: Workspace): Promise<StepStatus[]> {
  const org = ws.org;
  const id = org.id;
  const state = onboardingState(org);
  const confirmed = new Set(state.confirmed ?? []);
  const skipped = new Set(state.skipped ?? []);
  const [members, invites, flow] = await Promise.all([
    db.membership.count({ where: { orgId: id, status: "active" } }),
    db.invitation.count({ where: { orgId: id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    getFlowConfig(id),
  ]);
  const counts: Partial<Record<StepId, Record<string, number>>> = { people: { members, invites }, branches: { campuses: org.campuses.length }, campuses: { campuses: org.campuses.length } };
  const done: Partial<Record<StepId, boolean>> = {
    basics: confirmed.has("basics") || !!org.logoPath,
    people: members > 1 || invites > 0,
    flow: flow.hasKey && flow.enabled,
    branches: confirmed.has("branches"),
    campuses: confirmed.has("campuses"),
  };

  if (ws.orgType === "business") {
    const [items, customers, employees] = await Promise.all([
      db.item.count({ where: { orgId: id, archived: false } }),
      db.party.count({ where: { orgId: id, isCustomer: true, archived: false } }),
      db.employee.count({ where: { orgId: id, status: "active" } }),
    ]);
    counts.catalog = { items, customers };
    counts.staff = { employees };
    done.invoicing = !!bizSettings(org).sales?.iban;
    done.catalog = items > 0 && customers > 0;
    done.staff = employees > 0;
  } else if (ws.orgType === "school") {
    const year = await db.academicYear.findFirst({ where: { orgId: id, current: true }, select: { id: true } });
    const [rates, employees, sections, students] = await Promise.all([
      year ? db.feeRate.count({ where: { orgId: id, yearId: year.id } }) : 0,
      db.employee.count({ where: { orgId: id, status: "active" } }),
      year ? db.section.count({ where: { orgId: id, yearId: year.id } }) : 0,
      db.student.count({ where: { orgId: id, status: "active" } }),
    ]);
    counts.fees = { rates };
    counts.classes = { employees, sections, students };
    done.year = confirmed.has("year");
    done.fees = rates > 0;
    done.classes = employees > 0 && sections > 0;
    done.admissions = confirmed.has("admissions");
    counts.admissions = { open: schoolSettings(org).admissionsOpen ? 1 : 0 };
  } else {
    const [budgets, bills, things] = await Promise.all([
      db.budget.count({ where: { orgId: id, amount: { gt: 0 } } }),
      db.recurringBill.count({ where: { orgId: id } }),
      db.possession.count({ where: { orgId: id } }),
    ]);
    counts.budgets = { budgets };
    counts.bills = { bills };
    counts.things = { things };
    // New homes start with suggested budgets, so this step is done once someone has looked at them.
    done.budgets = confirmed.has("budgets");
    done.bills = bills > 0;
    done.things = things > 0;
  }

  return STEPS[ws.orgType].map((s) => ({ id: s, done: !!done[s], skipped: skipped.has(s) && !done[s], optional: OPTIONAL.includes(s), counts: counts[s] ?? {} }));
}

/** "3 of 7": steps done or deliberately skipped. */
export function progress(steps: StepStatus[]) {
  const finished = steps.filter((s) => s.done || s.skipped).length;
  return { finished, total: steps.length, complete: finished === steps.length };
}

/** The dashboard's "Finish setting up" card: for owners and admins of a workspace whose guide isn't done. */
export function showSetupCard(ws: Workspace, now = new Date()): boolean {
  if (!ws.can("workspace.manage") || ws.org.isSandbox) return false;
  const s = onboardingState(ws.org);
  if (s.finishedAt || s.hiddenAt) return false;
  return !!s.startedAt || now.getTime() - ws.org.createdAt.getTime() < 14 * 86400_000;
}
