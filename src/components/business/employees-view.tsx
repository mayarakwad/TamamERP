"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCell } from "@/lib/datasets/format-cell";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { ListView, selectClass, useQueryParam } from "./list-view";
import { EmployeeSheet } from "./employee-sheet";

const DOC_TONE: Record<string, "success" | "warning" | "danger"> = { ok: "success", soon: "warning", expired: "danger" };

export function EmployeesView({
  slug,
  query,
  result,
  canShare,
  canManage,
  counts,
  payroll,
  campuses,
  departments,
  members,
}: {
  slug: string;
  query: string;
  result: DatasetResult;
  canShare: boolean;
  canManage: boolean;
  counts: { active: number; expiring: number; left: number };
  payroll: number | null;
  campuses: { id: string; name: string; nameAr: string | null }[];
  departments: string[];
  members: { userId: string; name: string }[];
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const { params, set } = useQueryParam(query);
  const docsCol = result.columns.find((c) => c.key === "docs")!;
  const add = canManage && (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> {t("hr.newEmployee")}
    </Button>
  );
  return (
    <ListView
      slug={slug}
      dataset="employees"
      query={query}
      result={result}
      canShare={canShare}
      title={t("nav.employees")}
      subtitle={payroll != null ? t("hr.subtitle", { count: fmt.number(counts.active), payroll: fmt.money(payroll) }) : t("hr.subtitleNoPay", { count: fmt.number(counts.active) })}
      primary={add}
      chipParam="view"
      chips={[
        { value: null, label: t("status.active"), count: counts.active },
        { value: "expiring", label: t("hr.expiringSoon"), count: counts.expiring },
        { value: "left", label: t("hr.leftView"), count: counts.left },
      ]}
      filters={
        departments.length > 1 && (
          <select aria-label={t("hr.colDepartment")} className={selectClass} value={params.get("department") ?? ""} onChange={(e) => set("department", e.target.value || null)}>
            <option value="">{t("hr.anyDepartment")}</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )
      }
      searchPlaceholder={t("hr.search")}
      emptyIcon={<Users className="size-6" />}
      emptyTitle={t("hr.emptyTitle")}
      emptyBody={t("hr.emptyBody")}
      emptyAction={add}
      renderCell={{
        number: (r: Row) => <span className="font-mono text-xs">{r.cells.number}</span>,
        name: (r: Row) => <span className="font-medium">{r.cells.name}</span>,
        docs: (r: Row) => <Badge tone={DOC_TONE[String(r.cells.docs)]}>{formatCell(docsCol, r.cells.docs, fmt, t)}</Badge>,
      }}
      mobileRow={(r: Row) => (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.cells.name}</p>
            <p className="truncate text-xs text-muted">{[r.cells.title, r.cells.department].filter(Boolean).join(" · ")}</p>
          </div>
          <Badge tone={DOC_TONE[String(r.cells.docs)]}>{formatCell(docsCol, r.cells.docs, fmt, t)}</Badge>
        </div>
      )}
    >
      <EmployeeSheet slug={slug} open={open} onOpenChange={setOpen} campuses={campuses} departments={departments} members={members} />
    </ListView>
  );
}
