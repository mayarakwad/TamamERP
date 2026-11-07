import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac";
import { navFor } from "@/lib/modules";
import { mergePrefs, parsePrefs, DEFAULT_PREFS } from "@/lib/prefs";
import { readableOn } from "@/lib/themes";

const ids = (type: Parameters<typeof navFor>[0], role: Parameters<typeof navFor>[1]) => navFor(type, role).map((n) => n.id);

describe("roles see only what belongs to them", () => {
  it("family members can submit claims but not approve them or see the monthly summary", () => {
    expect(can("member", "claims.submit")).toBe(true);
    expect(can("member", "claims.approve")).toBe(false);
    expect(ids("home", "member")).not.toContain("summary");
    expect(ids("home", "member")).not.toContain("members");
  });
  it("only owners configure Flow and download backups", () => {
    expect(can("owner", "flow.configure")).toBe(true);
    expect(can("admin", "flow.configure")).toBe(false);
    expect(can("admin", "workspace.backup")).toBe(false);
    expect(can("accountant", "workspace.backup")).toBe(false);
  });
  it("teachers don't see fees or admissions; parents see only their children", () => {
    expect(ids("school", "teacher")).not.toContain("fees");
    expect(ids("school", "teacher")).not.toContain("admissions");
    expect(ids("school", "teacher")).toContain("student-attendance");
    expect(ids("school", "parent")).toContain("my-children");
    expect(ids("school", "parent")).not.toContain("students");
    expect(ids("school", "owner")).not.toContain("my-children");
  });
  it("business employees can't open finance, but can claim expenses and request leave", () => {
    const emp = ids("business", "employee");
    expect(emp).not.toContain("invoices");
    expect(emp).not.toContain("payroll");
    expect(emp).toContain("expenses");
    expect(emp).toContain("leave");
  });
  it("sidebar groups come in a stable order with settings last", () => {
    const groups = navFor("school", "owner").map((n) => n.group);
    expect(groups[0]).toBe("nav.groupMain");
    expect(groups[groups.length - 1]).toBe("nav.groupSettings");
  });
});

describe("preferences are validated", () => {
  it("falls back safely on junk", () => {
    const p = parsePrefs({ theme: "neon", fontScale: 9, accent: "red", locale: "fr", wallpaperDim: -5 });
    expect(p.theme).toBe("pearl");
    expect(p.fontScale).toBe(1);
    expect(p.accent).toBeNull();
    expect(p.locale).toBe("en");
    expect(p.wallpaperDim).toBe(DEFAULT_PREFS.wallpaperDim);
  });
  it("merges partial updates and drops unknown keys", () => {
    const next = mergePrefs(DEFAULT_PREFS, { locale: "ar", accent: "#0E7490", evil: "<script>" });
    expect(next.locale).toBe("ar");
    expect(next.accent).toBe("#0E7490");
    expect("evil" in next).toBe(false);
  });
  it("picks readable text on custom accents", () => {
    expect(readableOn("#8A1538")).toBe("#FFFFFF");
    expect(readableOn("#F0B43C")).toBe("#111111");
  });
});
