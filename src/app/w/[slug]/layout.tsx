import { getViewerWorkspaces, getWorkspace } from "@/lib/auth/dal";
import { getSchool } from "@/lib/school/scope";
import { Shell } from "@/components/shell/shell";
import type { ShellData } from "@/components/shell/types";
import type { OrgType, Role } from "@/lib/rbac";
import { flowAccess, getFlowConfig, loadApiKey } from "@/lib/flow/settings";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";

// Who you are decides everything in a workspace, so this layout waits for the
// session. Navigations between its pages still show skeletons instantly
// (loading.tsx), while their data streams in.
export const instant = false;

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const ws = await getWorkspace(slug);
  const workspaces = await getViewerWorkspaces(ws.viewer.id);
  const school = ws.orgType === "school" && ws.org.campuses.length > 1 && ws.role !== "parent" ? await getSchool(slug) : null;

  // Flow: is it usable for this person, and how does it look for them?
  const flowCfg = await getFlowConfig(ws.org.id);
  const access = flowAccess(flowCfg, ws.role);
  const flowState = !access.ok ? (access.reason === "limit" ? "ok" : access.reason) : (await loadApiKey(ws.org.id)) ? "ok" : "badkey";
  const kids =
    ws.orgType === "school" && ws.role === "parent"
      ? await db.student.findMany({ where: { orgId: ws.org.id, status: "active", guardians: { some: { guardian: { userId: ws.viewer.id } } } }, select: { name: true, nameAr: true }, orderBy: { dob: "asc" } })
      : [];

  const data: ShellData = {
    slug,
    orgName: ws.org.name,
    orgNameAr: ws.org.nameAr,
    orgType: ws.orgType,
    isSandbox: ws.org.isSandbox,
    currency: ws.org.currency,
    timezone: ws.org.timezone,
    logoUrl: ws.org.logoPath ? `/api/w/${slug}/logo?v=${ws.org.updatedAt.getTime()}` : null,
    campusCount: ws.org.campuses.length,
    campus: school
      ? { options: ws.org.campuses.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, color: c.color })), selected: school.campus?.id ?? null, locked: school.locked }
      : undefined,
    role: ws.role,
    extras: ws.extras,
    title: ws.membership.title,
    titleAr: ws.membership.titleAr,
    viewer: { name: ws.viewer.name, nameAr: ws.viewer.nameAr, email: ws.viewer.email, avatarColor: ws.viewer.avatarColor },
    workspaces: workspaces.map((w) => ({ slug: w.org.slug, name: w.org.name, nameAr: w.org.nameAr, type: w.org.type as OrgType, role: w.role as Role })),
    flow: {
      state: flowState,
      canConfigure: ws.can("flow.configure"),
      defaults: { name: flowCfg.name, avatar: flowCfg.avatar, tone: flowCfg.tone },
      personal: { name: ws.viewer.prefs.flowName, avatar: ws.viewer.prefs.flowAvatar, tone: ws.viewer.prefs.flowTone },
      children: kids.map((k) => pick(ws.viewer.prefs.locale, k.name, k.nameAr).split(" ")[0]),
    },
  };

  return <Shell data={data}>{children}</Shell>;
}
