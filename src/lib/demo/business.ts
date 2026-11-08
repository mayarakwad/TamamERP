// A year in the life of Sadeem Office & Home Supplies W.L.L.: customers and
// suppliers, a priced catalogue, restocking, quotations that turn into
// invoices, customers who pay on time (and a couple who don't), rent and
// utilities. Every event goes through the same functions the app uses, so the
// books balance exactly like real ones.

import type { PrismaClient } from "../../generated/prisma/client";
import { ensureBusinessDefaults } from "../ledger/chart";
import { postEntry } from "../ledger/post";
import { moveStock, stockAlerts, checkLowStock } from "../inventory/stock";
import { adjustStock, billFromPO, convertQuote, issueInvoice, postBill, receivePO, recordPayment, saveDocument, transferStock } from "../docs/ops";
import { addMonths, monthKey } from "../format";
import { rng, type Rng } from "./random";

type Db = PrismaClient;

const q = (riyals: number) => Math.round(riyals * 100);
/** Volume multiplier: a mid-sized Doha trading business (about QAR 5m a year). */
const SCALE = 2.4;
const INVOICE_TERMS = "Payment by bank transfer or cheque payable to Sadeem Office & Home Supplies W.L.L. Goods remain our property until paid in full.";
const units = (n: number) => Math.round(n * 100);

type Cat = "paper" | "writing" | "filing" | "toner" | "furniture" | "pantry" | "electronics" | "service";

interface ItemSpec {
  sku: string;
  name: string;
  nameAr: string;
  cat: Cat;
  category: string;
  unit: string;
  sale: number;
  cost: number;
  reorder?: number;
  /** typical units sold per month */
  demand?: number;
  supplier?: string;
  /** how many a typical business order takes */
  lot?: [number, number];
}

export const CATALOGUE: ItemSpec[] = [
  { sku: "PAP-A4-80", name: "A4 copy paper 80gsm (ream)", nameAr: "ورق تصوير A4 وزن 80 (رزمة)", cat: "paper", category: "Paper", unit: "ream", sale: 19.5, cost: 13.25, reorder: 200, demand: 420, supplier: "gulfpaper", lot: [10, 60] },
  { sku: "PAP-A4-BOX", name: "A4 copy paper, box of 5 reams", nameAr: "ورق تصوير A4، كرتون 5 رزم", cat: "paper", category: "Paper", unit: "box", sale: 92, cost: 63, reorder: 60, demand: 140, supplier: "gulfpaper", lot: [2, 20] },
  { sku: "PAP-A3-80", name: "A3 copy paper 80gsm (ream)", nameAr: "ورق تصوير A3 وزن 80 (رزمة)", cat: "paper", category: "Paper", unit: "ream", sale: 38, cost: 26.5, reorder: 30, demand: 40, supplier: "gulfpaper", lot: [2, 10] },
  { sku: "PAP-PHOTO", name: "Glossy photo paper A4, 50 sheets", nameAr: "ورق صور لامع A4، 50 ورقة", cat: "paper", category: "Paper", unit: "pack", sale: 35, cost: 21, reorder: 20, demand: 25, supplier: "gulfpaper", lot: [1, 6] },
  { sku: "WRT-GEL-BL", name: "Gel pens, blue (box of 12)", nameAr: "أقلام جل زرقاء (علبة 12)", cat: "writing", category: "Writing", unit: "box", sale: 48, cost: 31, reorder: 40, demand: 70, supplier: "falcon", lot: [2, 10] },
  { sku: "WRT-BALL-50", name: "Ballpoint pens, blue (box of 50)", nameAr: "أقلام حبر جاف زرقاء (علبة 50)", cat: "writing", category: "Writing", unit: "box", sale: 42, cost: 26, reorder: 30, demand: 45, supplier: "falcon", lot: [1, 6] },
  { sku: "WRT-HILITE", name: "Highlighters, 4 colours", nameAr: "أقلام تحديد، 4 ألوان", cat: "writing", category: "Writing", unit: "set", sale: 18.5, cost: 10.75, reorder: 40, demand: 60, supplier: "falcon", lot: [2, 12] },
  { sku: "WRT-WB-4", name: "Whiteboard markers, set of 4", nameAr: "أقلام سبورة بيضاء، طقم 4", cat: "writing", category: "Writing", unit: "set", sale: 16, cost: 9.5, reorder: 50, demand: 70, supplier: "falcon", lot: [2, 15] },
  { sku: "FIL-LEVER", name: "Lever arch file A4, 75mm", nameAr: "ملف بذراع A4 مقاس 75 مم", cat: "filing", category: "Filing", unit: "pcs", sale: 9.75, cost: 5.5, reorder: 150, demand: 260, supplier: "falcon", lot: [10, 50] },
  { sku: "FIL-SLEEVE", name: "Clear sheet protectors, pack of 100", nameAr: "جيوب شفافة، عبوة 100", cat: "filing", category: "Filing", unit: "pack", sale: 24, cost: 14, reorder: 40, demand: 55, supplier: "falcon", lot: [1, 8] },
  { sku: "FIL-STAPLER", name: "Heavy-duty stapler", nameAr: "دباسة للاستخدام الكثيف", cat: "filing", category: "Filing", unit: "pcs", sale: 65, cost: 39, reorder: 15, demand: 18, supplier: "falcon", lot: [1, 4] },
  { sku: "FIL-STAPLES", name: "Staples 24/6, box of 1000", nameAr: "دبابيس 24/6، علبة 1000", cat: "filing", category: "Filing", unit: "box", sale: 4.5, cost: 2.25, reorder: 200, demand: 300, supplier: "falcon", lot: [10, 40] },
  { sku: "TON-26A", name: "Black laser toner, 26A compatible", nameAr: "حبر ليزر أسود متوافق 26A", cat: "toner", category: "Toner & ink", unit: "pcs", sale: 385, cost: 296, reorder: 12, demand: 22, supplier: "techno", lot: [1, 4] },
  { sku: "TON-410-SET", name: "Colour laser toner set, 410A compatible", nameAr: "طقم حبر ليزر ملون متوافق 410A", cat: "toner", category: "Toner & ink", unit: "set", sale: 1450, cost: 1120, reorder: 4, demand: 5, supplier: "techno", lot: [1, 2] },
  { sku: "TON-EXV33", name: "Copier toner C-EXV33 compatible", nameAr: "حبر آلة تصوير متوافق C-EXV33", cat: "toner", category: "Toner & ink", unit: "pcs", sale: 210, cost: 158, reorder: 8, demand: 12, supplier: "techno", lot: [1, 4] },
  { sku: "INK-003-4", name: "Ink bottle set 003 (4 colours)", nameAr: "طقم عبوات حبر 003 (4 ألوان)", cat: "toner", category: "Toner & ink", unit: "set", sale: 120, cost: 84, reorder: 15, demand: 20, supplier: "techno", lot: [1, 5] },
  { sku: "FUR-CHAIR-MESH", name: "Ergonomic mesh office chair", nameAr: "كرسي مكتب شبكي مريح", cat: "furniture", category: "Office furniture", unit: "pcs", sale: 895, cost: 560, reorder: 6, demand: 9, supplier: "furniture", lot: [1, 8] },
  { sku: "FUR-CHAIR-VIS", name: "Visitor chair, chrome frame", nameAr: "كرسي زوار بإطار كروم", cat: "furniture", category: "Office furniture", unit: "pcs", sale: 245, cost: 150, reorder: 10, demand: 14, supplier: "furniture", lot: [2, 12] },
  { sku: "FUR-DESK-140", name: "Office desk 140×70 cm, walnut", nameAr: "مكتب 140×70 سم، خشب جوز", cat: "furniture", category: "Office furniture", unit: "pcs", sale: 1290, cost: 820, reorder: 4, demand: 5, supplier: "furniture", lot: [1, 4] },
  { sku: "FUR-CAB-4D", name: "Steel filing cabinet, 4 drawers", nameAr: "خزانة ملفات معدنية 4 أدراج", cat: "furniture", category: "Office furniture", unit: "pcs", sale: 780, cost: 495, reorder: 4, demand: 4, supplier: "furniture", lot: [1, 3] },
  { sku: "FUR-WB-120", name: "Magnetic whiteboard 120×90 cm", nameAr: "سبورة بيضاء مغناطيسية 120×90 سم", cat: "furniture", category: "Office furniture", unit: "pcs", sale: 320, cost: 190, reorder: 5, demand: 6, supplier: "furniture", lot: [1, 3] },
  { sku: "PAN-WATER-40", name: "Drinking water 330 ml, carton of 40", nameAr: "مياه شرب 330 مل، كرتون 40", cat: "pantry", category: "Pantry & cleaning", unit: "carton", sale: 22, cost: 14.5, reorder: 80, demand: 160, supplier: "najma", lot: [5, 30] },
  { sku: "PAN-COFFEE", name: "Arabic coffee with cardamom, 500 g", nameAr: "قهوة عربية بالهيل، 500 غرام", cat: "pantry", category: "Pantry & cleaning", unit: "pack", sale: 46, cost: 31, reorder: 30, demand: 45, supplier: "najma", lot: [2, 8] },
  { sku: "PAN-TISSUE-5", name: "Facial tissues 200, pack of 5", nameAr: "مناديل وجه 200، عبوة 5", cat: "pantry", category: "Pantry & cleaning", unit: "pack", sale: 21, cost: 12.5, reorder: 60, demand: 110, supplier: "najma", lot: [3, 20] },
  { sku: "CLN-SANITISER", name: "Hand sanitiser 500 ml", nameAr: "معقم يدين 500 مل", cat: "pantry", category: "Pantry & cleaning", unit: "pcs", sale: 14, cost: 7.75, reorder: 50, demand: 70, supplier: "najma", lot: [3, 20] },
  { sku: "CLN-BAGS-20", name: "Heavy-duty garbage bags, roll of 20", nameAr: "أكياس نفايات قوية، لفة 20", cat: "pantry", category: "Pantry & cleaning", unit: "roll", sale: 11, cost: 6, reorder: 60, demand: 90, supplier: "najma", lot: [5, 25] },
  { sku: "ELC-SHREDDER", name: "Cross-cut paper shredder", nameAr: "آلة تقطيع ورق متقاطعة", cat: "electronics", category: "Office equipment", unit: "pcs", sale: 690, cost: 455, reorder: 3, demand: 3, supplier: "techno", lot: [1, 2] },
  { sku: "ELC-CALC", name: "Desktop calculator, 12 digits", nameAr: "آلة حاسبة مكتبية 12 خانة", cat: "electronics", category: "Office equipment", unit: "pcs", sale: 85, cost: 52, reorder: 10, demand: 14, supplier: "techno", lot: [1, 6] },
  { sku: "ELC-LAMINATOR", name: "A3 laminator", nameAr: "آلة تغليف حراري A3", cat: "electronics", category: "Office equipment", unit: "pcs", sale: 340, cost: 215, reorder: 3, demand: 3, supplier: "techno", lot: [1, 2] },
  { sku: "SRV-DELIVERY", name: "Delivery & installation, Doha", nameAr: "توصيل وتركيب داخل الدوحة", cat: "service", category: "Services", unit: "trip", sale: 150, cost: 0 },
  { sku: "SRV-ASSEMBLY", name: "Furniture assembly (per hour)", nameAr: "تركيب أثاث (بالساعة)", cat: "service", category: "Services", unit: "hour", sale: 120, cost: 0 },
  { sku: "SRV-PRINTER", name: "Printer maintenance visit", nameAr: "زيارة صيانة طابعات", cat: "service", category: "Services", unit: "visit", sale: 450, cost: 0 },
];

// Prices with this year's 8% list increase.
for (const s of CATALOGUE) if (s.cat !== "service") s.sale = Math.round(s.sale * 1.08 * 4) / 4;

interface PartySpec {
  key: string;
  name: string;
  nameAr: string;
  contact?: string;
  phone: string;
  email?: string;
  address: string;
  addressAr: string;
  terms: number;
  /** days they actually take to pay (customers) */
  pays?: number;
  limit?: number;
  likes?: Cat[];
  /** relative order frequency */
  weight?: number;
  cr?: string;
}

const CUSTOMERS: PartySpec[] = [
  { key: "bidda", name: "Al Bidda Engineering Consultants", nameAr: "البدع للاستشارات الهندسية", contact: "Eng. Tariq Saleh", phone: "+974 4431 2200", email: "admin@bidda-eng.example", address: "Tower 2, West Bay, Doha", addressAr: "البرج 2، الخليج الغربي، الدوحة", terms: 30, pays: 32, limit: q(60000), likes: ["paper", "toner", "writing", "furniture"], weight: 5, cr: "92741" },
  { key: "pearl", name: "Pearl Coast Dental Clinic", nameAr: "عيادة ساحل اللؤلؤ لطب الأسنان", contact: "Dr. Leena Haddad", phone: "+974 4402 7788", address: "Porto Arabia, The Pearl, Doha", addressAr: "بورتو أرابيا، اللؤلؤة، الدوحة", terms: 15, pays: 18, likes: ["pantry", "paper", "filing"], weight: 3 },
  { key: "lusail", name: "Lusail Legal Partners", nameAr: "لوسيل للمحاماة والاستشارات القانونية", contact: "Hamad Al-Kuwari", phone: "+974 4020 5511", email: "office@lusail-legal.example", address: "Marina District, Lusail", addressAr: "حي المارينا، لوسيل", terms: 30, pays: 52, limit: q(40000), likes: ["paper", "filing", "toner"], weight: 4 },
  { key: "sadd", name: "Al Sadd Sports Academy", nameAr: "أكاديمية السد الرياضية", contact: "Coach Ahmed Fathy", phone: "+974 4466 3300", address: "Al Sadd, Doha", addressAr: "السد، الدوحة", terms: 30, pays: 28, likes: ["pantry", "writing", "furniture"], weight: 2 },
  { key: "gateway", name: "Doha Gateway Logistics", nameAr: "بوابة الدوحة للخدمات اللوجستية", contact: "Vikram Shetty", phone: "+974 4498 1200", email: "procurement@dgl.example", address: "Street 33, Industrial Area, Doha", addressAr: "شارع 33، المنطقة الصناعية، الدوحة", terms: 30, pays: 70, limit: q(50000), likes: ["paper", "furniture", "toner"], weight: 4, cr: "118204" },
  { key: "bakery", name: "Wakra Fresh Bakery", nameAr: "مخبز الوكرة الطازج", phone: "+974 4464 0099", address: "Souq Al Wakra, Al Wakra", addressAr: "سوق الوكرة، الوكرة", terms: 0, pays: 0, likes: ["pantry"], weight: 2 },
  { key: "alkhor", name: "Al Khor Contracting & Trading", nameAr: "الخور للمقاولات والتجارة", contact: "Saeed Al-Mohannadi", phone: "+974 4472 8810", address: "Al Khor Industrial Area", addressAr: "المنطقة الصناعية، الخور", terms: 45, pays: 48, likes: ["furniture", "paper"], weight: 2 },
  { key: "sealine", name: "Sealine Travel & Tours", nameAr: "سيلين للسفر والسياحة", contact: "Grace Fernandes", phone: "+974 4455 6677", address: "C-Ring Road, Doha", addressAr: "الدائري الثالث، الدوحة", terms: 30, pays: 24, likes: ["paper", "toner"], weight: 2 },
  { key: "dafna", name: "Al Dafna Property Management", nameAr: "الدفنة لإدارة العقارات", contact: "Nasser Al-Sulaiti", phone: "+974 4410 9090", address: "Al Dafna, Doha", addressAr: "الدفنة، الدوحة", terms: 30, pays: 30, likes: ["furniture", "pantry"], weight: 3 },
  { key: "rawdat", name: "Rawdat Medical Center", nameAr: "مركز روضة الطبي", contact: "Admin office", phone: "+974 4441 2323", address: "Rawdat Al Khail, Doha", addressAr: "روضة الخيل، الدوحة", terms: 30, pays: 36, likes: ["paper", "pantry", "toner", "filing"], weight: 4 },
  { key: "corniche", name: "Corniche Creative Studio", nameAr: "استوديو الكورنيش الإبداعي", contact: "Maha Al-Thani", phone: "+974 5550 4433", address: "Msheireb Downtown, Doha", addressAr: "مشيرب قلب الدوحة", terms: 15, pays: 14, likes: ["paper", "electronics", "furniture"], weight: 2 },
  { key: "mesaieed", name: "Mesaieed Marine Services", nameAr: "مسيعيد للخدمات البحرية", contact: "Capt. Rajan Pillai", phone: "+974 4476 5500", address: "Mesaieed Port Road", addressAr: "طريق ميناء مسيعيد", terms: 30, pays: 95, limit: q(25000), likes: ["paper", "pantry"], weight: 2 },
  { key: "kinder", name: "Al Gharrafa International Kindergarten", nameAr: "روضة الغرافة الدولية", contact: "Ms. Hiba Nasser", phone: "+974 4487 1144", address: "Al Gharrafa, Doha", addressAr: "الغرافة، الدوحة", terms: 30, pays: 30, likes: ["writing", "filing", "furniture"], weight: 2 },
  { key: "autocare", name: "Old Airport Auto Care", nameAr: "العناية بالسيارات - المطار القديم", phone: "+974 4462 7070", address: "Old Airport Road, Doha", addressAr: "طريق المطار القديم، الدوحة", terms: 0, pays: 3, likes: ["pantry"], weight: 1 },
  { key: "pharmacy", name: "Al Waab Family Pharmacy", nameAr: "صيدلية الوعب العائلية", phone: "+974 4450 3311", address: "Al Waab Street, Doha", addressAr: "شارع الوعب، الدوحة", terms: 15, pays: 20, likes: ["pantry", "paper"], weight: 2 },
  { key: "hilal", name: "Al Hilal Accounting Office", nameAr: "مكتب الهلال للمحاسبة", contact: "Mohammed Rafiq", phone: "+974 4435 8899", address: "Al Hilal, Doha", addressAr: "الهلال، الدوحة", terms: 30, pays: 29, likes: ["paper", "filing", "toner"], weight: 3 },
  { key: "cowork", name: "Msheireb Co-working Hub", nameAr: "مساحة مشيرب للعمل المشترك", contact: "Layla Al-Emadi", phone: "+974 4000 1188", email: "hello@cowork-hub.example", address: "Msheireb Downtown, Doha", addressAr: "مشيرب قلب الدوحة", terms: 30, pays: 33, likes: ["furniture", "pantry", "paper"], weight: 3 },
  { key: "walkin", name: "Cash customer", nameAr: "عميل نقدي", phone: "", address: "", addressAr: "", terms: 0, pays: 0, likes: ["paper", "writing", "filing", "pantry", "electronics"], weight: 0 },
];

const SUPPLIERS: PartySpec[] = [
  { key: "gulfpaper", name: "Gulf Paper Trading W.L.L.", nameAr: "الخليج لتجارة الورق ذ.م.م", contact: "Sales desk", phone: "+974 4460 2211", email: "orders@gulfpaper.example", address: "Street 41, Industrial Area, Doha", addressAr: "شارع 41، المنطقة الصناعية، الدوحة", terms: 30 },
  { key: "falcon", name: "Falcon Stationery Distributors", nameAr: "فالكون لتوزيع القرطاسية", contact: "Anil Kumar", phone: "+974 4468 7700", address: "Barwa Commercial Avenue, Doha", addressAr: "بروة كوميرشال أفنيو، الدوحة", terms: 45 },
  { key: "techno", name: "Techno Toner Middle East", nameAr: "تكنو تونر الشرق الأوسط", contact: "Fadi Mansour", phone: "+974 4433 9911", address: "Salwa Road, Doha", addressAr: "طريق سلوى، الدوحة", terms: 30 },
  { key: "furniture", name: "Arabian Office Furniture Factory", nameAr: "المصنع العربي للأثاث المكتبي", contact: "Showroom manager", phone: "+974 4415 6060", address: "Street 52, Industrial Area, Doha", addressAr: "شارع 52، المنطقة الصناعية، الدوحة", terms: 60 },
  { key: "najma", name: "Al Najma Cleaning & Pantry Supplies", nameAr: "النجمة للوازم التنظيف والضيافة", phone: "+974 4462 3030", address: "Abu Hamour, Doha", addressAr: "أبو هامور، الدوحة", terms: 30 },
  { key: "landlord", name: "Zone 43 Properties", nameAr: "عقارات المنطقة 43", phone: "+974 4444 4343", address: "Salwa Road, Doha", addressAr: "طريق سلوى، الدوحة", terms: 5 },
  { key: "kahramaa", name: "Kahramaa", nameAr: "كهرماء", phone: "991", address: "Doha", addressAr: "الدوحة", terms: 30 },
  { key: "ooredoo", name: "Ooredoo Business", nameAr: "Ooredoo للأعمال", phone: "111", address: "Doha", addressAr: "الدوحة", terms: 21 },
];

/** Business seasons in Qatar: back-to-school spike, a summer lull, a busy Q4. */
function season(month: number) {
  return [1.05, 1.0, 1.0, 0.92, 0.9, 0.8, 0.72, 0.95, 1.35, 1.15, 1.1, 1.2][month - 1];
}

const dayOf = (key: string, day: number) => new Date(`${key}-${String(day).padStart(2, "0")}T12:00:00+03:00`);

export async function seedBusinessDemo(
  db: Db,
  orgId: string,
  people: { khalid: string; omar: string; priya: string; joseph: string },
  campuses: { showroom: string; warehouse: string },
  now = new Date(),
) {
  const r = rng(2026);
  stockAlerts.enabled = false;
  await ensureBusinessDefaults(db, orgId);
  const acct = new Map((await db.account.findMany({ where: { orgId } })).map((a) => [a.code, a.id]));
  const bank = acct.get("1110")!;
  const cash = acct.get("1100")!;

  // ── Parties ──
  const party: Record<string, string> = {};
  for (const [list, customer] of [[CUSTOMERS, true], [SUPPLIERS, false]] as const) {
    for (const p of list) {
      const row = await db.party.create({
        data: {
          orgId,
          name: p.name,
          nameAr: p.nameAr,
          isCustomer: customer,
          isSupplier: !customer,
          contactName: p.contact ?? null,
          phone: p.phone || null,
          email: p.email ?? null,
          address: p.address || null,
          addressAr: p.addressAr || null,
          crNumber: p.cr ?? null,
          paymentTerms: p.terms,
          creditLimit: p.limit ?? null,
        },
      });
      party[p.key] = row.id;
    }
  }

  // ── Catalogue ──
  const item: Record<string, { id: string; spec: ItemSpec }> = {};
  for (const s of CATALOGUE) {
    const row = await db.item.create({
      data: {
        orgId,
        sku: s.sku,
        name: s.name,
        nameAr: s.nameAr,
        kind: s.cat === "service" ? "service" : "product",
        category: s.category,
        unit: s.unit,
        salePrice: q(s.sale),
        purchasePrice: q(s.cost),
        avgCost: q(s.cost),
        reorderLevel: s.reorder != null ? units(s.reorder) : null,
        reorderQty: s.demand ? units(Math.ceil(s.demand * 1.2)) : null,
      },
    });
    item[s.sku] = { id: row.id, spec: s };
  }
  const products = CATALOGUE.filter((s) => s.cat !== "service");

  // ── Opening position, 12 months ago ──
  const thisMonth = monthKey(now);
  const first = addMonths(thisMonth, -12);
  const openDay = dayOf(first, 1);
  const stock = new Map<string, Record<string, number>>(); // sku → campus → qty (hundredths)
  const level = (sku: string, c: string) => stock.get(sku)?.[c] ?? 0;
  const bump = (sku: string, c: string, d: number) => {
    const row = stock.get(sku) ?? {};
    row[c] = (row[c] ?? 0) + d;
    stock.set(sku, row);
  };
  let openingStock = 0;
  for (const s of products) {
    const totalUnits = Math.round((s.demand ?? 5) * SCALE * 1.4);
    const total = units(totalUnits);
    const showroom = units(s.cat === "furniture" || s.cat === "electronics" ? Math.min(3, s.demand ?? 1) : Math.round(totalUnits * 0.25));
    for (const [c, qty] of [[campuses.warehouse, total - showroom], [campuses.showroom, showroom]] as const) {
      if (qty <= 0) continue;
      const { value } = await moveStock(db, { orgId, itemId: item[s.sku].id, campusId: c, qty, unitCost: q(s.cost), date: openDay, kind: "opening", note: "Opening stock", createdById: people.priya, quiet: true });
      openingStock += value;
      bump(s.sku, c, qty);
    }
  }
  await postEntry(db, {
    orgId,
    date: openDay,
    memo: "Opening balances",
    sourceType: "opening",
    createdById: people.priya,
    lines: [
      { accountId: bank, debit: q(420000) },
      { accountId: cash, debit: q(8500) },
      { accountId: acct.get("1500")!, debit: q(96000) },
      { accountId: acct.get("1510")!, debit: q(138000) },
      { accountId: acct.get("1590")!, credit: q(41000) },
      { role: "inventory", debit: openingStock },
      { role: "capital", credit: q(420000 + 8500 + 96000 + 138000 - 41000) + openingStock },
    ],
  });

  // ── Month by month ──
  const pending: { due: Date; run: () => Promise<void> }[] = [];
  const schedule = (due: Date, run: () => Promise<void>) => pending.push({ due, run });
  const flush = async (until: Date) => {
    pending.sort((a, b) => a.due.getTime() - b.due.getTime());
    while (pending.length && pending[0].due <= until) await pending.shift()!.run();
  };
  const weekday = (d: Date) => {
    while (d.getUTCDay() === 5) d = new Date(d.getTime() + 86400_000); // no Fridays
    return d;
  };
  const pay = async (direction: "in" | "out", partyId: string, documentId: string, amount: number, date: Date, method: string, account = bank) => {
    await recordPayment(db, { orgId, direction, partyId, date, amount, method, accountId: account, reference: method === "cheque" ? `CHQ ${r.int(100000, 999999)}` : method === "transfer" ? `TRF${r.int(1000000, 9999999)}` : null, allocations: [{ documentId, amount }], createdById: people.priya });
  };

  const customerPool = CUSTOMERS.filter((c) => c.key !== "walkin").flatMap((c) => Array(c.weight ?? 1).fill(c) as PartySpec[]);
  let invoiceCount = 0;

  for (let m = 0; m <= 12; m++) {
    const key = addMonths(first, m);
    const month = Number(key.slice(5));
    const last = m === 12;
    const daysInMonth = new Date(Date.UTC(Number(key.slice(0, 4)), month, 0)).getUTCDate();
    const lastDay = last ? Math.max(1, Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", day: "2-digit" }).format(now))) : daysInMonth;
    const f = season(month) * (1 + m * 0.025);

    // Rent, power, phones.
    for (const [sup, amount, accountCode, day] of [
      ["landlord", q(28000), "6200", 1],
      ["kahramaa", q(month >= 6 && month <= 9 ? r.money(5200, 6400) : r.money(2700, 3600)), "6300", 8],
      ["ooredoo", q(r.money(1840, 2160)), "6310", 12],
    ] as const) {
      if (day > lastDay) continue;
      const date = dayOf(key, day);
      const label = { landlord: ["Showroom & warehouse rent", "إيجار الصالة والمستودع"], kahramaa: ["Electricity & water", "الكهرباء والماء"], ooredoo: ["Business lines & internet", "خطوط الأعمال والإنترنت"] }[sup];
      const bill = await saveDocument(db, { orgId, kind: "bill", partyId: party[sup], date, reference: `${sup.slice(0, 3).toUpperCase()}-${key.replace("-", "")}`, createdById: people.priya, lines: [{ description: `${label[0]}, ${key}`, qty: 100, unitPrice: amount, accountId: acct.get(accountCode)! }] });
      await postBill(db, orgId, bill.id, people.priya);
      const payDate = weekday(new Date(date.getTime() + (sup === "landlord" ? 2 : r.int(10, 18)) * 86400_000));
      schedule(payDate, () => pay("out", party[sup], bill.id, amount, payDate, "transfer"));
    }

    // Restock from suppliers at the start of the month.
    const bySupplier = new Map<string, { sku: string; qty: number }[]>();
    for (const s of products) {
      const onHand = level(s.sku, campuses.warehouse) + level(s.sku, campuses.showroom);
      const target = units(Math.round((s.demand ?? 5) * SCALE * season(Math.max(1, (month % 12) + 1)) * 1.6 * (1 + m * 0.025)));
      if (onHand < target * 0.65 || (last && s.sku === "TON-26A")) {
        const pack = (s.demand ?? 0) > 100 ? 5000 : (s.demand ?? 0) > 20 ? 1000 : 100;
        const qty = Math.max(pack, Math.ceil((target - onHand) / pack) * pack);
        bySupplier.set(s.supplier!, [...(bySupplier.get(s.supplier!) ?? []), { sku: s.sku, qty }]);
      }
    }
    for (const [sup, lines] of bySupplier) {
      const day = Math.min(lastDay, r.int(1, 3));
      const date = dayOf(key, day);
      const po = await saveDocument(db, { orgId, kind: "po", partyId: party[sup], campusId: campuses.warehouse, date, dueDate: new Date(date.getTime() + 5 * 86400_000), createdById: people.omar, lines: lines.map((l) => ({ itemId: item[l.sku].id, description: item[l.sku].spec.name, qty: l.qty, unitPrice: q(item[l.sku].spec.cost) })) });
      await db.document.update({ where: { id: po.id }, data: { status: "sent" } });
      const arrive = weekday(new Date(date.getTime() + r.int(3, 6) * 86400_000));
      // This month's last order is still on its way: something for the storekeeper to receive.
      if (last && arrive > now) continue;
      const poLines = await db.documentLine.findMany({ where: { documentId: po.id } });
      const partial = r.chance(0.12);
      await receivePO(db, orgId, po.id, people.joseph, { campusId: campuses.warehouse, date: arrive, lines: poLines.map((l, i) => ({ lineId: l.id, qty: partial && i === 0 ? Math.round(l.qty / 2 / 100) * 100 : l.qty })) });
      for (const l of lines) bump(l.sku, campuses.warehouse, partial && l === lines[0] ? Math.round(l.qty / 2 / 100) * 100 : l.qty);
      if (partial) {
        const rest = weekday(new Date(arrive.getTime() + r.int(4, 8) * 86400_000));
        if (rest <= now) {
          const fresh = await db.documentLine.findMany({ where: { documentId: po.id } });
          await receivePO(db, orgId, po.id, people.joseph, { campusId: campuses.warehouse, date: rest, lines: fresh.map((l) => ({ lineId: l.id, qty: l.qty - l.received })) });
          bump(lines[0].sku, campuses.warehouse, lines[0].qty - Math.round(lines[0].qty / 2 / 100) * 100);
        }
      }
      const billDate = weekday(new Date(arrive.getTime() + r.int(1, 4) * 86400_000));
      if (billDate > now) continue;
      const after = await db.document.findUniqueOrThrow({ where: { id: po.id } });
      if (after.status !== "received") continue;
      const bill = await billFromPO(db, orgId, po.id, people.priya, billDate, `${sup.slice(0, 2).toUpperCase()}${r.int(10000, 99999)}`);
      await postBill(db, orgId, bill.id, people.priya);
      const terms = SUPPLIERS.find((s) => s.key === sup)!.terms;
      const payDate = weekday(new Date(billDate.getTime() + (terms - r.int(0, 5)) * 86400_000));
      schedule(payDate, () => pay("out", party[sup], bill.id, bill.total, payDate, r.chance(0.3) ? "cheque" : "transfer"));
    }

    // Keep the showroom stocked from the warehouse.
    if (lastDay >= 4) {
      const moves = products
        .filter((s) => s.cat !== "furniture" && level(s.sku, campuses.showroom) < units(Math.round((s.demand ?? 5) * 0.2)) && level(s.sku, campuses.warehouse) > units(Math.round((s.demand ?? 5) * 0.6)))
        .map((s) => ({ itemId: item[s.sku].id, sku: s.sku, qty: units(Math.max(1, Math.round((s.demand ?? 5) * 0.3))) }));
      if (moves.length) {
        await transferStock(db, orgId, people.joseph, { from: campuses.warehouse, to: campuses.showroom, date: dayOf(key, 4), note: "Showroom top-up", lines: moves });
        for (const mv of moves) {
          bump(mv.sku, campuses.warehouse, -mv.qty);
          bump(mv.sku, campuses.showroom, mv.qty);
        }
      }
    }

    // Customer orders through the month.
    const orders = Math.round(60 * f * (last ? lastDay / daysInMonth : 1));
    for (let i = 0; i < orders; i++) {
      const day = Math.max(1, Math.min(lastDay, Math.round(((i + 0.5) / orders) * lastDay) + r.int(-1, 1)));
      const date = weekday(dayOf(key, day));
      if (date > now) continue;
      const cust = month >= 8 && month <= 9 && r.chance(0.25) ? CUSTOMERS.find((c) => c.key === "kinder")! : r.pick(customerPool);
      const lines = buildLines(r, cust, products, (sku) => level(sku, campuses.warehouse));
      if (!lines.length) continue;
      if (lines.some((l) => item[l.sku].spec.cat === "furniture") && r.chance(0.7)) lines.push({ sku: "SRV-DELIVERY", qty: 100 });
      if (lines.some((l) => item[l.sku].spec.cat === "furniture") && r.chance(0.4)) lines.push({ sku: "SRV-ASSEMBLY", qty: units(r.int(2, 6)) });
      if (lines.some((l) => item[l.sku].spec.cat === "toner") && r.chance(0.15)) lines.push({ sku: "SRV-PRINTER", qty: 100 });
      const docLines = lines.map((l) => ({ itemId: item[l.sku].id, description: item[l.sku].spec.name, qty: l.qty, unitPrice: q(item[l.sku].spec.sale), discountPct: l.qty >= 2000 && item[l.sku].spec.cat === "paper" ? 500 : 0 }));

      // A third of orders start as a quotation a few days earlier.
      let invoiceId: string;
      if (r.chance(0.33)) {
        const qDate = new Date(date.getTime() - r.int(2, 6) * 86400_000);
        const quote = await saveDocument(db, { orgId, kind: "quote", partyId: party[cust.key], campusId: campuses.warehouse, date: qDate, createdById: people.omar, terms: "Prices valid for 15 days. Delivery within Doha in 2 working days.", lines: docLines });
        await db.document.update({ where: { id: quote.id }, data: { status: "accepted" } });
        const inv = await convertQuote(db, orgId, quote.id, people.omar, date, INVOICE_TERMS);
        invoiceId = inv.id;
      } else {
        const inv = await saveDocument(db, { orgId, kind: "invoice", partyId: party[cust.key], campusId: campuses.warehouse, date, reference: r.chance(0.4) ? `PO-${r.int(2000, 8999)}` : null, createdById: people.omar, lines: docLines });
        invoiceId = inv.id;
      }
      // Leave a draft or two in the current month.
      if (last && i === orders - 1) continue;
      const issued = await issueInvoice(db, orgId, invoiceId, people.omar, date);
      invoiceCount++;
      for (const l of lines) if (item[l.sku].spec.cat !== "service") bump(l.sku, campuses.warehouse, -l.qty);
      const delay = Math.max(0, (cust.pays ?? 30) + r.int(-6, 9));
      const payDate = weekday(new Date(date.getTime() + delay * 86400_000));
      const custKey = cust.key;
      schedule(payDate, async () => {
        const fresh = await db.document.findUniqueOrThrow({ where: { id: issued.id } });
        const open = fresh.total - fresh.paid;
        if (open <= 0) return;
        // Slow payers sometimes pay half first.
        const amount = (custKey === "gateway" || custKey === "mesaieed") && r.chance(0.4) ? Math.round(open / 2) : open;
        await pay("in", party[custKey], issued.id, amount, payDate, cust.terms === 0 ? "cash" : r.chance(0.25) ? "cheque" : "transfer", cust.terms === 0 ? cash : bank);
      });
    }

    // Office fit-outs: quote → back-to-back furniture order → delivery → invoice.
    for (let i = 0; i < (r.chance(0.3) ? 3 : 2); i++) {
      const qDay = Math.min(lastDay, r.int(2, 12));
      const qDate = weekday(dayOf(key, qDay));
      const fitKey = r.pick(["cowork", "bidda", "gateway", "dafna", "alkhor", "rawdat", "lusail"]);
      const cust = CUSTOMERS.find((c) => c.key === fitKey)!;
      const fit = [
        { sku: "FUR-CHAIR-MESH", qty: r.int(8, 30) },
        { sku: "FUR-DESK-140", qty: r.int(4, 14) },
        { sku: "FUR-CAB-4D", qty: r.int(2, 6) },
        { sku: "FUR-CHAIR-VIS", qty: r.int(4, 16) },
        ...(r.chance(0.5) ? [{ sku: "FUR-WB-120", qty: r.int(1, 4) }] : []),
      ];
      const lines = [
        ...fit.map((l) => ({ itemId: item[l.sku].id, description: item[l.sku].spec.name, qty: units(l.qty), unitPrice: q(item[l.sku].spec.sale), discountPct: l.qty >= 10 ? 750 : 0 })),
        { itemId: item["SRV-DELIVERY"].id, description: item["SRV-DELIVERY"].spec.name, qty: units(r.int(1, 3)), unitPrice: q(150) },
        { itemId: item["SRV-ASSEMBLY"].id, description: item["SRV-ASSEMBLY"].spec.name, qty: units(r.int(8, 24)), unitPrice: q(120) },
      ];
      const quote = await saveDocument(db, { orgId, kind: "quote", partyId: party[cust.key], campusId: campuses.warehouse, date: qDate, reference: `Office fit-out ${r.int(100, 999)}`, createdById: people.khalid, notes: "Office fit-out: supply, delivery and assembly.", terms: "50% on order, balance on delivery. Prices valid for 15 days.", lines });
      await db.document.update({ where: { id: quote.id }, data: { status: "sent" } });
      const won = r.chance(0.8);
      const orderDate = weekday(new Date(qDate.getTime() + r.int(3, 7) * 86400_000));
      if (!won || orderDate > now) {
        if (!won && (now.getTime() - qDate.getTime()) / 86400_000 > 20) await db.document.update({ where: { id: quote.id }, data: { status: "declined" } });
        continue;
      }
      await db.document.update({ where: { id: quote.id }, data: { status: "accepted" } });
      const po = await saveDocument(db, { orgId, kind: "po", partyId: party.furniture, campusId: campuses.warehouse, date: orderDate, reference: `For ${cust.name}`, createdById: people.omar, lines: fit.map((l) => ({ itemId: item[l.sku].id, description: item[l.sku].spec.name, qty: units(l.qty), unitPrice: q(item[l.sku].spec.cost) })) });
      await db.document.update({ where: { id: po.id }, data: { status: "sent" } });
      const delivered = weekday(new Date(orderDate.getTime() + r.int(6, 12) * 86400_000));
      if (delivered > now) continue;
      const poLines = await db.documentLine.findMany({ where: { documentId: po.id } });
      await receivePO(db, orgId, po.id, people.joseph, { campusId: campuses.warehouse, date: delivered, lines: poLines.map((l) => ({ lineId: l.id, qty: l.qty })) });
      for (const l of fit) bump(l.sku, campuses.warehouse, units(l.qty));
      const bill = await billFromPO(db, orgId, po.id, people.priya, delivered, `AOF${r.int(10000, 99999)}`);
      await postBill(db, orgId, bill.id, people.priya);
      const supPay = weekday(new Date(delivered.getTime() + r.int(50, 62) * 86400_000));
      schedule(supPay, () => pay("out", party.furniture, bill.id, bill.total, supPay, "cheque"));
      const invDate = weekday(new Date(delivered.getTime() + r.int(1, 3) * 86400_000));
      if (invDate > now) continue;
      const inv = await convertQuote(db, orgId, quote.id, people.khalid, invDate, INVOICE_TERMS);
      const issued = await issueInvoice(db, orgId, inv.id, people.khalid, invDate);
      invoiceCount++;
      for (const l of fit) bump(l.sku, campuses.warehouse, -units(l.qty));
      const half = Math.round(issued.total / 2);
      const d1 = weekday(new Date(invDate.getTime() + r.int(2, 8) * 86400_000));
      const d2 = weekday(new Date(invDate.getTime() + Math.max(10, (cust.pays ?? 30) + r.int(-5, 10)) * 86400_000));
      const ck = cust.key;
      schedule(d1, () => pay("in", party[ck], issued.id, half, d1, "transfer"));
      schedule(d2, async () => {
        const fresh = await db.document.findUniqueOrThrow({ where: { id: issued.id } });
        if (fresh.total - fresh.paid > 0) await pay("in", party[ck], issued.id, fresh.total - fresh.paid, d2, r.chance(0.5) ? "cheque" : "transfer");
      });
    }

    // Walk-in cash sales at the showroom.
    const walkins = Math.round(14 * f * (last ? lastDay / daysInMonth : 1));
    for (let i = 0; i < walkins; i++) {
      const date = weekday(dayOf(key, Math.max(1, Math.min(lastDay, r.int(1, lastDay)))));
      if (date > now) continue;
      const lines = buildLines(r, CUSTOMERS.find((c) => c.key === "walkin")!, products.filter((p) => p.cat !== "furniture"), (sku) => level(sku, campuses.showroom), true);
      if (!lines.length) continue;
      const inv = await saveDocument(db, { orgId, kind: "invoice", partyId: party.walkin, campusId: campuses.showroom, date, createdById: people.joseph, lines: lines.map((l) => ({ itemId: item[l.sku].id, description: item[l.sku].spec.name, qty: l.qty, unitPrice: q(item[l.sku].spec.sale) })) });
      await issueInvoice(db, orgId, inv.id, people.joseph, date);
      invoiceCount++;
      for (const l of lines) bump(l.sku, campuses.showroom, -l.qty);
      await pay("in", party.walkin, inv.id, inv.total, date, "cash", cash);
    }

    // Quotations that didn't (or haven't yet) become orders.
    for (let i = 0; i < Math.round(4 * f); i++) {
      const date = weekday(dayOf(key, Math.max(1, Math.min(lastDay, r.int(1, lastDay)))));
      if (date > now) continue;
      const cust = r.pick(customerPool);
      const lines = buildLines(r, cust, products, () => units(999));
      if (!lines.length) continue;
      const quote = await saveDocument(db, { orgId, kind: "quote", partyId: party[cust.key], campusId: campuses.warehouse, date, createdById: people.omar, terms: "Prices valid for 15 days. Delivery within Doha in 2 working days.", lines: lines.map((l) => ({ itemId: item[l.sku].id, description: item[l.sku].spec.name, qty: l.qty, unitPrice: q(item[l.sku].spec.sale) })) });
      const age = (now.getTime() - date.getTime()) / 86400_000;
      await db.document.update({ where: { id: quote.id }, data: { status: age > 20 ? (r.chance(0.6) ? "declined" : "sent") : r.chance(0.5) ? "sent" : "draft" } });
    }

    // Bank the showroom cash at month end.
    await flush(dayOf(key, lastDay));
    const cashBal = await db.journalLine.aggregate({ where: { orgId, accountId: cash }, _sum: { debit: true, credit: true } });
    const onHandCash = (cashBal._sum.debit ?? 0) - (cashBal._sum.credit ?? 0);
    // Keep a float for petty cash and cash-paid wages.
    if (!last && onHandCash > q(12000)) {
      const deposit = Math.floor((onHandCash - q(9000)) / 10000) * 10000;
      await postEntry(db, { orgId, date: dayOf(key, Math.min(lastDay, 28)), memo: "Showroom cash deposited at the bank", sourceType: "manual", createdById: people.priya, lines: [{ accountId: bank, debit: deposit }, { accountId: cash, credit: deposit }] });
    }

    // A stock count four months ago found a little shrinkage.
    if (m === 8) {
      const counted = [
        { sku: "PAN-COFFEE", diff: -3 },
        { sku: "WRT-HILITE", diff: -5 },
        { sku: "FIL-STAPLES", diff: 4 },
      ].map((c) => ({ itemId: item[c.sku].id, counted: Math.max(0, level(c.sku, campuses.showroom) + units(c.diff)), sku: c.sku, diff: c.diff }));
      await adjustStock(db, orgId, people.joseph, { campusId: campuses.showroom, date: dayOf(key, Math.min(lastDay, 27)), note: "Quarterly stock count, showroom", lines: counted });
      for (const c of counted) bump(c.sku, campuses.showroom, Math.max(-level(c.sku, campuses.showroom), units(c.diff)));
    }
  }
  await flush(now);

  // Make the shelves tell a story today: two items running low.
  for (const sku of ["TON-26A", "FUR-CHAIR-MESH"]) {
    const it = item[sku];
    const onHandNow = (await db.stockLevel.aggregate({ where: { itemId: it.id }, _sum: { qty: true } }))._sum.qty ?? 0;
    const target = Math.min(onHandNow, units(sku === "TON-26A" ? 5 : 3));
    let excess = onHandNow - target;
    // Sold to a big customer last week.
    const date = weekday(new Date(now.getTime() - 5 * 86400_000));
    for (const from of await db.stockLevel.findMany({ where: { itemId: it.id }, orderBy: { qty: "desc" } })) {
      const take = Math.floor(Math.min(excess, from.qty) / 100) * 100;
      if (take <= 0) continue;
      const inv = await saveDocument(db, { orgId, kind: "invoice", partyId: party.bidda, campusId: from.campusId, date, reference: "PO-7741", createdById: people.omar, lines: [{ itemId: it.id, description: it.spec.name, qty: take, unitPrice: q(it.spec.sale) }] });
      await issueInvoice(db, orgId, inv.id, people.omar, date);
      invoiceCount++;
      excess -= take;
    }
  }
  // A toner restock is on its way: ordered two days ago, due later this week.
  const ordered = weekday(new Date(now.getTime() - 2 * 86400_000));
  const restock = await saveDocument(db, {
    orgId,
    kind: "po",
    partyId: party.techno,
    campusId: campuses.warehouse,
    date: ordered,
    dueDate: new Date(now.getTime() + 3 * 86400_000),
    reference: "Urgent toner restock",
    createdById: people.omar,
    lines: ["TON-26A", "TON-EXV33", "INK-003-4"].map((sku) => ({ itemId: item[sku].id, description: item[sku].spec.name, qty: units(sku === "TON-26A" ? 30 : 12), unitPrice: q(item[sku].spec.cost) })),
  });
  await db.document.update({ where: { id: restock.id }, data: { status: "sent" } });

  stockAlerts.enabled = true;
  for (const it of Object.values(item)) await checkLowStock(db, orgId, it.id);

  return { invoices: invoiceCount };
}

function buildLines(r: Rng, cust: PartySpec, products: ItemSpec[], available: (sku: string) => number, small = false): { sku: string; qty: number }[] {
  const pool = products.filter((p) => (cust.likes ?? []).includes(p.cat));
  const count = small ? r.int(1, 3) : r.int(2, 6);
  const out: { sku: string; qty: number }[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const s = r.pick(pool);
    if (out.some((o) => o.sku === s.sku)) continue;
    const [lo, hi] = s.lot ?? [1, 3];
    const want = units(small ? Math.max(1, Math.round(lo / 2)) + r.int(0, 2) : Math.round(r.int(lo, hi) * 2.2));
    const qty = Math.min(want, Math.floor(available(s.sku) / 100) * 100);
    if (qty > 0) out.push({ sku: s.sku, qty });
  }
  return out;
}
