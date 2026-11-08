"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/business/list-view";
import type { MessageKey } from "@/lib/i18n";
import { FEE_COMPONENTS } from "@/lib/school/settings";
import { saveFeeRates } from "@/app/actions/fees";
import { FeesNav } from "./fees-nav";

export function FeeStructure({ slug, yearId, years, grades, rates, installments, canEdit }: { slug: string; yearId: string; years: { id: string; name: string }[]; grades: { id: string; name: string; students: number }[]; rates: { gradeId: string; component: string; amount: number }[]; installments: { label: string; pct: number }[]; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const initial = () => Object.fromEntries(grades.flatMap((g) => FEE_COMPONENTS.map((c) => [`${g.id}|${c}`, ((rates.find((r) => r.gradeId === g.id && r.component === c)?.amount ?? 0) / 100).toFixed(0)])));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [seen, setSeen] = useState(rates);
  if (seen !== rates) {
    setSeen(rates);
    setValues(initial());
  }
  const num = (k: string) => Number((values[k] ?? "").replace(/,/g, "")) || 0;
  const save = () =>
    start(async () => {
      const res = await saveFeeRates(slug, { yearId, rates: Object.entries(values).map(([k, v]) => ({ gradeId: k.split("|")[0], component: k.split("|")[1] as (typeof FEE_COMPONENTS)[number], amount: v })) });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("fees.structureSaved"));
      router.refresh();
    });
  const yearly = grades.reduce((sum, g) => sum + (num(`${g.id}|tuition`) + num(`${g.id}|books`)) * g.students, 0);
  return (
    <div className="pb-20">
      <PageHeader
        title={t("fees.structure")}
        subtitle={t("fees.structureBody")}
        actions={
          years.length > 1 && (
            <select aria-label={t("school.year")} className={selectClass} value={yearId} onChange={(e) => router.replace(`${pathname}?year=${e.target.value}`)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          )
        }
      />
      <FeesNav slug={slug} />
      <Card>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-2 text-start font-medium">{t("school.grade")}</th>
                {FEE_COMPONENTS.map((c) => (
                  <th key={c} className="px-2 py-2 text-end font-medium">
                    {t(`fees.component_${c}` as MessageKey)}
                    <span className="block font-normal text-subtle">{t("fees.perYear")}</span>
                  </th>
                ))}
                {installments.map((i) => (
                  <th key={i.label} className="px-2 py-2 text-end font-medium text-subtle">
                    {i.label} <span className="font-normal">({i.pct}%)</span>
                  </th>
                ))}
                <th className="px-2 py-2 text-end font-medium">{t("fees.total")}</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => {
                const tuition = num(`${g.id}|tuition`);
                const books = num(`${g.id}|books`);
                return (
                  <tr key={g.id} className="border-t border-line">
                    <td className="py-1.5">
                      <span className="font-medium">{g.name}</span>
                      {g.students > 0 && <span className="ms-2 text-xs text-subtle">{t("school.students", { count: g.students })}</span>}
                    </td>
                    {FEE_COMPONENTS.map((c) => (
                      <td key={c} className="px-1 py-1">
                        <input
                          aria-label={`${g.name} ${t(`fees.component_${c}` as MessageKey)}`}
                          dir="ltr"
                          inputMode="decimal"
                          value={values[`${g.id}|${c}`] ?? ""}
                          readOnly={!canEdit}
                          onChange={(e) => setValues((v) => ({ ...v, [`${g.id}|${c}`]: e.target.value.replace(/[^\d.,]/g, "") }))}
                          className="h-9 w-full min-w-24 rounded-lg border border-line bg-surface px-2 text-end tabular outline-none focus:border-accent-line"
                        />
                      </td>
                    ))}
                    {installments.map((i, k) => (
                      <td key={i.label} className="px-2 py-1.5 text-end tabular text-muted">
                        {fmt.number(Math.round((tuition * i.pct) / 100) + (k === 0 ? books : 0))}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-end font-semibold tabular">{fmt.number(tuition + books)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            {t("fees.billed")}: <span className="font-medium tabular">{fmt.money(yearly * 100, { compact: true })}</span>
          </p>
        </CardBody>
      </Card>
      {canEdit && (
        <div className="no-print sticky bottom-4 z-20 mt-6 flex justify-end">
          <div className="rounded-2xl border border-line bg-glass p-2 shadow-lift backdrop-blur-xl">
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("fees.saveStructure")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
