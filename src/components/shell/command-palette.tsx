"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { Languages, Moon, Palette, Search, Sun } from "lucide-react";
import { useI18n, usePrefs } from "@/components/providers";
import { navFor } from "@/lib/modules";
import { THEMES } from "@/lib/themes";
import { pick } from "@/lib/i18n";
import { switchWorkspace } from "@/app/actions/auth";
import type { ShellData } from "./types";
import { OrgIcon } from "./org-icon";

export function CommandPalette({ data, open, onOpenChange }: { data: ShellData; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, locale, dir } = useI18n();
  const { prefs, update } = usePrefs();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const items = navFor(data.orgType, data.role);
  const itemClass = "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-fg data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent";
  const isDark = prefs.mode === "dark" || (prefs.mode === "system" && typeof document !== "undefined" && document.documentElement.dataset.scheme === "dark");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <Dialog.Content
          dir={dir}
          className="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-lift data-[state=open]:animate-[pop-in_180ms_var(--ease-out-soft)]"
        >
          <Dialog.Title className="sr-only">{t("shell.searchPlaceholder")}</Dialog.Title>
          <Command loop className="flex max-h-[min(70vh,32rem)] flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-subtle" />
              <Command.Input autoFocus placeholder={t("palette.placeholder")} className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-subtle" />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] text-subtle">Esc</kbd>
            </div>
            <Command.List className="overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">{t("palette.empty")}</Command.Empty>
              <Command.Group heading={t("palette.pages")}>
                {items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${t(item.label)} ${item.path}`}
                    onSelect={() => run(() => router.push(item.path ? `/w/${data.slug}/${item.path}` : `/w/${data.slug}`))}
                    className={itemClass}
                  >
                    <item.icon className="size-4 text-muted" />
                    {t(item.label)}
                  </Command.Item>
                ))}
              </Command.Group>
              {data.workspaces.length > 1 && (
                <Command.Group heading={t("palette.workspaces")}>
                  {data.workspaces.map((w) => (
                    <Command.Item key={w.slug} value={`${w.name} ${w.nameAr ?? ""}`} onSelect={() => run(() => switchWorkspace(w.slug))} className={itemClass}>
                      <OrgIcon type={w.type} className="size-4 text-muted" />
                      {pick(locale, w.name, w.nameAr)}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading={t("palette.preferences")}>
                <Command.Item value="dark light mode theme" onSelect={() => run(() => update({ mode: isDark ? "light" : "dark" }))} className={itemClass}>
                  {isDark ? <Sun className="size-4 text-muted" /> : <Moon className="size-4 text-muted" />}
                  {isDark ? t("palette.toggleLight") : t("palette.toggleDark")}
                </Command.Item>
                <Command.Item value="language arabic english عربي" onSelect={() => run(() => update({ locale: locale === "ar" ? "en" : "ar" }))} className={itemClass}>
                  <Languages className="size-4 text-muted" />
                  {locale === "ar" ? t("palette.switchToEnglish") : t("palette.switchToArabic")}
                </Command.Item>
                {THEMES.map((th) => (
                  <Command.Item key={th.id} value={`theme ${th.name} ${th.nameAr}`} onSelect={() => run(() => update({ theme: th.id, accent: null }))} className={itemClass}>
                    <Palette className="size-4 text-muted" />
                    {t("settings.theme")}: {locale === "ar" ? th.nameAr : th.name}
                    <span className="ms-auto size-3 rounded-full" style={{ background: th.swatch[2] }} />
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
