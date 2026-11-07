import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/auth/dal";
import { getSystem } from "@/lib/system";

// "/" sends people to the workspace they used last, or to sign in.
// A fresh server goes to the setup wizard first.
export async function GET() {
  if (!(await getSystem()).installed) redirect("/setup");
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const memberships = await db.membership.findMany({
    where: { userId: viewer.id, status: "active" },
    include: { org: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  const m = memberships.find((x) => x.orgId === viewer.lastOrgId) ?? memberships[0];
  redirect(m ? `/w/${m.org.slug}` : "/signup");
}
