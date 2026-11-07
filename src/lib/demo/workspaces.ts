// The three demo workspaces and the people in them. Some people belong to
// more than one workspace on purpose: one login, many worlds.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { seedHomeDemo } from "./home";
import { reindexOrg } from "../search/index-core";
import { writeDemoLogo } from "./logos";

/** Works with the client or inside a transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

export const DEMO_PASSWORD = "demo1234";

export const DEMO_PEOPLE = {
  hessa: { email: "hessa@tamam.demo", name: "Hessa Al-Mansouri", nameAr: "حصة المنصوري", avatarColor: "#8A1538", phone: "+974 5512 3344" },
  khalid: { email: "khalid@tamam.demo", name: "Khalid Al-Mansouri", nameAr: "خالد المنصوري", avatarColor: "#0B6E8A", phone: "+974 3345 6612" },
  noora: { email: "noora@tamam.demo", name: "Noora Al-Mansouri", nameAr: "نورة المنصوري", avatarColor: "#C4467A", phone: "+974 6612 9087" },
  maria: { email: "maria@tamam.demo", name: "Maria Santos", nameAr: "ماريا سانتوس", avatarColor: "#2E9E6B", phone: "+974 7012 4455" },
  priya: { email: "priya@tamam.demo", name: "Priya Nair", nameAr: "بريا ناير", avatarColor: "#8E5CC9", phone: "+974 5590 1122" },
  omar: { email: "omar@tamam.demo", name: "Omar Haddad", nameAr: "عمر حداد", avatarColor: "#B5541C", phone: "+974 3390 7781" },
  joseph: { email: "joseph@tamam.demo", name: "Joseph Mathew", nameAr: "جوزيف ماثيو", avatarColor: "#5A6B7A", phone: "+974 7788 2210" },
  fatima: { email: "fatima@tamam.demo", name: "Dr. Fatima Al-Sulaiti", nameAr: "د. فاطمة السليطي", avatarColor: "#4B3FA8", phone: "+974 5501 7766" },
  sarah: { email: "sarah@tamam.demo", name: "Sarah Mitchell", nameAr: "سارة ميتشل", avatarColor: "#1F7A4D", phone: "+974 3301 4589" },
  rami: { email: "rami@tamam.demo", name: "Rami Khoury", nameAr: "رامي خوري", avatarColor: "#A86B00", phone: "+974 5567 3321" },
  aisha: { email: "aisha@tamam.demo", name: "Aisha Rahman", nameAr: "عائشة رحمن", avatarColor: "#D9644A", phone: "+974 6634 8890" },
  yousef: { email: "yousef@tamam.demo", name: "Yousef Al-Emadi", nameAr: "يوسف العمادي", avatarColor: "#2F7DB8", phone: "+974 5578 6543" },
} as const;

export type DemoPerson = keyof typeof DEMO_PEOPLE;

/** Accounts shown as one-click chips on the login page. */
export const DEMO_LOGINS: { person: DemoPerson; workspace: "home" | "business" | "school"; role: string }[] = [
  { person: "hessa", workspace: "home", role: "owner" },
  { person: "maria", workspace: "home", role: "member" },
  { person: "khalid", workspace: "business", role: "owner" },
  { person: "priya", workspace: "business", role: "accountant" },
  { person: "fatima", workspace: "school", role: "owner" },
  { person: "aisha", workspace: "school", role: "teacher" },
];

export async function seedWorkspaces(db: Db, passwordHash: string, now = new Date()) {
  const users = {} as Record<DemoPerson, string>;
  for (const [key, p] of Object.entries(DEMO_PEOPLE)) {
    const u = await db.user.create({
      data: { ...p, passwordHash, preferences: key === "hessa" || key === "fatima" ? { locale: "en" } : {} },
    });
    users[key as DemoPerson] = u.id;
  }

  // ── Home ──
  const home = await db.organization.create({
    data: {
      type: "home",
      name: "Al-Mansouri Home",
      nameAr: "بيت المنصوري",
      slug: "al-mansouri-home",
      address: "Villa 14, Street 912, Zone 55, Al Waab, Doha",
      addressAr: "فيلا ١٤، شارع ٩١٢، منطقة ٥٥، الوعب، الدوحة",
    },
  });
  await db.membership.createMany({
    data: [
      { orgId: home.id, userId: users.hessa, role: "owner", title: "Runs the household", titleAr: "مسؤولة المنزل" },
      { orgId: home.id, userId: users.khalid, role: "admin", title: "Co-approver", titleAr: "معتمد مشارك" },
      { orgId: home.id, userId: users.noora, role: "member", title: "Daughter", titleAr: "الابنة" },
      { orgId: home.id, userId: users.maria, role: "member", title: "Household helper", titleAr: "مساعدة منزلية" },
    ],
  });
  await seedHomeDemo(db, home.id, { hessa: users.hessa, khalid: users.khalid, noora: users.noora, maria: users.maria }, now);

  // ── Business ── (modules arrive in stage 2)
  const biz = await db.organization.create({
    data: {
      type: "business",
      name: "Sadeem Office & Home Supplies W.L.L.",
      nameAr: "سديم للوازم المكاتب والمنازل ذ.م.م",
      slug: "sadeem",
      address: "Building 45, Street 230, Zone 43, Salwa Road, Doha",
      addressAr: "مبنى ٤٥، شارع ٢٣٠، منطقة ٤٣، طريق سلوى، الدوحة",
      phone: "+974 4455 2030",
      email: "accounts@sadeem.example",
      crNumber: "148392",
      brandColor: "#0B6E8A",
    },
  });
  const warehouse = await db.campus.create({ data: { orgId: biz.id, code: "SAL", name: "Salwa Road showroom", nameAr: "صالة عرض طريق سلوى" } });
  await db.campus.create({ data: { orgId: biz.id, code: "BRK", name: "Birkat Al Awamer warehouse", nameAr: "مستودع بركة العوامر" } });
  await db.membership.createMany({
    data: [
      { orgId: biz.id, userId: users.khalid, role: "owner", title: "Managing partner", titleAr: "الشريك المدير" },
      { orgId: biz.id, userId: users.omar, role: "admin", title: "Operations manager", titleAr: "مدير العمليات" },
      { orgId: biz.id, userId: users.priya, role: "accountant", title: "Chief accountant", titleAr: "رئيسة الحسابات" },
      { orgId: biz.id, userId: users.joseph, role: "employee", title: "Storekeeper", titleAr: "أمين المخزن", campusId: warehouse.id },
    ],
  });

  // ── School group ── (modules arrive in stage 3)
  const school = await db.organization.create({
    data: {
      type: "school",
      name: "Al Manara International School",
      nameAr: "مدرسة المنارة الدولية",
      slug: "al-manara",
      address: "Group office, Building 8, Street 340, Zone 52, Al Waab, Doha",
      addressAr: "مكتب المجموعة، مبنى ٨، شارع ٣٤٠، منطقة ٥٢، الوعب، الدوحة",
      phone: "+974 4400 8800",
      email: "info@almanara.example",
      brandColor: "#4B3FA8",
    },
  });
  const campuses = await Promise.all(
    [
      { code: "WAB", name: "Al Waab campus", nameAr: "فرع الوعب", color: "#4B3FA8" },
      { code: "LUS", name: "Lusail campus", nameAr: "فرع لوسيل", color: "#0B6E8A" },
      { code: "WAK", name: "Al Wakra campus", nameAr: "فرع الوكرة", color: "#B5541C" },
    ].map((c) => db.campus.create({ data: { ...c, orgId: school.id } })),
  );
  await db.membership.createMany({
    data: [
      { orgId: school.id, userId: users.fatima, role: "owner", title: "Group director", titleAr: "مديرة المجموعة" },
      { orgId: school.id, userId: users.sarah, role: "admin", title: "Principal, Lusail", titleAr: "مديرة فرع لوسيل", campusId: campuses[1].id },
      { orgId: school.id, userId: users.rami, role: "accountant", title: "Finance officer", titleAr: "مسؤول المالية" },
      { orgId: school.id, userId: users.aisha, role: "teacher", title: "Grade 5 homeroom", titleAr: "رائدة الصف الخامس", campusId: campuses[0].id },
      { orgId: school.id, userId: users.hessa, role: "parent", title: "Parent of Ahmed (Grade 7)", titleAr: "ولية أمر أحمد (الصف السابع)" },
      { orgId: school.id, userId: users.yousef, role: "employee", title: "Transport coordinator", titleAr: "منسق النقل" },
    ],
  });

  // Where each person lands after signing in.
  const landing: Partial<Record<DemoPerson, string>> = {
    hessa: home.id, khalid: home.id, noora: home.id, maria: home.id,
    priya: biz.id, omar: biz.id, joseph: biz.id,
    fatima: school.id, sarah: school.id, rami: school.id, aisha: school.id, yousef: school.id,
  };
  for (const [person, orgId] of Object.entries(landing)) {
    await db.user.update({ where: { id: users[person as DemoPerson] }, data: { lastOrgId: orgId } });
  }

  for (const org of [home, biz, school]) await reindexOrg(db, org.id);
  const logos = [
    [home, "home", "#8A1538"],
    [biz, "business", "#0B6E8A"],
    [school, "school", "#4B3FA8"],
  ] as const;
  for (const [org, kind, color] of logos) {
    await db.organization.update({ where: { id: org.id }, data: { logoPath: await writeDemoLogo(org.id, kind, color), brandColor: color } });
  }

  return { users, home, biz, school };
}
