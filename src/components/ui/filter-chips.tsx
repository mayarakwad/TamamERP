"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

/** Tab-like filter links that keep their state in the URL (so exports and shares match). */
export function FilterChips({ items, className }: { items: { href: string; label: React.ReactNode; active: boolean; count?: number }[]; className?: string }) {
  const id = useId();
  return (
    <nav className={cn("flex flex-wrap gap-1 rounded-xl border border-line bg-sunken p-1", className)}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          scroll={false}
          aria-current={it.active ? "page" : undefined}
          className={cn("relative inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors", it.active ? "text-fg" : "text-muted hover:text-fg")}
        >
          {it.active && <motion.span layoutId={`chips-${id}`} className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{it.label}</span>
          {it.count !== undefined && <span className="tabular relative rounded-full bg-line/70 px-1.5 text-[0.7rem] text-muted">{it.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
