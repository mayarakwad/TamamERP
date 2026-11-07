import { getViewerWorkspaces, getWorkspace } from "@/lib/auth/dal";
import { Shell } from "@/components/shell/shell";
import type { ShellData } from "@/components/shell/types";
import type { OrgType, Role } from "@/lib/rbac";

// Who you are decides everything in a workspace, so this layout waits for the
// session. Navigations between its pages still show skeletons instantly
// (loading.tsx), while their data streams in.
export const instant = false;

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const ws = await getWorkspace(slug);
  const workspaces = await getViewerWorkspaces(ws.viewer.id);

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
    role: ws.role,
    extras: ws.extras,
    title: ws.membership.title,
    titleAr: ws.membership.titleAr,
    viewer: { name: ws.viewer.name, nameAr: ws.viewer.nameAr, email: ws.viewer.email, avatarColor: ws.viewer.avatarColor },
    workspaces: workspaces.map((w) => ({ slug: w.org.slug, name: w.org.name, nameAr: w.org.nameAr, type: w.org.type as OrgType, role: w.role as Role })),
  };

  return <Shell data={data}>{children}</Shell>;
}
