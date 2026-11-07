import Link from "next/link";
import { notFound } from "next/navigation";
import { Compass } from "lucide-react";
import { getWorkspace } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { findNav, navFor } from "@/lib/modules";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Pages that belong to a later stage show what they'll do instead of a 404.
// Pages this role can't see are a 404, so nothing leaks about their existence.
export default async function ComingSoon({ params }: PageProps<"/w/[slug]/[...rest]">) {
  const { slug, rest } = await params;
  const ws = await getWorkspace(slug);
  const { t } = await getI18n();
  const path = rest.join("/");
  const item = findNav(ws.orgType, path);
  if (!item || !navFor(ws.orgType, ws.role).some((n) => n.id === item.id)) notFound();

  const Icon = item.icon ?? Compass;
  const stage = item.stage.replace("1b", "1b");
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card className="relative overflow-hidden p-8 text-center sm:p-12">
        <div aria-hidden className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-accent-soft to-transparent" />
        <span className="relative mx-auto grid size-16 place-items-center rounded-2xl bg-accent text-accent-fg shadow-lift">
          <Icon className="size-7" />
        </span>
        <h1 className="relative mt-6 text-2xl font-semibold tracking-tight">{t("empty.comingTitle", { name: t(item.label) })}</h1>
        <p className="relative mt-2 text-sm text-muted">{t("empty.comingBody", { stage })}</p>
        {item.desc && <p className="relative mx-auto mt-4 max-w-md text-base text-fg">{t(item.desc)}</p>}
        <Link href={`/w/${slug}`} className={buttonClass("secondary", "md", "relative mt-8")}>
          {t("empty.goHome")}
        </Link>
      </Card>
    </div>
  );
}
