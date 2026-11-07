"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useI18n } from "@/components/providers";
import { navFor, type NavItem } from "@/lib/modules";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import type { ShellData } from "./types";
import { WorkspaceSwitcher } from "./workspace-switcher";

function groupItems(items: NavItem[]) {
  const groups: { key: MessageKey; items: NavItem[] }[] = [];
  for (const item of items) {
    let g = groups.find((x) => x.key === item.group);
    if (!g) groups.push((g = { key: item.group, items: [] }));
    g.items.push(item);
  }
  return groups;
}

export function SidebarNav({ data, collapsed, onNavigate }: { data: ShellData; collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const base = `/w/${data.slug}`;
  const items = navFor(data.orgType, data.role).filter((n) => n.id !== "campuses" || data.campusCount > 1);
  const groups = groupItems(items);

  return (
    <nav aria-label={t("shell.menu")} className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {groups.map((g) => (
        <div key={g.key}>
          {!collapsed && g.key !== "nav.groupMain" && (
            <p className="px-3 pb-1.5 text-[0.7rem] font-semibold tracking-wide text-subtle uppercase">{t(g.key)}</p>
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const href = item.path ? `${base}/${item.path}` : base;
              const active = item.path ? pathname === href || pathname.startsWith(href + "/") : pathname === base;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    title={collapsed ? t(item.label) : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-9 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                      active ? "font-medium text-accent" : "text-muted hover:bg-sunken hover:text-fg",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-xl bg-accent-soft"
                        transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      />
                    )}
                    <Icon className="relative size-[1.05rem] shrink-0" />
                    {!collapsed && <span className="relative truncate">{t(item.label)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ data, collapsed }: { data: ShellData; collapsed: boolean }) {
  return (
    <aside
      className={cn(
        "no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-glass backdrop-blur-xl transition-[width] duration-300 ease-[var(--ease-out-soft)] lg:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <div className={cn("p-3", collapsed && "px-2")}>
        <WorkspaceSwitcher data={data} compact={collapsed} />
      </div>
      <SidebarNav data={data} collapsed={collapsed} />
    </aside>
  );
}
