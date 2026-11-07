"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, Legend } from "recharts";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { CountUp } from "@/components/motion/count-up";
import { monthStart } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Twelve months of amounts as bars; the current month is highlighted. */
export function MonthBars({ data, height = 180, valueLabel }: { data: { month: string; total: number }[]; height?: number; valueLabel?: string }) {
  const { fmt, dir } = useI18n();
  const reduced = useReducedMotion();
  const points = data.map((d) => ({ ...d, label: fmt.monthShort(monthStart(d.month)) }));
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" reversed={dir === "rtl"} axisLine={false} tickLine={false} tick={{ fill: "var(--subtle)", fontSize: 11 }} interval={0} />
          <YAxis orientation={dir === "rtl" ? "right" : "left"} axisLine={false} tickLine={false} width={56} tick={{ fill: "var(--subtle)", fontSize: 11 }} tickFormatter={(v: number) => fmt.money(v, { compact: true })} />
          <Tooltip
            cursor={{ fill: "var(--sunken)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lift">
                  <p className="text-xs text-muted">{fmt.monthName(monthStart(payload[0].payload.month))}</p>
                  <p className="tabular font-semibold">{fmt.money(payload[0].payload.total)}</p>
                  {valueLabel && <p className="text-xs text-muted">{valueLabel}</p>}
                </div>
              ) : null
            }
          />
          <Bar dataKey="total" radius={[6, 6, 0, 0]} isAnimationActive={!reduced} animationDuration={900}>
            {points.map((p, i) => (
              <Cell key={p.month} fill={i === points.length - 1 ? "var(--accent)" : "color-mix(in oklab, var(--accent) 45%, transparent)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Money in vs money out per month, as two soft areas. */
export function InOutChart({ data, height = 240, inLabel, outLabel }: { data: { month: string; inflow: number; outflow: number }[]; height?: number; inLabel: string; outLabel: string }) {
  const { fmt, dir } = useI18n();
  const reduced = useReducedMotion();
  const points = data.map((d) => ({ ...d, label: fmt.monthShort(monthStart(d.month)) }));
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="in-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--success)", stopOpacity: 0.3 }} />
              <stop offset="100%" style={{ stopColor: "var(--success)", stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id="out-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--danger)", stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: "var(--danger)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" reversed={dir === "rtl"} axisLine={false} tickLine={false} tick={{ fill: "var(--subtle)", fontSize: 11 }} />
          <YAxis orientation={dir === "rtl" ? "right" : "left"} axisLine={false} tickLine={false} width={60} tick={{ fill: "var(--subtle)", fontSize: 11 }} tickFormatter={(v: number) => fmt.money(v, { compact: true })} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lift">
                  <p className="text-xs text-muted">{fmt.monthName(monthStart(payload[0].payload.month))}</p>
                  <p className="tabular text-success">↑ {fmt.money(payload[0].payload.inflow)}</p>
                  <p className="tabular text-danger">↓ {fmt.money(payload[0].payload.outflow)}</p>
                </div>
              ) : null
            }
          />
          <Legend verticalAlign="top" align={dir === "rtl" ? "right" : "left"} height={28} iconType="circle" formatter={(v) => <span className="text-xs text-muted">{v === "inflow" ? inLabel : outLabel}</span>} />
          <Area type="monotone" dataKey="inflow" stroke="var(--success)" strokeWidth={2} fill="url(#in-fill)" isAnimationActive={!reduced} animationDuration={1100} dot={false} />
          <Area type="monotone" dataKey="outflow" stroke="var(--danger)" strokeWidth={2} fill="url(#out-fill)" isAnimationActive={!reduced} animationDuration={1100} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A number tile that counts up. */
export function StatTile({ label, value, tone, hint, money = true, className }: { label: string; value: number; tone?: "danger" | "success" | "warning"; hint?: React.ReactNode; money?: boolean; className?: string }) {
  const { fmt } = useI18n();
  return (
    <Card className={cn("p-[var(--pad)]", className)}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("tabular mt-1 text-xl font-semibold sm:text-2xl", tone === "danger" && value > 0 && "text-danger", tone === "success" && "text-success", tone === "warning" && value > 0 && "text-warning")}>
        <CountUp value={value} format={(n) => (money ? fmt.money(Math.round(n)) : fmt.number(Math.round(n)))} />
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
