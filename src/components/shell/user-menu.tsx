"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { LogOut, Palette, User } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Avatar } from "@/components/ui/avatar";
import { pick, type MessageKey } from "@/lib/i18n";
import { logout } from "@/app/actions/auth";
import type { ShellData } from "./types";

export function UserMenu({ data }: { data: ShellData }) {
  const { t, locale, dir } = useI18n();
  const name = pick(locale, data.viewer.name, data.viewer.nameAr);
  const title = pick(locale, data.title ?? "", data.titleAr) || t(`roles.${data.role}` as MessageKey);
  const item = "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-sunken";
  return (
    <DropdownMenu.Root dir={dir}>
      <DropdownMenu.Trigger className="rounded-full transition hover:ring-4 hover:ring-[var(--ring)]/15" aria-label={name}>
        <Avatar name={data.viewer.name} color={data.viewer.avatarColor} size={34} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lift data-[state=open]:animate-[pop-in_160ms_ease-out]"
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar name={data.viewer.name} color={data.viewer.avatarColor} size={38} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted">{title}</p>
              <p className="truncate text-xs text-subtle" dir="ltr">{data.viewer.email}</p>
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={item}>
            <Link href={`/w/${data.slug}/settings/profile`}>
              <User className="size-4 text-muted" /> {t("nav.profile")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href={`/w/${data.slug}/settings/appearance`}>
              <Palette className="size-4 text-muted" /> {t("nav.appearance")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => logout()}>
            <LogOut className="size-4 text-muted" /> {t("auth.signOut")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
