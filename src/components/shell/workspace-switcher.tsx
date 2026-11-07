"use client";

import { DropdownMenu } from "radix-ui";
import { Check, ChevronsUpDown } from "lucide-react";
import { useI18n } from "@/components/providers";
import { pick, type MessageKey } from "@/lib/i18n";
import { switchWorkspace } from "@/app/actions/auth";
import { cn } from "@/lib/cn";
import type { ShellData } from "./types";
import { OrgIcon } from "./org-icon";

export function WorkspaceSwitcher({ data, compact }: { data: ShellData; compact?: boolean }) {
  const { t, locale, dir } = useI18n();
  const name = pick(locale, data.orgName, data.orgNameAr);
  return (
    <DropdownMenu.Root dir={dir}>
      <DropdownMenu.Trigger
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl p-2 text-start transition hover:bg-sunken focus-visible:outline-2",
          compact && "justify-center",
        )}
        aria-label={t("shell.switchWorkspace")}
      >
        {data.logoUrl ? (
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.logoUrl} alt="" className="size-full object-contain p-1" />
          </span>
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg shadow-sm">
            <OrgIcon type={data.orgType} className="size-5" />
          </span>
        )}
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block truncate text-xs text-muted">{t(`orgTypes.${data.orgType}` as MessageKey)} · {t(`roles.${data.role}` as MessageKey)}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-subtle" />
          </>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lift data-[state=open]:animate-[pop-in_160ms_ease-out]"
        >
          <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium text-subtle">{t("shell.yourWorkspaces")}</DropdownMenu.Label>
          {data.workspaces.map((w) => (
            <DropdownMenu.Item
              key={w.slug}
              onSelect={() => w.slug !== data.slug && switchWorkspace(w.slug)}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-sunken"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
                <OrgIcon type={w.type} className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{pick(locale, w.name, w.nameAr)}</span>
                <span className="block text-xs text-muted">{t(`roles.${w.role}` as MessageKey)}</span>
              </span>
              {w.slug === data.slug && <Check className="size-4 text-accent" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
