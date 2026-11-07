import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getSystem } from "@/lib/system";
import { getI18n } from "@/lib/i18n/server";
import { buttonClass } from "@/components/ui/button";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function SignupPage() {
  const system = await getSystem();
  if (!system.installed) redirect("/setup");
  if (!system.allowSignup) {
    const { t } = await getI18n();
    return (
      <div className="page-enter text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-sunken text-muted">
          <Lock className="size-6" />
        </span>
        <p className="mt-5 text-muted">{t("signup.closed")}</p>
        <Link href="/login" className={buttonClass("secondary", "md", "mt-6")}>
          {t("auth.signIn")}
        </Link>
      </div>
    );
  }
  return <SignupForm />;
}
