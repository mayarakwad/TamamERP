// Demo + default data for Home workspaces. Used by the seed script and by
// signup (defaults only). No server-only imports, so plain Node can run it.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { rng, daysAgo, atHour, type Rng } from "./random";

/** Works with the client or inside a transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_CATEGORIES = [
  { key: "groceries", name: "Groceries", nameAr: "البقالة", icon: "shopping-cart", color: "#2E9E6B", budget: 4500 },
  { key: "dining", name: "Dining out", nameAr: "المطاعم والتوصيل", icon: "utensils", color: "#D9644A", budget: 1200 },
  { key: "transport", name: "Fuel & transport", nameAr: "الوقود والمواصلات", icon: "fuel", color: "#5A6B7A", budget: 900 },
  { key: "bills", name: "Bills & utilities", nameAr: "الفواتير والخدمات", icon: "receipt", color: "#2F7DB8", budget: 4800 },
  { key: "school", name: "School supplies", nameAr: "المستلزمات المدرسية", icon: "pencil-ruler", color: "#E0A030", budget: 800 },
  { key: "kids", name: "Kids & activities", nameAr: "الأطفال والأنشطة", icon: "baby", color: "#C4467A", budget: 1000 },
  { key: "health", name: "Health", nameAr: "الصحة", icon: "heart-pulse", color: "#C2362F", budget: 600 },
  { key: "electronics", name: "Electronics", nameAr: "الإلكترونيات", icon: "smartphone", color: "#8E5CC9", budget: 1500 },
  { key: "furniture", name: "Furniture & home", nameAr: "الأثاث والمنزل", icon: "sofa", color: "#B5541C", budget: 1500 },
  { key: "maintenance", name: "Repairs & maintenance", nameAr: "الصيانة والإصلاح", icon: "wrench", color: "#7A6553", budget: 700 },
  { key: "gifts", name: "Gifts & occasions", nameAr: "الهدايا والمناسبات", icon: "gift", color: "#A86B00", budget: 800 },
  { key: "other", name: "Other", nameAr: "أخرى", icon: "circle-ellipsis", color: "#6B625C", budget: 500 },
] as const;

export type CategoryKey = (typeof DEFAULT_CATEGORIES)[number]["key"];

/** Categories + default monthly budgets for a brand-new home. */
export async function createHomeDefaults(db: Db, orgId: string) {
  const ids: Record<string, string> = {};
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    const cat = await db.expenseCategory.create({
      data: { orgId, key: c.key, name: c.name, nameAr: c.nameAr, icon: c.icon, color: c.color, sort: i },
    });
    ids[c.key] = cat.id;
    await db.budget.create({
      data: { orgId, categoryId: cat.id, month: "default", amount: c.budget * 100 },
    });
  }
  return ids as Record<CategoryKey, string>;
}

interface HomePeople {
  hessa: string; // owner, runs the household
  khalid: string; // admin, co-approver
  noora: string; // teenager
  maria: string; // household helper, pays cash for groceries
}

// Merchants a Doha family actually uses.
const DINING = ["Talabat", "Snoonu", "Karak & Chapati, Souq Waqif", "Shawarma corner, Al Sadd", "Friday brunch, West Bay"];

interface Draft {
  by: keyof HomePeople;
  cat: CategoryKey;
  amount: number; // riyals
  merchant: string;
  daysAgo: number;
  hour: number;
  note?: string;
  paidWith?: "cash" | "card" | "transfer";
  status?: "submitted" | "approved" | "rejected" | "reimbursed";
  decisionNote?: string;
}

function planClaims(r: Rng): Draft[] {
  const out: Draft[] = [];
  const DAYS = 182;

  for (let d = DAYS; d >= 8; d--) {
    // Groceries: Maria shops most days for small things, a big weekly shop on Saturdays.
    if (r.chance(0.42)) {
      out.push({ by: "maria", cat: "groceries", amount: r.money(35, 190), merchant: r.pick(["Al Meera Al Waab", "Family Food Centre", "Monoprix The Pearl"]), daysAgo: d, hour: r.int(9, 18), paidWith: "cash" });
    }
    if (d % 7 === 0) {
      out.push({ by: "hessa", cat: "groceries", amount: r.money(420, 880), merchant: r.pick(["Carrefour City Center", "Lulu Hypermarket Al Gharrafa"]), daysAgo: d, hour: r.int(10, 20), note: "Weekly shop" });
    }
    if (r.chance(0.2)) out.push({ by: r.pick(["hessa", "khalid", "noora"] as const), cat: "dining", amount: r.money(45, 260), merchant: r.pick(DINING), daysAgo: d, hour: r.int(12, 22) });
    if (d % 6 === 0) out.push({ by: "khalid", cat: "transport", amount: r.money(140, 190), merchant: "WOQOD Al Waab", daysAgo: d, hour: r.int(7, 21) });
    if (r.chance(0.05)) out.push({ by: "hessa", cat: "health", amount: r.money(40, 320), merchant: r.pick(["Wellcare Pharmacy", "Al Ahli Hospital clinic"]), daysAgo: d, hour: r.int(9, 20) });
    if (r.chance(0.06)) out.push({ by: "hessa", cat: "kids", amount: r.money(150, 450), merchant: r.pick(["Swimming lessons", "Football academy", "Kidzania Doha", "Birthday party gift"]), daysAgo: d, hour: r.int(15, 20) });
    if (r.chance(0.025)) out.push({ by: "khalid", cat: "maintenance", amount: r.money(150, 600), merchant: r.pick(["AC service", "Plumber", "Pest control"]), daysAgo: d, hour: r.int(9, 17) });
    if (r.chance(0.02)) out.push({ by: "hessa", cat: "gifts", amount: r.money(120, 650), merchant: r.pick(["Bateel", "Patchi", "Flowers for a new baby"]), daysAgo: d, hour: r.int(11, 21) });
  }

  // Back to school in late August.
  out.push({ by: "hessa", cat: "school", amount: 1265.5, merchant: "Jarir Bookstore", daysAgo: 74, hour: 18, note: "Back-to-school list for Noora and Ahmed" });
  out.push({ by: "hessa", cat: "school", amount: 640, merchant: "School uniform shop", daysAgo: 72, hour: 11 });
  // One-off purchases.
  out.push({ by: "khalid", cat: "electronics", amount: 2199, merchant: "Virgin Megastore", daysAgo: 121, hour: 19, note: "New router + smart plugs" });
  out.push({ by: "hessa", cat: "furniture", amount: 1890, merchant: "IKEA Doha", daysAgo: 96, hour: 16, note: "Bookshelf and desk lamp for Ahmed's room" });
  out.push({ by: "hessa", cat: "furniture", amount: 640, merchant: "Home Centre", daysAgo: 33, hour: 17 });
  out.push({ by: "noora", cat: "electronics", amount: 899, merchant: "Jarir Bookstore", daysAgo: 41, hour: 20, note: "Gaming headset", status: "rejected", decisionNote: "Let's talk about this one at dinner 🙂" });

  // ── The messy grocery week (the last 7 days) ──
  out.push({ by: "hessa", cat: "groceries", amount: 912.75, merchant: "Carrefour City Center", daysAgo: 6, hour: 19, note: "Monthly stock-up" });
  out.push({ by: "maria", cat: "groceries", amount: 64.5, merchant: "Al Meera Al Waab", daysAgo: 6, hour: 10, paidWith: "cash", status: "reimbursed" });
  out.push({ by: "maria", cat: "groceries", amount: 127.25, merchant: "Family Food Centre", daysAgo: 5, hour: 11, paidWith: "cash", note: "Vegetables, laban, bread", status: "reimbursed" });
  out.push({ by: "khalid", cat: "groceries", amount: 233, merchant: "Monoprix The Pearl", daysAgo: 5, hour: 21, note: "Forgot the list, bought snacks for the weekend" });
  out.push({ by: "maria", cat: "groceries", amount: 48, merchant: "Al Meera Al Waab", daysAgo: 4, hour: 9, paidWith: "cash" });
  out.push({ by: "hessa", cat: "dining", amount: 286, merchant: "Friday brunch, West Bay", daysAgo: 4, hour: 13 });
  out.push({ by: "maria", cat: "groceries", amount: 156.75, merchant: "Lulu Hypermarket Al Gharrafa", daysAgo: 3, hour: 17, paidWith: "cash", note: "Chicken, rice, fruit", status: "submitted" });
  out.push({ by: "noora", cat: "dining", amount: 94, merchant: "Talabat", daysAgo: 3, hour: 21, note: "Study night with friends", status: "approved" });
  out.push({ by: "khalid", cat: "transport", amount: 172, merchant: "WOQOD Al Waab", daysAgo: 2, hour: 8 });
  out.push({ by: "maria", cat: "groceries", amount: 39.5, merchant: "Al Meera Al Waab", daysAgo: 2, hour: 10, paidWith: "cash", note: "Milk and eggs", status: "submitted" });
  out.push({ by: "noora", cat: "school", amount: 186, merchant: "Jarir Bookstore", daysAgo: 1, hour: 18, note: "Calculator and art supplies for the science project", status: "submitted" });
  out.push({ by: "maria", cat: "groceries", amount: 211.25, merchant: "Carrefour City Center", daysAgo: 1, hour: 12, paidWith: "cash", note: "Guests on Friday: extra fruit and sweets", status: "submitted" });
  out.push({ by: "khalid", cat: "electronics", amount: 949, merchant: "Virgin Megastore", daysAgo: 0, hour: 11, note: "Replacement earbuds (lost the old ones at the gym)", status: "submitted" });
  out.push({ by: "hessa", cat: "dining", amount: 132, merchant: "Snoonu", daysAgo: 0, hour: 9 });

  return out;
}

export async function seedHomeDemo(db: Db, orgId: string, people: HomePeople, now = new Date()) {
  const r = rng(20261107);
  const cats = await createHomeDefaults(db, orgId);

  // Slightly tighter dining budget this month, so the dashboard has something to say.
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await db.budget.create({ data: { orgId, categoryId: cats.dining, month, amount: 500_00 } });

  const drafts = planClaims(r).sort((a, b) => b.daysAgo - a.daysAgo || a.hour - b.hour);
  let seq = 0;
  const yearSeq = new Map<number, number>();
  const pending: { id: string; number: string; by: string; amount: number; merchant: string }[] = [];

  for (const c of drafts) {
    let spentOn = atHour(daysAgo(now, c.daysAgo), c.hour, r.int(0, 59));
    // Never in the future: "this morning" claims land shortly before now.
    if (spentOn > now) spentOn = new Date(now.getTime() - r.int(15, 150) * 60_000);
    const year = spentOn.getUTCFullYear();
    seq = (yearSeq.get(year) ?? 0) + 1;
    yearSeq.set(year, seq);
    const number = `CLM-${year}-${String(seq).padStart(5, "0")}`;

    const submitter = people[c.by];
    // People who run the house approve their own spending automatically.
    const selfApproved = c.by === "hessa" || c.by === "khalid";
    const status = c.status ?? (c.paidWith === "cash" && c.daysAgo > 7 ? "reimbursed" : "approved");
    const decided = status !== "submitted";
    const decider = c.by === "hessa" ? people.hessa : c.by === "khalid" ? people.khalid : r.chance(0.7) ? people.hessa : people.khalid;
    const decidedAt = decided ? new Date(spentOn.getTime() + r.int(1, 20) * 3600_000) : null;

    const claim = await db.claim.create({
      data: {
        orgId,
        number,
        submittedById: submitter,
        categoryId: cats[c.cat],
        amount: Math.round(c.amount * 100),
        merchant: c.merchant,
        spentOn,
        note: c.note,
        paidWith: c.paidWith ?? "card",
        status,
        decidedById: decided ? decider : null,
        decidedAt: decidedAt && decidedAt < now ? decidedAt : decided ? now : null,
        decisionNote: c.decisionNote,
        reimbursedAt: status === "reimbursed" ? new Date(spentOn.getTime() + 2 * 86400_000) : null,
        createdAt: spentOn,
      },
    });

    if (c.daysAgo <= 14) {
      await db.auditLog.create({
        data: {
          orgId,
          userId: submitter,
          action: "claim.submitted",
          entityType: "claim",
          entityId: claim.id,
          summary: `submitted ${number} · ${c.merchant}`,
          summaryAr: `إرسال ${number} · ${c.merchant}`,
          meta: { amount: claim.amount },
          createdAt: spentOn,
        },
      });
      if (decided && !selfApproved) {
        await db.auditLog.create({
          data: {
            orgId,
            userId: decider,
            action: status === "rejected" ? "claim.rejected" : "claim.approved",
            entityType: "claim",
            entityId: claim.id,
            summary: `${status === "rejected" ? "rejected" : "approved"} ${number}`,
            summaryAr: `${status === "rejected" ? "رفض" : "اعتماد"} ${number}`,
            meta: { amount: claim.amount },
            createdAt: claim.decidedAt ?? now,
          },
        });
      }
    }
    if (status === "submitted") pending.push({ id: claim.id, number, by: c.by, amount: claim.amount, merchant: c.merchant });
  }

  for (const [year, current] of yearSeq) {
    await db.namingSeries.create({ data: { orgId, key: "CLM", year, current } });
  }

  // A small comment thread on one pending claim.
  const earbuds = pending.find((p) => p.merchant === "Virgin Megastore");
  if (earbuds) {
    await db.comment.create({
      data: { orgId, entityType: "claim", entityId: earbuds.id, authorId: people.hessa, body: "Didn't we buy earbuds in the summer? 😅", createdAt: atHour(daysAgo(now, 0), 12, 4) },
    });
    await db.comment.create({
      data: { orgId, entityType: "claim", entityId: earbuds.id, authorId: people.khalid, body: "Those were the ones I lost. These have a 2-year warranty, I'll add them to Things.", createdAt: atHour(daysAgo(now, 0), 12, 31) },
    });
  }

  // Notifications for whoever approves.
  for (const p of pending) {
    for (const approver of [people.hessa, people.khalid]) {
      if (people[p.by as keyof HomePeople] === approver) continue;
      await db.notification.create({
        data: {
          orgId,
          userId: approver,
          kind: "claim.submitted",
          title: `New claim ${p.number}: ${p.merchant}`,
          titleAr: `مطالبة جديدة ${p.number}: ${p.merchant}`,
          href: `claims/${p.id}`,
        },
      });
    }
  }

  await seedBills(db, orgId, cats, people, now, r);
  await seedPossessions(db, orgId, now);
  return { pending: pending.length };
}

async function seedBills(db: Db, orgId: string, cats: Record<CategoryKey, string>, people: HomePeople, now: Date, r: Rng) {
  const bills = [
    { name: "Electricity & water", nameAr: "الكهرباء والماء", provider: "Kahramaa", amount: 780, variable: true, dueInDays: 12, frequency: "monthly", autopay: false, cat: "bills" as const },
    { name: "Home fibre 1 Gbps", nameAr: "الألياف المنزلية ١ جيجابت", provider: "Ooredoo", amount: 450, variable: false, dueInDays: 3, frequency: "monthly", autopay: false, cat: "bills" as const },
    { name: "Mobile lines (×3)", nameAr: "خطوط الجوال (٣)", provider: "Vodafone Qatar", amount: 375, variable: false, dueInDays: 5, frequency: "monthly", autopay: true, cat: "bills" as const },
    { name: "Helper salary", nameAr: "راتب المساعدة المنزلية", provider: "Bank transfer", amount: 1800, variable: false, dueInDays: 24, frequency: "monthly", autopay: false, cat: "bills" as const },
    { name: "Streaming (OSN+ & Netflix)", nameAr: "اشتراكات البث", provider: "OSN+ / Netflix", amount: 98, variable: false, dueInDays: 17, frequency: "monthly", autopay: true, cat: "bills" as const },
    { name: "School fees, term 2", nameAr: "الرسوم المدرسية، الفصل الثاني", provider: "Al Manara International School", amount: 14500, variable: false, dueInDays: 58, frequency: "quarterly", autopay: false, cat: "school" as const },
    { name: "Car insurance (Patrol)", nameAr: "تأمين السيارة", provider: "QIC", amount: 3150, variable: false, dueInDays: 41, frequency: "yearly", autopay: false, cat: "transport" as const },
    { name: "Gym membership", nameAr: "اشتراك النادي الرياضي", provider: "Fitness First", amount: 420, variable: false, dueInDays: 9, frequency: "monthly", autopay: true, cat: "health" as const },
  ];

  for (const b of bills) {
    const nextDue = atHour(daysAgo(now, -b.dueInDays), 9, 0);
    const bill = await db.recurringBill.create({
      data: {
        orgId,
        name: b.name,
        nameAr: b.nameAr,
        provider: b.provider,
        categoryId: cats[b.cat],
        amount: b.amount * 100,
        variable: b.variable,
        frequency: b.frequency,
        nextDue,
        remindDaysBefore: b.frequency === "monthly" ? 3 : 14,
        autopay: b.autopay,
      },
    });
    // Payment history for monthly bills (the last 6 cycles).
    if (b.frequency === "monthly") {
      for (let k = 1; k <= 6; k++) {
        const due = new Date(nextDue);
        due.setUTCMonth(due.getUTCMonth() - k);
        if (due > now) continue;
        const amount = b.variable ? Math.round(b.amount * (0.75 + r.next() * 0.55)) : b.amount;
        await db.billPayment.create({
          data: { orgId, billId: bill.id, dueOn: due, paidOn: new Date(due.getTime() - r.int(0, 2) * 86400_000), amount: amount * 100, status: "paid", paidById: b.autopay ? null : people.khalid },
        });
      }
    }
    await db.billPayment.create({ data: { orgId, billId: bill.id, dueOn: nextDue, amount: b.amount * 100, status: "due" } });
  }
}

async function seedPossessions(db: Db, orgId: string, now: Date) {
  const items = [
    { name: 'Samsung 65" QLED TV', nameAr: "تلفاز سامسونج ٦٥ بوصة", category: "Electronics", room: "Majlis", brand: "Samsung", model: "QN65Q80D", purchasedDaysAgo: 690, price: 4299, store: "Jarir Bookstore", warrantyDaysLeft: 40 },
    { name: "LG refrigerator", nameAr: "ثلاجة إل جي", category: "Appliances", room: "Kitchen", brand: "LG", model: "GR-X257", purchasedDaysAgo: 420, price: 6799, store: "Carrefour City Center", warrantyDaysLeft: 675 },
    { name: "Split AC units (×4)", nameAr: "مكيفات سبليت (٤)", category: "Appliances", room: "Bedrooms", brand: "Gree", model: "Pular 2T", purchasedDaysAgo: 1050, price: 9600, store: "Jumbo Electronics", warrantyDaysLeft: 25 },
    { name: "Dyson V15 vacuum", nameAr: "مكنسة دايسون V15", category: "Appliances", room: "Storage", brand: "Dyson", model: "V15 Detect", purchasedDaysAgo: 240, price: 2899, store: "Virgin Megastore", warrantyDaysLeft: 490 },
    { name: "Bosch washing machine", nameAr: "غسالة بوش", category: "Appliances", room: "Laundry", brand: "Bosch", model: "Serie 6", purchasedDaysAgo: 830, price: 2450, store: "Lulu Hypermarket", warrantyDaysLeft: -100 },
    { name: "iPhone 17 Pro (Hessa)", nameAr: "آيفون ١٧ برو (حصة)", category: "Electronics", room: null, brand: "Apple", model: "iPhone 17 Pro", purchasedDaysAgo: 50, price: 4699, store: "Jarir Bookstore", warrantyDaysLeft: 315 },
    { name: "MacBook Air (Noora)", nameAr: "ماك بوك إير (نورة)", category: "Electronics", room: "Noora's room", brand: "Apple", model: "MacBook Air 13", purchasedDaysAgo: 75, price: 4199, store: "Virgin Megastore", warrantyDaysLeft: 290 },
    { name: "Sofa set, 7 seats", nameAr: "طقم كنب ٧ مقاعد", category: "Furniture", room: "Majlis", brand: "Home Centre", model: null, purchasedDaysAgo: 1400, price: 7800, store: "Home Centre", warrantyDaysLeft: null },
    { name: "Nissan Patrol 2023", nameAr: "نيسان باترول ٢٠٢٣", category: "Vehicle", room: null, brand: "Nissan", model: "Patrol LE", purchasedDaysAgo: 980, price: 289000, store: "Saleh Al Hamad Al Mana", warrantyDaysLeft: 115 },
    { name: "Coffee machine", nameAr: "آلة القهوة", category: "Appliances", room: "Kitchen", brand: "De'Longhi", model: "Dinamica Plus", purchasedDaysAgo: 300, price: 2350, store: "Carrefour City Center", warrantyDaysLeft: 430 },
    { name: "Study desk & bookshelf", nameAr: "مكتب دراسة ومكتبة", category: "Furniture", room: "Ahmed's room", brand: "IKEA", model: "MICKE / BILLY", purchasedDaysAgo: 96, price: 1890, store: "IKEA Doha", warrantyDaysLeft: 3550 },
    { name: "PlayStation 5", nameAr: "بلايستيشن ٥", category: "Electronics", room: "Family room", brand: "Sony", model: "PS5 Slim", purchasedDaysAgo: 330, price: 1999, store: "Virgin Megastore", warrantyDaysLeft: 35 },
  ];
  for (const it of items) {
    await db.possession.create({
      data: {
        orgId,
        name: it.name,
        nameAr: it.nameAr,
        category: it.category,
        room: it.room,
        brand: it.brand,
        model: it.model,
        purchasedOn: daysAgo(now, it.purchasedDaysAgo),
        price: it.price * 100,
        store: it.store,
        warrantyUntil: it.warrantyDaysLeft === null ? null : daysAgo(now, -it.warrantyDaysLeft),
        serial: it.category === "Electronics" || it.category === "Appliances" ? `SN${(it.price * 7919).toString(36).toUpperCase()}` : null,
      },
    });
  }
}
