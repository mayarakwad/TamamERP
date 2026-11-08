// Admissions in progress, the library, announcements, staff leave and a few
// conversations: the parts of a school that make it feel lived in.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { nextNumber } from "../series";
import { billNewStudent } from "../school/fee-ops";
import { dohaNoon, ymdOf } from "../hr/ops";
import { POOLS, CULTURE_MIX, type Culture } from "./school-names";
import type { Rng } from "./random";
import { cid, type SchoolSeedCtx } from "./school";

type Db = PrismaClient | Prisma.TransactionClient;
const DAY = 86400_000;

function weighted<T>(r: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r.next() * total;
  for (const [v, w] of items) if ((x -= w) <= 0) return v;
  return items[items.length - 1][0];
}

const phone = (r: Rng) => `+974 ${r.pick(["3", "5", "6", "7"])}${r.int(100, 999)} ${r.int(1000, 9999)}`;

export async function seedSchoolExtras(db: Db, ctx: SchoolSeedCtx, r: Rng) {
  await seedApplications(db, ctx, r);
  await seedLibrary(db, ctx, r);
  await seedAnnouncements(db, ctx);
  await seedStaffBits(db, ctx, r);
}

// ───────────────────────── Admissions ─────────────────────────

async function seedApplications(db: Db, ctx: SchoolSeedCtx, r: Rng) {
  const { orgId, now } = ctx;
  const campuses = Object.entries(ctx.campusIds) as [keyof typeof ctx.campusIds, string][];
  const maxLevel = { WAB: 12, LUS: 8, WAK: 5 } as const;
  const plan: { stage: string; count: number; year: "next" | "this" }[] = [
    { stage: "applied", count: 13, year: "next" },
    { stage: "assessment", count: 9, year: "next" },
    { stage: "offered", count: 7, year: "next" },
    { stage: "enrolled", count: 6, year: "next" },
    { stage: "declined", count: 3, year: "next" },
    { stage: "withdrawn", count: 2, year: "next" },
    { stage: "applied", count: 3, year: "this" },
    { stage: "assessment", count: 1, year: "this" },
    { stage: "offered", count: 1, year: "this" },
  ];
  const sources: [string, number][] = [["web", 45], ["walkin", 30], ["referral", 15], ["sibling", 10]];
  const families = ctx.people.families;
  let k = 0;
  for (const p of plan) {
    for (let i = 0; i < p.count; i++, k++) {
      const [campus, campusId] = r.pick(campuses);
      // Next year: mostly KG1 and Grade 1 intakes. This year: older children moving to Doha mid-year.
      const level = p.year === "next" ? weighted(r, [[-1, 40], [0, 10], [1, 20], [r.int(2, maxLevel[campus]), 30]] as [number, number][]) : r.int(1, maxLevel[campus]);
      const grade = ctx.gradeByLevel.get(level)!;
      const source = weighted(r, sources);
      const sibling = source === "sibling" ? r.pick(families.filter((f) => ctx.people.students.find((s) => s.id === f.childIds[0])?.campus === campus)) : null;
      const culture: Culture = sibling ? sibling.culture : weighted(r, CULTURE_MIX);
      const pool = POOLS[culture];
      const female = r.chance(0.5);
      const first = r.pick(female ? pool.girls : pool.boys);
      const fam = r.pick(pool.families);
      let father = r.pick(pool.boys);
      while (father[0] === first[0]) father = r.pick(pool.boys);
      const guardian = sibling ? ctx.people.guardians.find((g) => g.id === sibling.primaryGuardianId)! : null;
      const childName = pool.patronymic ? `${first[0]} ${father[0]} ${fam[0]}` : `${first[0]} ${fam[0]}`;
      const childNameAr = pool.patronymic ? `${first[1]} ${father[1]} ${fam[1]}` : `${first[1]} ${fam[1]}`;
      const startYear = p.year === "next" ? ctx.startYear + 1 : ctx.startYear;
      const birthYear = startYear - 6 - level;
      const created = new Date(now.getTime() - (p.stage === "applied" ? r.int(0, 12) : p.stage === "assessment" ? r.int(10, 30) : r.int(25, 70)) * DAY);
      const stageAt = new Date(Math.min(now.getTime() - r.int(0, 3) * DAY, created.getTime() + r.int(3, 20) * DAY));
      const assessmentAt =
        p.stage === "assessment" ? (i < 6 ? new Date(now.getTime() + r.int(1, 12) * DAY) : new Date(now.getTime() - r.int(1, 6) * DAY)) : ["offered", "enrolled", "declined"].includes(p.stage) ? new Date(stageAt.getTime() - r.int(3, 10) * DAY) : null;
      if (assessmentAt) assessmentAt.setUTCHours(6 + r.int(0, 4), r.pick([0, 30]), 0, 0);
      const score = p.stage === "declined" ? r.int(28, 45) : ["offered", "enrolled"].includes(p.stage) || (p.stage === "assessment" && i >= 6) ? r.int(58, 96) : null;
      const number = await nextNumber(db, orgId, "APP", created);
      const id = cid();
      await db.application.create({
        data: {
          id,
          orgId,
          number,
          yearId: p.year === "next" ? ctx.nextYear.id : ctx.year.id,
          campusId,
          gradeId: grade.id,
          childName,
          childNameAr,
          gender: female ? "f" : "m",
          dob: dohaNoon(`${birthYear}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`),
          nationality: r.pick(pool.nationalities),
          previousSchool: level > 0 ? r.pick(["Doha British School", "Qatar Academy", "Birla Public School", "a school in Dubai", "a school in London", "a school in Amman", "a nursery in Al Waab", "Bright Kids Nursery"]) : null,
          guardianName: guardian?.name ?? (pool.patronymic ? `${father[0]} ${r.pick(pool.boys)[0]} ${fam[0]}` : `${father[0]} ${fam[0]}`),
          guardianNameAr: guardian?.nameAr ?? (pool.patronymic ? `${father[1]} ${fam[1]}` : `${father[1]} ${fam[1]}`),
          guardianRelation: "father",
          guardianPhone: guardian?.phone ?? phone(r),
          guardianEmail: guardian?.email ?? `${first[0].toLowerCase().replace(/[^a-z]/g, "")}.family${r.int(10, 99)}@example.com`,
          guardianId: guardian?.id ?? null,
          stage: p.stage,
          stageAt,
          assessmentAt,
          assessmentScore: score,
          source: sibling ? "sibling" : source === "sibling" ? "referral" : source,
          notes: k % 7 === 0 ? "Family relocating from abroad in the summer; asked about bus routes." : k % 11 === 0 ? "Older sibling may apply next year as well." : null,
          createdAt: created,
        },
      });
      if (p.stage === "enrolled") await enroll(db, ctx, id, r);
    }
  }
}

/** The same steps as the app's enrolment: a family, a student joining next year, the registration fee. */
async function enroll(db: Db, ctx: SchoolSeedCtx, applicationId: string, r: Rng) {
  const a = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
  let guardianId = a.guardianId;
  if (!guardianId) guardianId = (await db.guardian.create({ data: { orgId: ctx.orgId, name: a.guardianName, nameAr: a.guardianNameAr, phone: a.guardianPhone, email: a.guardianEmail } })).id;
  const joinedOn = dohaNoon(`${ctx.startYear + 1}-08-23`);
  const number = await nextNumber(db, ctx.orgId, "ADM", joinedOn);
  const st = await db.student.create({
    data: { orgId: ctx.orgId, number, name: a.childName, nameAr: a.childNameAr, gender: a.gender, dob: a.dob, nationality: a.nationality, campusId: a.campusId, gradeId: a.gradeId, status: "upcoming", joinedOn, previousSchool: a.previousSchool, avatarColor: r.pick(["#4B3FA8", "#0B6E8A", "#1F7A4D", "#C4467A"]) },
  });
  await db.studentGuardian.create({ data: { orgId: ctx.orgId, studentId: st.id, guardianId, relation: "father", primary: true } });
  await db.application.update({ where: { id: applicationId }, data: { studentId: st.id, guardianId } });
  await billNewStudent(db, ctx.orgId, st.id, ctx.users.fatima, a.stageAt);
}

// ───────────────────────── Library ─────────────────────────

const BOOKS: [title: string, author: string, cat: string, lang: "en" | "ar", level: number][] = [
  ["The Very Hungry Caterpillar", "Eric Carle", "Picture books", "en", -1],
  ["Where the Wild Things Are", "Maurice Sendak", "Picture books", "en", 0],
  ["The Gruffalo", "Julia Donaldson", "Picture books", "en", -1],
  ["Room on the Broom", "Julia Donaldson", "Picture books", "en", 0],
  ["Guess How Much I Love You", "Sam McBratney", "Picture books", "en", -1],
  ["Elmer", "David McKee", "Picture books", "en", 0],
  ["The Tiger Who Came to Tea", "Judith Kerr", "Picture books", "en", 0],
  ["Green Eggs and Ham", "Dr. Seuss", "Early readers", "en", 1],
  ["Frog and Toad Are Friends", "Arnold Lobel", "Early readers", "en", 1],
  ["Charlotte's Web", "E. B. White", "Fiction", "en", 3],
  ["Matilda", "Roald Dahl", "Fiction", "en", 4],
  ["Charlie and the Chocolate Factory", "Roald Dahl", "Fiction", "en", 3],
  ["The BFG", "Roald Dahl", "Fiction", "en", 3],
  ["Fantastic Mr Fox", "Roald Dahl", "Fiction", "en", 2],
  ["The Lion, the Witch and the Wardrobe", "C. S. Lewis", "Fiction", "en", 4],
  ["Harry Potter and the Philosopher's Stone", "J. K. Rowling", "Fiction", "en", 5],
  ["Harry Potter and the Chamber of Secrets", "J. K. Rowling", "Fiction", "en", 5],
  ["Wonder", "R. J. Palacio", "Fiction", "en", 6],
  ["Holes", "Louis Sachar", "Fiction", "en", 6],
  ["The Boy in the Striped Pyjamas", "John Boyne", "Fiction", "en", 8],
  ["Diary of a Wimpy Kid", "Jeff Kinney", "Fiction", "en", 4],
  ["Percy Jackson and the Lightning Thief", "Rick Riordan", "Fiction", "en", 6],
  ["The Hobbit", "J. R. R. Tolkien", "Fiction", "en", 7],
  ["Pax", "Sara Pennypacker", "Fiction", "en", 5],
  ["Number the Stars", "Lois Lowry", "Fiction", "en", 6],
  ["The Giver", "Lois Lowry", "Fiction", "en", 8],
  ["Animal Farm", "George Orwell", "Classics", "en", 9],
  ["To Kill a Mockingbird", "Harper Lee", "Classics", "en", 10],
  ["Of Mice and Men", "John Steinbeck", "Classics", "en", 10],
  ["Lord of the Flies", "William Golding", "Classics", "en", 10],
  ["The Alchemist", "Paulo Coelho", "Fiction", "en", 10],
  ["A Christmas Carol", "Charles Dickens", "Classics", "en", 8],
  ["Macbeth", "William Shakespeare", "Classics", "en", 11],
  ["Romeo and Juliet", "William Shakespeare", "Classics", "en", 9],
  ["The Curious Incident of the Dog in the Night-Time", "Mark Haddon", "Fiction", "en", 10],
  ["Brief Answers to the Big Questions", "Stephen Hawking", "Science", "en", 11],
  ["A Short History of Nearly Everything", "Bill Bryson", "Science", "en", 11],
  ["The Way Things Work Now", "David Macaulay", "Science", "en", 6],
  ["National Geographic Kids Almanac", "National Geographic", "Reference", "en", 4],
  ["Oxford Primary Dictionary", "Oxford", "Reference", "en", 2],
  ["Oxford Illustrated Science Encyclopedia", "Oxford", "Reference", "en", 7],
  ["Good Night Stories for Rebel Girls", "Elena Favilli", "Biography", "en", 4],
  ["I Am Malala", "Malala Yousafzai", "Biography", "en", 9],
  ["Hidden Figures (Young Readers' Edition)", "Margot Lee Shetterly", "Biography", "en", 7],
  ["The 1001 Inventions of Muslim Civilisation", "Salim Al-Hassani", "History", "en", 7],
  ["Qatar: A Modern History", "Allen J. Fromherz", "History", "en", 11],
  ["Sinbad the Sailor", "Retold by Ali Al-Saleh", "Fiction", "en", 3],
  ["Coding for Kids: Python", "Adrienne Tacke", "Computing", "en", 6],
  ["Cambridge IGCSE Mathematics Core and Extended", "Ric Pimentel", "Textbooks", "en", 10],
  ["Cambridge IGCSE Physics", "Tom Duncan", "Textbooks", "en", 10],
  ["كليلة ودمنة", "ابن المقفع", "أدب", "ar", 6],
  ["ألف ليلة وليلة للأطفال", "كامل كيلاني", "قصص", "ar", 3],
  ["الأيام", "طه حسين", "أدب", "ar", 10],
  ["رجال في الشمس", "غسان كنفاني", "أدب", "ar", 11],
  ["موسم الهجرة إلى الشمال", "الطيب صالح", "أدب", "ar", 12],
  ["عائد إلى حيفا", "غسان كنفاني", "أدب", "ar", 11],
  ["أنا وأختي والقمر", "تغريد النجار", "قصص مصورة", "ar", 0],
  ["الحلزون العنيد", "تغريد النجار", "قصص مصورة", "ar", -1],
  ["لماذا لا تنام الزرافة؟", "ريم الجابري", "قصص مصورة", "ar", 0],
  ["حكايات جدتي القطرية", "مريم آل سعد", "قصص", "ar", 2],
  ["سلسلة المكتبة الخضراء: سندريلا", "دار المعارف", "قصص", "ar", 1],
  ["سلسلة المكتبة الخضراء: الأرنب الذكي", "دار المعارف", "قصص", "ar", 1],
  ["قصص الأنبياء للأطفال", "ابن كثير (مبسط)", "دين", "ar", 3],
  ["تاريخ قطر الحديث", "د. مصطفى عقيل", "تاريخ", "ar", 9],
  ["أطلس الوطن العربي", "دار الشروق", "مراجع", "ar", 6],
  ["المعجم الوسيط للطلاب", "مجمع اللغة العربية", "مراجع", "ar", 7],
  ["الطنطورية", "رضوى عاشور", "أدب", "ar", 12],
  ["ساق البامبو", "سعود السنعوسي", "أدب", "ar", 12],
  ["البحر والصياد الصغير", "عبدالله المالكي", "قصص مصورة", "ar", 1],
  ["علوم مدهشة للأطفال", "دار الفاروق", "علوم", "ar", 4],
];

async function seedLibrary(db: Db, ctx: SchoolSeedCtx, r: Rng) {
  const { orgId, now } = ctx;
  const covers = ["#4B3FA8", "#0B6E8A", "#B5541C", "#1F7A4D", "#8A1538", "#2F7DB8", "#A86B00", "#C4467A", "#5A6B7A", "#8E5CC9", "#D9644A", "#0B8A7A"];
  const maxLevel = { WAB: 12, LUS: 8, WAK: 5 } as const;
  const books: { id: string; campus: keyof typeof maxLevel; level: number; copies: number }[] = [];
  const rows: Prisma.BookCreateManyInput[] = [];
  for (const campus of ["WAB", "LUS", "WAK"] as const) {
    for (const [i, [title, author, cat, lang, level]] of BOOKS.entries()) {
      if (level > maxLevel[campus] + 1) continue;
      if (campus !== "WAB" && r.chance(0.25)) continue;
      const id = cid();
      const copies = level <= 5 ? r.int(2, 5) : r.int(1, 3);
      rows.push({ id, orgId, campusId: ctx.campusIds[campus], title, author, category: cat, language: lang, shelf: `${lang === "ar" ? "ع" : String.fromCharCode(65 + (i % 8))}-${r.int(1, 30)}`, copies, coverColor: covers[i % covers.length], isbn: lang === "en" ? `978${r.int(1000000000, 1999999999)}` : null });
      books.push({ id, campus, level, copies });
    }
  }
  await db.book.createMany({ data: rows });
  const loans: Prisma.LoanCreateManyInput[] = [];
  const active = new Map<string, number>();
  const students = ctx.people.students;
  for (const st of students) {
    if (st.level < 1 || !r.chance(0.55)) continue;
    const shelf = books.filter((b) => b.campus === st.campus && Math.abs(b.level - st.level) <= 2);
    const n = r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const b = r.pick(shelf);
      if (!b) continue;
      const borrowed = new Date(now.getTime() - r.int(1, 75) * DAY);
      const due = new Date(borrowed.getTime() + 14 * DAY);
      const out = i === n - 1 && r.chance(0.45) && (active.get(b.id) ?? 0) < b.copies;
      // Most come back on time; a handful are a week or two late.
      const returned = out ? null : new Date(Math.min(now.getTime() - DAY, borrowed.getTime() + r.int(5, r.chance(0.12) ? 24 : 14) * DAY));
      if (out) active.set(b.id, (active.get(b.id) ?? 0) + 1);
      loans.push({ id: cid(), orgId, bookId: b.id, studentId: st.id, borrowedOn: borrowed, dueOn: due, returnedOn: returned, issuedById: ctx.users.fatima });
    }
  }
  await db.loan.createMany({ data: loans });
}

// ───────────────────────── Announcements ─────────────────────────

async function seedAnnouncements(db: Db, ctx: SchoolSeedCtx) {
  const { orgId, now, users } = ctx;
  const d = (days: number) => new Date(now.getTime() - days * DAY);
  const y = ctx.startYear;
  const g12 = ctx.gradeByLevel.get(12)!.id;
  const rows: Prisma.AnnouncementCreateManyInput[] = [
    { title: "National Day holiday", titleAr: "عطلة اليوم الوطني", body: `School is closed on Thursday 18 December for Qatar National Day. Classes resume on Sunday 21 December. Students are welcome to wear national dress on Wednesday 17 December for our celebration assembly.`, bodyAr: `المدرسة مغلقة يوم الخميس 18 ديسمبر بمناسبة اليوم الوطني لدولة قطر، وتُستأنف الدراسة يوم الأحد 21 ديسمبر. يُرحَّب بارتداء الزي الوطني يوم الأربعاء 17 ديسمبر في احتفال المدرسة.`, audience: "everyone", pinned: true, publishedAt: d(2) },
    { title: "Mid-term progress meetings", titleAr: "لقاءات أولياء الأمور لمتابعة منتصف الفصل", body: "Parent–teacher meetings for all grades are on Tuesday 25 and Wednesday 26 November, 13:30–17:00. Book a slot with your child's class teacher through the office.", bodyAr: "لقاءات أولياء الأمور مع المعلمين لجميع الصفوف يومي الثلاثاء 25 والأربعاء 26 نوفمبر من 1:30 إلى 5:00 مساءً. يرجى حجز موعد مع معلم الفصل عبر مكتب المدرسة.", audience: "parents", publishedAt: d(4) },
    { title: "Staff INSET day, Thursday 20 November", titleAr: "يوم تدريب المعلمين، الخميس 20 نوفمبر", body: "There are no classes for students on Thursday 20 November. Buses will not run. Staff training starts at 07:30 in the Al Waab hall.", bodyAr: "لا دوام للطلاب يوم الخميس 20 نوفمبر ولن تعمل الحافلات. يبدأ تدريب المعلمين في 7:30 صباحاً في قاعة فرع الوعب.", audience: "everyone", publishedAt: d(6) },
    { title: "Book fair in the library", titleAr: "معرض الكتاب في المكتبة", body: "Our book fair runs from 16 to 20 November with English and Arabic titles for every age. Every purchase adds books to the school library.", bodyAr: "يقام معرض الكتاب من 16 إلى 20 نوفمبر بكتب عربية وإنجليزية لكل الأعمار، وكل عملية شراء تضيف كتباً إلى مكتبة المدرسة.", audience: "everyone", publishedAt: d(1) },
    { title: "Winter uniform", titleAr: "الزي الشتوي", body: "Winter uniform (navy jumper or blazer) is optional from 1 December and required from 4 January.", bodyAr: "الزي الشتوي (الكنزة أو السترة الكحلية) اختياري من 1 ديسمبر وإلزامي من 4 يناير.", audience: "parents", publishedAt: d(9) },
    { title: "University guidance evening for Grade 12", titleAr: "أمسية الإرشاد الجامعي لطلاب الصف الثاني عشر", body: "Representatives from Qatar University, HBKU, Carnegie Mellon Qatar and UK universities will be at the Al Waab hall on Monday 1 December at 18:00.", bodyAr: "يحضر ممثلون عن جامعة قطر وجامعة حمد بن خليفة وكارنيغي ميلون قطر وجامعات بريطانية إلى قاعة فرع الوعب يوم الاثنين 1 ديسمبر الساعة 6:00 مساءً.", audience: "parents", gradeId: g12, campusId: ctx.campusIds.WAB, publishedAt: d(3) },
    { title: "Bus 4 pick-up times change on Sunday", titleAr: "تغيير مواعيد الحافلة رقم 4 بدءاً من الأحد", body: "Because of road works at the Pearl, Bus 4 will pick up 10 minutes earlier at every stop from Sunday. The bus is full; we're adding a second vehicle on this route next term.", bodyAr: "بسبب أعمال الطرق في اللؤلؤة، ستمر الحافلة رقم 4 قبل موعدها بعشر دقائق في كل المحطات بدءاً من الأحد. الحافلة مكتملة، وسنضيف حافلة ثانية لهذا الخط في الفصل القادم.", audience: "parents", campusId: ctx.campusIds.WAB, publishedAt: d(0) },
    { title: "Swimming lessons start at Lusail", titleAr: "بدء دروس السباحة في فرع لوسيل", body: "Grades 1–5 start swimming on Sundays and Tuesdays. Please pack a swimsuit, cap and towel.", bodyAr: "يبدأ طلاب الصفوف من الأول إلى الخامس دروس السباحة يومي الأحد والثلاثاء. يرجى إحضار ملابس السباحة والقبعة والمنشفة.", audience: "parents", campusId: ctx.campusIds.LUS, publishedAt: d(12) },
    { title: "Term 1 report comments due 4 December", titleAr: "موعد تسليم ملاحظات شهادات الفصل الأول 4 ديسمبر", body: "Class teachers: please finish report-card comments by Thursday 4 December so principals can review and publish before the holiday.", bodyAr: "على معلمي الفصول إكمال ملاحظات الشهادات قبل الخميس 4 ديسمبر ليتمكن المديرون من مراجعتها ونشرها قبل العطلة.", audience: "staff", publishedAt: d(5) },
    { title: `Welcome back to ${y}–${String(y + 1).slice(2)}`, titleAr: `أهلاً بكم في العام الدراسي ${y}–${String(y + 1).slice(2)}`, body: "We're delighted to welcome 190 new students and 11 new teachers across our three campuses this year.", bodyAr: "يسعدنا أن نرحب هذا العام بـ190 طالباً جديداً و11 معلماً جديداً في فروعنا الثلاثة.", audience: "everyone", publishedAt: dohaNoon(`${y}-08-24`) },
  ].map((a) => ({ ...a, id: cid(), orgId, authorId: users.fatima }));
  await db.announcement.createMany({ data: rows });
}

// ───────────────────────── Staff leave and conversations ─────────────────────────

async function seedStaffBits(db: Db, ctx: SchoolSeedCtx, r: Rng) {
  const { orgId, now, users } = ctx;
  const teacherIds = ctx.staff.teachers.map((t) => t.id).filter((id) => id !== ctx.staff.homeroom.get(ctx.staff.aishaSectionId));
  // Two leave requests waiting for the principal, one approved earlier.
  const reqs = [
    { emp: r.pick(teacherIds), type: "annual", start: 18, days: 3, status: "submitted", reason: "Sister's wedding in Amman" },
    { emp: r.pick(teacherIds), type: "sick", start: 1, days: 2, status: "submitted", reason: "Flu, doctor's note attached" },
    { emp: r.pick(teacherIds), type: "emergency", start: -20, days: 2, status: "approved", reason: "Family emergency" },
  ];
  for (const q of reqs) {
    const start = dohaNoon(ymdOf(new Date(now.getTime() + q.start * DAY)));
    const end = new Date(start.getTime() + (q.days - 1) * DAY);
    const number = await nextNumber(db, orgId, "LV", start);
    await db.leaveRequest.create({ data: { orgId, number, employeeId: q.emp, type: q.type, startDate: start, endDate: end, days: q.days, reason: q.reason, status: q.status, requestedById: users.fatima, ...(q.status === "approved" ? { decidedById: users.fatima, decidedAt: new Date(start.getTime() - 2 * DAY) } : {}) } });
  }
  // A conversation on Ahmed's record between his class teacher and the office.
  const ahmed = ctx.people.almansouri.ahmed;
  await db.comment.createMany({
    data: [
      { orgId, entityType: "student", entityId: ahmed, authorId: users.fatima, body: "Ahmed's mother called: he'll be collected at 12:00 on Thursday for a dentist appointment.", createdAt: new Date(now.getTime() - 3 * DAY) },
    ],
  });
}
