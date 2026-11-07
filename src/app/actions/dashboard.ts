"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getWorkspace } from "@/lib/auth/dal";

const layoutSchema = z.object({
  order: z.array(z.string().max(40)).max(40),
  hidden: z.array(z.string().max(40)).max(40),
});

export type DashboardLayout = z.infer<typeof layoutSchema>;

/** Save this person's widget order + hidden widgets for this workspace (null = back to default). */
export async function saveDashboardLayout(slug: string, layout: DashboardLayout | null) {
  const ws = await getWorkspace(slug);
  await db.membership.update({
    where: { id: ws.membership.id },
    data: { dashboardLayout: layout ? layoutSchema.parse(layout) : Prisma.DbNull },
  });
}
