import { getI18n } from "@/lib/i18n/server";
import { Logo } from "@/components/ui/logo";
import { QuickToggles } from "@/components/appearance/quick-toggles";
import { Showcase } from "./showcase";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const { t } = await getI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-5 sm:px-10">
        <header className="flex items-center justify-between">
          <Logo name={t("app.name")} />
          <QuickToggles />
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</main>
        <footer className="text-xs text-subtle">© 2026 {t("app.name")} · Doha</footer>
      </div>
      <Showcase />
    </div>
  );
}
