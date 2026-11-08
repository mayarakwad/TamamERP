"use client";

import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/providers";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";

export interface GridSlot {
  day: number;
  period: number;
  title: string;
  /** Second line: teacher (class view) or class (teacher view) */
  sub?: string | null;
  color?: string | null;
  room?: string | null;
}

/** A week of periods. Read-only, or clickable cells for the timetable builder. */
export function TimetableGrid({
  days,
  periods,
  breaks = [],
  slots,
  onCell,
  busy,
  now,
  compact,
}: {
  days: number[];
  periods: { start: string; end: string }[];
  breaks?: { after: number; label: string; labelAr: string }[];
  slots: GridSlot[];
  onCell?: (day: number, period: number) => void;
  /** Cells where the chosen teacher is busy elsewhere (builder hint) */
  busy?: Set<string>;
  /** Highlight the current period: { day, period } */
  now?: { day: number; period: number | null } | null;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const at = new Map(slots.map((s) => [`${s.day}|${s.period}`, s]));
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-20 border-b border-line px-2 py-2 text-start text-xs font-medium text-muted" />
            {days.map((d) => (
              <th key={d} className={cn("border-b border-s border-line px-2 py-2 text-start text-xs font-semibold", now?.day === d ? "text-accent" : "text-muted")}>
                {t(`timetable.day_${d}` as MessageKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p, i) => {
            const n = i + 1;
            const br = breaks.find((b) => b.after === n);
            return (
              <FragmentRow key={n}>
                <tr>
                  <th scope="row" className="border-b border-line px-2 py-1.5 text-start align-top">
                    <span className="block text-xs font-semibold">{t("timetable.period", { n })}</span>
                    <span className="block text-[0.65rem] tabular text-subtle" dir="ltr">
                      {p.start}–{p.end}
                    </span>
                  </th>
                  {days.map((d) => {
                    const s = at.get(`${d}|${n}`);
                    const isNow = now?.day === d && now.period === n;
                    const blocked = busy?.has(`${d}|${n}`);
                    const cell = (
                      <div
                        className={cn(
                          "relative h-full rounded-lg px-2 py-1.5 text-start transition",
                          compact ? "min-h-10" : "min-h-14",
                          s ? "border-s-[3px]" : "border border-dashed border-transparent",
                          onCell && !s && "hover:border-line",
                          isNow && "ring-2 ring-accent",
                          blocked && !s && "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,var(--sunken)_6px,var(--sunken)_12px)]",
                        )}
                        style={s ? { borderInlineStartColor: s.color ?? "var(--accent)", background: `color-mix(in oklch, ${s.color ?? "var(--accent)"} 10%, var(--surface))` } : undefined}
                      >
                        {s ? (
                          <>
                            <span className="block truncate text-[0.8rem] font-medium leading-tight">{s.title}</span>
                            {s.sub && <span className="block truncate text-[0.7rem] text-muted">{s.sub}</span>}
                            {isNow && <span className="absolute end-1.5 top-1.5 rounded bg-accent px-1 text-[0.6rem] font-semibold text-accent-fg">{t("timetable.now")}</span>}
                          </>
                        ) : onCell ? (
                          <span className="grid h-full place-items-center text-subtle opacity-0 transition group-hover:opacity-100">
                            <Plus className="size-4" />
                          </span>
                        ) : null}
                      </div>
                    );
                    return (
                      <td key={d} className="border-b border-s border-line p-1 align-top">
                        {onCell ? (
                          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => onCell(d, n)} className="group block h-full w-full" aria-label={`${t(`timetable.day_${d}` as MessageKey)} ${t("timetable.period", { n })}${s ? `: ${s.title}` : ""}`}>
                            {cell}
                          </motion.button>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                </tr>
                {br && (
                  <tr>
                    <td colSpan={days.length + 1} className="border-b border-line bg-sunken/70 px-2 py-0.5 text-center text-[0.65rem] font-medium uppercase tracking-wide text-subtle">
                      {locale === "ar" ? br.labelAr : br.label}
                    </td>
                  </tr>
                )}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
