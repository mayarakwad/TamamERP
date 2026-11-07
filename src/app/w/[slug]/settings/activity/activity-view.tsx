"use client";

import { usePathname, useRouter } from "next/navigation";
import { History, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/providers";
import { fieldClass } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { DataTable } from "@/components/data/data-table";
import { DataToolbar } from "@/components/data/toolbar";
import { monthStart } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { DatasetResult, Row } from "@/lib/datasets/types";

export function ActivityView({ slug, query, result, people, months, canShare }: { slug: string; query: string; result: DatasetResult; people: { id: string; name: string; nameAr: string | null }[]; months: string[]; canShare: boolean }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(query);
  const withParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(query);
    if (v) n.set(k, v);
    else n.delete(k);
    return n.toString() ? `${pathname}?${n}` : pathname;
  };
  const select = cn(fieldClass, "h-9 min-w-36 py-0 text-sm");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("activity.title")} subtitle={t("activity.subtitle")} actions={<DataToolbar slug={slug} dataset="activity" query={query} result={result} canShare={canShare} />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChips
          items={[
            { href: withParam("type", null), label: t("activity.all"), active: !params.get("type") },
            { href: withParam("type", "security"), label: t("activity.security"), active: params.get("type") === "security" },
          ]}
        />
        <select aria-label={t("activity.colWho")} className={select} value={params.get("person") ?? ""} onChange={(e) => router.replace(withParam("person", e.target.value || null), { scroll: false })}>
          <option value="">{t("activity.anyone")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {pick(locale, p.name, p.nameAr)}
            </option>
          ))}
        </select>
        <select aria-label={t("activity.colWhen")} className={select} value={params.get("month") ?? ""} onChange={(e) => router.replace(withParam("month", e.target.value || null), { scroll: false })}>
          <option value="">{t("claims.anyMonth")}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {fmt.monthName(monthStart(m))}
            </option>
          ))}
        </select>
      </div>
      <DataTable
        slug={slug}
        result={result}
        empty={<EmptyState icon={<History className="size-6" />} title={t("activity.empty")} />}
        renderCell={{
          who: (r: Row) => (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Avatar name={String(r.meta?.name)} color={r.meta?.avatarColor as string} size={24} />
              {r.cells.who}
            </span>
          ),
          type: (r: Row) => (r.cells.type === "security" ? <Badge tone="warning"><ShieldCheck className="size-3" /> {t("activity.sensitive")}</Badge> : <Badge>{t("activity.normal")}</Badge>),
          ip: (r: Row) => <span className="font-mono text-xs text-muted" dir="ltr">{r.cells.ip}</span>,
        }}
        mobileRow={(r: Row) => (
          <div className="flex items-start gap-3">
            <Avatar name={String(r.meta?.name)} color={r.meta?.avatarColor as string} size={32} />
            <div className="min-w-0">
              <p className="text-sm"><span className="font-medium">{r.cells.who}</span> · {r.cells.what}</p>
              <p className="text-xs text-muted">{fmt.dateTime(String(r.cells.when))}</p>
            </div>
          </div>
        )}
      />
    </div>
  );
}
