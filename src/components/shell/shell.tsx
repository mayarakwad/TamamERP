"use client";

import { useState, useSyncExternalStore } from "react";
import { Dialog, Direction } from "radix-ui";
import { Menu, PanelLeftClose, PanelLeftOpen, Search, Sparkles, X, FlaskConical } from "lucide-react";
import { useI18n } from "@/components/providers";
import { QuickToggles } from "@/components/appearance/quick-toggles";
import { LiveWallpaper } from "@/components/appearance/live-wallpaper";
import { Sidebar, SidebarNav } from "./sidebar";
import { UserMenu } from "./user-menu";
import { CommandPalette } from "./command-palette";
import { FlowSheet } from "./flow-sheet";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { ShellData } from "./types";

const COLLAPSE_KEY = "tamam.sidebarCollapsed";
const COLLAPSE_EVENT = "tamam:sidebar";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function Shell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const { t, dir } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);

  // Collapsed sidebar is a per-device convenience, so it lives in localStorage.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const toggleCollapsed = () => writeCollapsed(!collapsed);

  const CollapseIcon = (dir === "rtl") !== collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <Direction.Provider dir={dir}>
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        {t("shell.skipToContent")}
      </a>
      <LiveWallpaper scope="everywhere" />
      <div className="flex min-h-dvh">
        <Sidebar data={data} collapsed={collapsed} />

        <div className="flex min-w-0 flex-1 flex-col">
          {data.isSandbox && (
            <div className="no-print flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-xs font-medium text-black">
              <FlaskConical className="size-3.5" /> {t("shell.sandbox")}
            </div>
          )}
          <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-glass px-3 backdrop-blur-xl sm:px-5">
            <button
              type="button"
              className="grid size-9 place-items-center rounded-xl text-muted hover:bg-sunken lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label={t("shell.menu")}
            >
              <Menu className="size-5" />
            </button>
            <button
              type="button"
              className="hidden size-9 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-fg lg:grid"
              onClick={toggleCollapsed}
              aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
            >
              <CollapseIcon className="size-[1.1rem]" />
            </button>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface/70 px-3.5 text-sm text-subtle shadow-sm transition hover:border-accent-line sm:max-w-md"
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate">{t("shell.searchPlaceholder")}</span>
              <kbd className="ms-auto hidden rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] sm:inline" dir="ltr">
                ⌘K
              </kbd>
            </button>

            <div className="ms-auto flex items-center gap-1.5">
              <QuickToggles className="hidden sm:flex" />
              <button
                type="button"
                onClick={() => setFlowOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent-soft px-3 text-sm font-medium text-accent transition hover:brightness-95 dark:hover:brightness-110"
              >
                <Sparkles className="size-4" />
                <span className="hidden md:inline">{t("shell.openFlow")}</span>
              </button>
              <UserMenu data={data} />
            </div>
          </header>

          <main id="content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-[fade-in_150ms_ease-out] lg:hidden" />
          <Dialog.Content dir={dir} className="fixed inset-y-0 start-0 z-50 flex w-72 flex-col bg-surface shadow-lift data-[state=open]:animate-[page-in_200ms_ease-out] lg:hidden">
            <Dialog.Title className="sr-only">{t("shell.menu")}</Dialog.Title>
            <div className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <WorkspaceSwitcher data={data} />
              </div>
              <Dialog.Close className="grid size-9 place-items-center rounded-xl text-muted hover:bg-sunken" aria-label={t("common.close")}>
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <SidebarNav data={data} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-line p-3 sm:hidden">
              <QuickToggles />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CommandPalette data={data} open={paletteOpen} onOpenChange={setPaletteOpen} />
      <FlowSheet open={flowOpen} onOpenChange={setFlowOpen} />
    </Direction.Provider>
  );
}
