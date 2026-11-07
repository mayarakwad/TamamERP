import Link from "next/link";
import { SearchX } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { buttonClass } from "@/components/ui/button";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-sunken text-muted">
        <SearchX className="size-6" />
      </span>
      <h1 className="mt-5 text-xl font-semibold">{t("empty.notFound")}</h1>
      <p className="mt-2 text-sm text-muted">{t("empty.notAllowedBody")}</p>
      <Link href="/" className={buttonClass("secondary", "md", "mt-6")}>
        {t("empty.goHome")}
      </Link>
    </div>
  );
}
