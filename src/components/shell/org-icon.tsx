import { Building2, GraduationCap, Home } from "lucide-react";
import type { OrgType } from "@/lib/rbac";

export const ORG_ICONS = { business: Building2, school: GraduationCap, home: Home } as const;

export function OrgIcon({ type, className }: { type: OrgType; className?: string }) {
  const Icon = ORG_ICONS[type];
  return <Icon className={className} />;
}
