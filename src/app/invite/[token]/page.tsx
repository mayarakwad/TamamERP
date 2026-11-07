import type { Metadata } from "next";
import { connection } from "next/server";
import { getViewer } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { inviteDetails } from "@/app/actions/members";
import { Logo } from "@/components/ui/logo";
import { InviteAccept } from "./invite-accept";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };
export const instant = false;

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  await connection();
  const [details, viewer, { t }] = await Promise.all([inviteDetails(token), getViewer(), getI18n()]);
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo name={t("app.name")} />
        </div>
        <InviteAccept token={token} details={details} viewer={viewer ? { email: viewer.email, name: viewer.name } : null} />
      </div>
    </main>
  );
}
