"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/providers";
import { cn } from "@/lib/cn";

/** Sub-navigation shared by the fee pages. */
export function FeesNav({ slug }: { slug: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const base = `/w/${slug}/fees`;
  const items = [
    { href: base, label: t("fees.title") },
    { href: `${base}/invoices`, label: t("fees.invoices") },
    { href: `${base}/payments`, label: t("fees.payments") },
    { href: `${base}/structure`, label: t("fees.structure") },
  ];
  return (
    <nav className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-sunken/60 p-1">
      {items.map((i) => {
        const active = i.href === base ? pathname === base : pathname.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition", active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
