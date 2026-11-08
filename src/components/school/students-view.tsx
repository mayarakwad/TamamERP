"use client";

import { useState } from "react";
import { GraduationCap, HeartPulse, Plus } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { ListView, selectClass, useQueryParam } from "@/components/business/list-view";
import { StudentSheet, type ClassOpt, type StopOpt } from "./student-sheet";

/** Name with a coloured initial and a medical flag teachers can't miss. */
export function StudentName({ row }: { row: Row }) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-2.5">
      <Avatar name={String(row.meta?.plainName ?? row.cells.name)} color={(row.meta?.color as string) ?? null} size={28} />
      <span className="font-medium">{row.cells.name}</span>
      {row.meta?.medical && (
        <span title={t("school.medicalFlag")} className="text-danger">
          <HeartPulse className="size-3.5" aria-label={t("school.medicalFlag")} />
        </span>
      )}
    </span>
  );
}

export function StudentsView({
  slug,
  query,
  result,
  canShare,
  canManage,
  counts,
  classes,
  stops,
}: {
  slug: string;
  query: string;
  result: DatasetResult;
  canShare: boolean;
  canManage: boolean;
  counts: { active: number; new: number; medical: number; upcoming: number; left: number };
  classes: ClassOpt[];
  stops: StopOpt[];
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const { params, set, setMany } = useQueryParam(query);
  const grades = [...new Map(classes.map((c) => [c.level, c.grade])).entries()].sort((a, b) => a[0] - b[0]);
  const grade = params.get("grade");
  const sectionsInGrade = classes.filter((c) => grade == null || String(c.level) === grade);
  const add = canManage && (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> {t("students.new")}
    </Button>
  );
  return (
    <ListView
      slug={slug}
      dataset="students"
      query={query}
      result={result}
      canShare={canShare}
      title={t("students.title")}
      subtitle={t("students.subtitle", { count: fmt.number(counts.active), classes: fmt.number(classes.length) })}
      primary={add}
      chipParam="view"
      chips={[
        { value: null, label: t("students.viewActive"), count: counts.active },
        { value: "new", label: t("students.viewNew"), count: counts.new },
        { value: "medical", label: t("students.viewMedical"), count: counts.medical },
        ...(counts.upcoming ? [{ value: "upcoming", label: t("students.viewUpcoming"), count: counts.upcoming }] : []),
        { value: "left", label: t("students.viewLeft"), count: counts.left },
      ]}
      filters={
        <>
          <select aria-label={t("school.grade")} className={selectClass} value={grade ?? ""} onChange={(e) => setMany({ grade: e.target.value || null, section: null })}>
            <option value="">{t("school.anyGrade")}</option>
            {grades.map(([level, name]) => (
              <option key={level} value={level}>
                {name}
              </option>
            ))}
          </select>
          <select aria-label={t("school.section")} className={selectClass} value={params.get("section") ?? ""} onChange={(e) => set("section", e.target.value || null)}>
            <option value="">{t("school.anyClass")}</option>
            {sectionsInGrade.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {new Set(classes.map((x) => x.campusId)).size > 1 ? ` · ${c.campus}` : ""}
              </option>
            ))}
          </select>
        </>
      }
      searchPlaceholder={t("students.search")}
      emptyIcon={<GraduationCap className="size-6" />}
      emptyTitle={t("students.emptyTitle")}
      emptyBody={t("students.emptyBody")}
      emptyAction={add}
      renderCell={{
        number: (r: Row) => <span className="font-mono text-xs">{r.cells.number}</span>,
        name: (r: Row) => <StudentName row={r} />,
        class: (r: Row) => <span className="font-medium tabular">{r.cells.class}</span>,
      }}
      mobileRow={(r: Row) => (
        <div className="flex items-center gap-3">
          <Avatar name={String(r.meta?.plainName ?? r.cells.name)} color={(r.meta?.color as string) ?? null} size={36} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-medium">
              {r.cells.name}
              {r.meta?.medical && <HeartPulse className="size-3.5 shrink-0 text-danger" />}
            </p>
            <p className="truncate text-xs text-muted">
              {r.cells.class} · {r.cells.number}
            </p>
          </div>
          {r.cells.bus ? <span className="rounded-full bg-sunken px-2 py-0.5 text-xs text-muted">{r.cells.bus}</span> : null}
        </div>
      )}
    >
      {canManage && <StudentSheet slug={slug} open={open} onOpenChange={setOpen} classes={classes} stops={stops} />}
    </ListView>
  );
}
