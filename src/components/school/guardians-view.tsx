"use client";

import { Contact } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { formatCell } from "@/lib/datasets/format-cell";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { ListView } from "@/components/business/list-view";

const ACCESS_TONE: Record<string, "success" | "info" | "neutral"> = { on: "success", invited: "info", off: "neutral" };

export function GuardiansView({ slug, query, result, canShare, counts, families }: { slug: string; query: string; result: DatasetResult; canShare: boolean; canManage: boolean; counts: { all: number; balance: number; noAccess: number }; families: number }) {
  const { t, fmt } = useI18n();
  const accessCol = result.columns.find((c) => c.key === "access")!;
  return (
    <ListView
      slug={slug}
      dataset="guardians"
      query={query}
      result={result}
      canShare={canShare}
      title={t("guardians.title")}
      subtitle={t("guardians.subtitle", { count: fmt.number(families) })}
      chipParam="view"
      chips={[
        { value: null, label: t("common.all"), count: counts.all },
        { value: "balance", label: t("guardians.viewWithBalance"), count: counts.balance },
        { value: "noaccess", label: t("guardians.viewNoAccess"), count: counts.noAccess },
      ]}
      searchPlaceholder={t("guardians.search")}
      emptyIcon={<Contact className="size-6" />}
      emptyTitle={t("guardians.emptyTitle")}
      emptyBody={t("guardians.emptyBody")}
      renderCell={{
        name: (r: Row) => <span className="font-medium">{r.cells.name}</span>,
        phone: (r: Row) => <span dir="ltr" className="tabular">{r.cells.phone}</span>,
        access: (r: Row) => <Badge tone={ACCESS_TONE[String(r.cells.access)]}>{formatCell(accessCol, r.cells.access, fmt, t)}</Badge>,
      }}
      mobileRow={(r: Row) => (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.cells.name}</p>
            <p className="truncate text-xs text-muted">{r.cells.children}</p>
          </div>
          {typeof r.cells.balance === "number" && r.cells.balance > 0 && <span className="tabular text-sm font-semibold text-danger">{fmt.money(r.cells.balance)}</span>}
        </div>
      )}
    />
  );
}
