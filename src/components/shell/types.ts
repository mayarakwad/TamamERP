import type { OrgType, Permission, Role } from "@/lib/rbac";

export interface ShellData {
  slug: string;
  orgName: string;
  orgNameAr: string | null;
  orgType: OrgType;
  isSandbox: boolean;
  currency: string;
  timezone: string;
  /** URL of the organization's logo, if one was uploaded */
  logoUrl: string | null;
  campusCount: number;
  /** Schools with more than one campus: which one is showing */
  campus?: { options: { id: string; name: string; nameAr: string | null; color: string | null }[]; selected: string | null; locked: boolean };
  role: Role;
  extras: Permission[];
  title: string | null;
  titleAr: string | null;
  viewer: { name: string; nameAr: string | null; email: string; avatarColor: string | null };
  workspaces: { slug: string; name: string; nameAr: string | null; type: OrgType; role: Role }[];
}
