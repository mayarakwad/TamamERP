import type { Metadata } from "next";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { hashToken, SESSION_COOKIE } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { ProfileForms } from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ params }: PageProps<"/w/[slug]/settings/profile">) {
  const { slug } = await params;
  const ws = await getWorkspace(slug);
  const { t } = await getI18n();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentId = token ? hashToken(token) : "";
  const sessions = await db.session.findMany({ where: { userId: ws.viewer.id }, orderBy: { createdAt: "desc" }, take: 8 });
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.profileTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t("settings.profileSubtitle")}</p>
      <ProfileForms
        viewer={{ name: ws.viewer.name, nameAr: ws.viewer.nameAr ?? "", phone: ws.viewer.phone ?? "", email: ws.viewer.email, avatarColor: ws.viewer.avatarColor }}
        sessions={sessions.map((s) => ({ id: s.id.slice(0, 8), current: s.id === currentId, userAgent: s.userAgent, createdAt: s.createdAt.toISOString(), ip: s.ip }))}
      />
    </div>
  );
}
