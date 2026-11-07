"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Building, Circle, Palette, Rocket, Sparkles, Upload, UserPlus } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { LiveWallpaper } from "@/components/appearance/live-wallpaper";
import { pick, type MessageKey } from "@/lib/i18n";
import type { DashboardLayout } from "@/app/actions/dashboard";
import { DashboardGrid, type Widget } from "./grid";
import { Greeting } from "./home-dashboard";
import { navFor } from "@/lib/modules";
import type { OrgType, Role } from "@/lib/rbac";

interface Props {
  slug: string;
  orgType: OrgType;
  role: Role;
  stage: string;
  now: string;
  greeting: "morning" | "afternoon" | "evening";
  firstName: string;
  layout: DashboardLayout | null;
  campuses: { id: string; name: string; nameAr: string | null; code: string; color: string | null; members: number }[];
  members: { id: string; name: string; nameAr: string | null; avatarColor: string | null; role: Role; title: string | null; titleAr: string | null }[];
}

/** Dashboard for business and school workspaces until their modules land (stages 2 and 3). */
export function WorkspaceDashboard(p: Props) {
  const { t, locale } = useI18n();
  const base = `/w/${p.slug}`;
  const upcoming = navFor(p.orgType, p.role).filter((n) => n.stage === p.stage).slice(0, 8);

  const widgets: Widget[] = [
    {
      id: "next",
      title: t("dashboard.stageNext"),
      span: "half",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("dashboard.stageNext")} icon={<Rocket className="size-4" />} />
          <CardBody>
            <p className="text-sm text-muted">{t("dashboard.stageNextBody", { stage: p.stage })}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {upcoming.map((n, i) => (
                <motion.li key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }}>
                  <Link href={`${base}/${n.path}`} className="lift flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
                    <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
                      <n.icon className="size-4" />
                    </span>
                    {t(n.label)}
                  </Link>
                </motion.li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ),
    },
    {
      id: "setup",
      title: t("dashboard.setupTitle"),
      span: "narrow",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("dashboard.setupTitle")} icon={<Sparkles className="size-4" />} />
          <CardBody>
            <ul className="space-y-1">
              {[
                { icon: Palette, label: t("dashboard.setupBrand"), href: `${base}/settings/workspace` },
                { icon: UserPlus, label: t("dashboard.setupInvite"), href: `${base}/settings/members` },
                { icon: Upload, label: t("dashboard.setupData"), href: `${base}/settings/data` },
                { icon: Sparkles, label: t("dashboard.setupFlow"), href: `${base}/settings/flow` },
              ].map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex items-center gap-3 rounded-xl p-2 text-sm transition hover:bg-sunken">
                    <Circle className="size-4 text-subtle" />
                    <s.icon className="size-4 text-muted" />
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ),
    },
    {
      id: "campuses",
      title: p.orgType === "business" ? t("dashboard.branchesTitle") : t("dashboard.campusesTitle"),
      span: "half",
      node: (
        <Card glass className="h-full">
          <CardHeader title={p.orgType === "business" ? t("dashboard.branchesTitle") : t("dashboard.campusesTitle")} icon={<Building className="size-4" />} />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            {p.campuses.map((c) => (
              <div key={c.id} className="lift rounded-2xl border border-line bg-surface p-4">
                <span className="inline-block h-1.5 w-8 rounded-full" style={{ background: c.color ?? "var(--accent)" }} />
                <p className="mt-3 text-sm font-semibold">{pick(locale, c.name, c.nameAr)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {c.code} · {c.members === 1 ? t("dashboard.memberCountOne") : t("dashboard.memberCount", { count: c.members })}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      ),
    },
    {
      id: "members",
      title: t("dashboard.membersTitle"),
      span: "narrow",
      node: (
        <Card glass className="h-full">
          <CardHeader title={t("dashboard.membersTitle")} />
          <CardBody>
            <ul className="space-y-2.5">
              {p.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.name} color={m.avatarColor} size={34} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{pick(locale, m.name, m.nameAr)}</p>
                    <p className="truncate text-xs text-muted">{pick(locale, m.title ?? "", m.titleAr) || t(`roles.${m.role}` as MessageKey)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ),
    },
  ];

  return (
    <>
      <LiveWallpaper scope="dashboard" />
      <DashboardGrid slug={p.slug} widgets={widgets} saved={p.layout} header={<Greeting greeting={p.greeting} firstName={p.firstName} now={p.now} />} />
    </>
  );
}
