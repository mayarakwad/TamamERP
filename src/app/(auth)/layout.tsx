import { getI18n } from "@/lib/i18n/server";
import { getSystem } from "@/lib/system";
import { Logo } from "@/components/ui/logo";
import { QuickToggles } from "@/components/appearance/quick-toggles";
import { Showcase } from "./showcase";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const { t } = await getI18n();
  const { instanceName } = await getSystem();
  // The default name is translated; a custom platform name is shown as typed.
  const name = instanceName === "Tamam" ? t("app.name") : instanceName;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-5 sm:px-10">
        <header className="flex items-center justify-between">
          <Logo name={name} />
          <QuickToggles />
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</main>
        <footer className="text-xs text-subtle">© 2026 {name}</footer>
      </div>
      <Showcase />
    </div>
  );
}
