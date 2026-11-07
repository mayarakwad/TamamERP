import type { OrgType, Role } from "@/lib/rbac";

export interface ShellData {
  slug: string;
  orgName: string;
  orgNameAr: string | null;
  orgType: OrgType;
  isSandbox: boolean;
  campusCount: number;
  role: Role;
  title: string | null;
  titleAr: string | null;
  viewer: { name: string; nameAr: string | null; email: string; avatarColor: string | null };
  workspaces: { slug: string; name: string; nameAr: string | null; type: OrgType; role: Role }[];
}
