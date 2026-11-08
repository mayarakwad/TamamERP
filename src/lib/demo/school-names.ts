// Names for the demo school, each with its Arabic spelling, grouped the way
// families at an international school in Doha actually are.

export type Culture = "gulf" | "levant" | "egypt" | "southAsia" | "western" | "philippines" | "maghreb";

type N = readonly [en: string, ar: string];

export interface CulturePool {
  boys: readonly N[];
  girls: readonly N[];
  families: readonly N[];
  /** Arab naming: child takes father's first name before the family name */
  patronymic: boolean;
  nationalities: readonly string[];
}

export const POOLS: Record<Culture, CulturePool> = {
  gulf: {
    patronymic: true,
    nationalities: ["QA", "QA", "QA", "QA", "SA", "KW", "BH", "OM", "AE"],
    boys: [
      ["Mohammed", "محمد"], ["Abdullah", "عبدالله"], ["Hamad", "حمد"], ["Khalifa", "خليفة"], ["Jassim", "جاسم"], ["Fahad", "فهد"], ["Ali", "علي"], ["Saud", "سعود"],
      ["Tamim", "تميم"], ["Nasser", "ناصر"], ["Faisal", "فيصل"], ["Sultan", "سلطان"], ["Yousef", "يوسف"], ["Ahmed", "أحمد"], ["Khalid", "خالد"], ["Rashid", "راشد"],
      ["Saif", "سيف"], ["Mubarak", "مبارك"], ["Abdulaziz", "عبدالعزيز"], ["Hassan", "حسن"], ["Majed", "ماجد"], ["Salem", "سالم"], ["Ghanim", "غانم"], ["Mansour", "منصور"],
    ],
    girls: [
      ["Maryam", "مريم"], ["Noora", "نورة"], ["Aisha", "عائشة"], ["Fatima", "فاطمة"], ["Hessa", "حصة"], ["Sara", "سارة"], ["Al Anoud", "العنود"], ["Moza", "موزة"],
      ["Shaikha", "شيخة"], ["Dana", "دانة"], ["Lulwa", "لولوة"], ["Reem", "ريم"], ["Hind", "هند"], ["Alya", "علياء"], ["Latifa", "لطيفة"], ["Jawaher", "جواهر"],
      ["Amna", "آمنة"], ["Haya", "هيا"], ["Sheikha", "شيخة"], ["Ghalia", "غالية"], ["Mashael", "مشاعل"], ["Wadha", "وضحى"],
    ],
    families: [
      ["Al-Kuwari", "الكواري"], ["Al-Marri", "المري"], ["Al-Mannai", "المناعي"], ["Al-Naimi", "النعيمي"], ["Al-Kubaisi", "الكبيسي"], ["Al-Mohannadi", "المهندي"],
      ["Al-Emadi", "العمادي"], ["Al-Hajri", "الهاجري"], ["Al-Hammadi", "الحمادي"], ["Al-Khulaifi", "الخليفي"], ["Al-Sada", "السادة"], ["Al-Jaber", "الجابر"],
      ["Al-Muftah", "المفتاح"], ["Al-Obaidli", "العبيدلي"], ["Al-Malki", "المالكي"], ["Al-Baker", "الباكر"], ["Al-Darwish", "الدرويش"], ["Al-Sulaiti", "السليطي"],
      ["Al-Shahwani", "الشهواني"], ["Al-Rumaihi", "الرميحي"], ["Al-Abdulla", "العبدالله"], ["Al-Ansari", "الأنصاري"], ["Al-Khater", "الخاطر"], ["Al-Misnad", "المسند"],
    ],
  },
  levant: {
    patronymic: false,
    nationalities: ["JO", "LB", "SY", "PS", "JO", "LB"],
    boys: [
      ["Omar", "عمر"], ["Karim", "كريم"], ["Adam", "آدم"], ["Yusuf", "يوسف"], ["Zaid", "زيد"], ["Rayan", "ريان"], ["Hamza", "حمزة"], ["Ziad", "زياد"],
      ["Majd", "مجد"], ["Elias", "إلياس"], ["Tarek", "طارق"], ["Sami", "سامي"], ["Jad", "جاد"], ["Ward", "ورد"], ["Fadi", "فادي"], ["Nabil", "نبيل"],
    ],
    girls: [
      ["Lana", "لانا"], ["Jana", "جنى"], ["Layla", "ليلى"], ["Yasmin", "ياسمين"], ["Talia", "تاليا"], ["Salma", "سلمى"], ["Nour", "نور"], ["Lea", "ليا"],
      ["Rania", "رانيا"], ["Hala", "هالة"], ["Malak", "ملك"], ["Farah", "فرح"], ["Tala", "تالا"], ["Celine", "سيلين"], ["Maya", "مايا"], ["Dima", "ديما"],
    ],
    families: [
      ["Haddad", "حداد"], ["Khoury", "خوري"], ["Nasser", "ناصر"], ["Saleh", "صالح"], ["Mansour", "منصور"], ["Darwish", "درويش"], ["Hijazi", "حجازي"], ["Barakat", "بركات"],
      ["Awad", "عوض"], ["Qasem", "قاسم"], ["Zein", "زين"], ["Shami", "شامي"], ["Tawil", "طويل"], ["Hamdan", "حمدان"], ["Abu Khalil", "أبو خليل"], ["Sabbagh", "صباغ"],
    ],
  },
  egypt: {
    patronymic: true,
    nationalities: ["EG", "EG", "EG", "SD"],
    boys: [
      ["Mostafa", "مصطفى"], ["Youssef", "يوسف"], ["Ahmed", "أحمد"], ["Mahmoud", "محمود"], ["Hassan", "حسن"], ["Seif", "سيف"], ["Malek", "مالك"], ["Eyad", "إياد"],
      ["Marwan", "مروان"], ["Hazem", "حازم"], ["Kareem", "كريم"], ["Amr", "عمرو"],
    ],
    girls: [
      ["Mariam", "مريم"], ["Habiba", "حبيبة"], ["Nour", "نور"], ["Salma", "سلمى"], ["Farida", "فريدة"], ["Jana", "جنى"], ["Rokaya", "رقية"], ["Malak", "ملك"],
      ["Hana", "هنا"], ["Laila", "ليلى"], ["Nada", "ندى"], ["Yara", "يارا"],
    ],
    families: [
      ["Abdelrahman", "عبدالرحمن"], ["El-Masri", "المصري"], ["Fathy", "فتحي"], ["Ibrahim", "إبراهيم"], ["Mostafa", "مصطفى"], ["Shawky", "شوقي"], ["Ragab", "رجب"], ["Soliman", "سليمان"],
      ["Osman", "عثمان"], ["El-Sayed", "السيد"], ["Hegazy", "حجازي"], ["Gaber", "جابر"],
    ],
  },
  southAsia: {
    patronymic: false,
    nationalities: ["IN", "IN", "IN", "PK", "PK", "BD", "LK"],
    boys: [
      ["Aarav", "آراف"], ["Arjun", "أرجون"], ["Rohan", "روهان"], ["Ayaan", "أيان"], ["Vihaan", "فيهان"], ["Ibrahim", "إبراهيم"], ["Zayan", "زيان"], ["Rehan", "ريحان"],
      ["Kabir", "كبير"], ["Aditya", "أديتيا"], ["Ishaan", "إيشان"], ["Sameer", "سمير"], ["Arham", "أرحم"], ["Dev", "ديف"], ["Hamdan", "حمدان"], ["Nikhil", "نيخيل"],
    ],
    girls: [
      ["Ananya", "أنانيا"], ["Diya", "ديا"], ["Inaya", "عناية"], ["Myra", "مايرا"], ["Saanvi", "سانفي"], ["Zara", "زارا"], ["Meera", "ميرا"], ["Anika", "أنيكا"],
      ["Riya", "ريا"], ["Hania", "هانيا"], ["Aisha", "عائشة"], ["Kavya", "كافيا"], ["Ira", "إيرا"], ["Amaira", "أميرة"], ["Sara", "سارة"], ["Tanvi", "تانفي"],
    ],
    families: [
      ["Sharma", "شارما"], ["Nair", "ناير"], ["Menon", "مينون"], ["Iyer", "آيير"], ["Pillai", "بيلاي"], ["Khan", "خان"], ["Qureshi", "قريشي"], ["Siddiqui", "صديقي"],
      ["Patel", "باتيل"], ["Reddy", "ريدي"], ["Rao", "راو"], ["Chaudhry", "تشودري"], ["Hussain", "حسين"], ["Mathew", "ماثيو"], ["Varghese", "فارغيس"], ["Fernandes", "فرنانديز"],
      ["Rahman", "رحمن"], ["Perera", "بيريرا"], ["Kapoor", "كابور"], ["Joseph", "جوزيف"],
    ],
  },
  western: {
    patronymic: false,
    nationalities: ["GB", "GB", "IE", "ZA", "US", "CA", "AU", "NZ", "FR"],
    boys: [
      ["Oliver", "أوليفر"], ["Jack", "جاك"], ["Noah", "نوح"], ["Leo", "ليو"], ["Ethan", "إيثان"], ["Lucas", "لوكاس"], ["James", "جيمس"], ["Harry", "هاري"],
      ["Thomas", "توماس"], ["Daniel", "دانيال"], ["Samuel", "صموئيل"], ["Max", "ماكس"], ["Finn", "فين"], ["Charlie", "تشارلي"], ["Liam", "ليام"], ["Henry", "هنري"],
    ],
    girls: [
      ["Emily", "إيميلي"], ["Sophie", "صوفي"], ["Olivia", "أوليفيا"], ["Ava", "آفا"], ["Grace", "غريس"], ["Isla", "آيلا"], ["Chloe", "كلوي"], ["Ella", "إيلا"],
      ["Amelia", "أميليا"], ["Mia", "ميا"], ["Lily", "ليلي"], ["Hannah", "هانا"], ["Freya", "فريا"], ["Ruby", "روبي"], ["Zoe", "زوي"], ["Evie", "إيفي"],
    ],
    families: [
      ["Smith", "سميث"], ["Johnson", "جونسون"], ["Williams", "ويليامز"], ["Brown", "براون"], ["Taylor", "تايلور"], ["Wilson", "ويلسون"], ["Murphy", "مورفي"], ["O'Brien", "أوبراين"],
      ["Walker", "ووكر"], ["Wright", "رايت"], ["Evans", "إيفانز"], ["Clarke", "كلارك"], ["Bennett", "بينيت"], ["Hughes", "هيوز"], ["Campbell", "كامبل"], ["van der Merwe", "فان دير ميرفي"],
      ["Kelly", "كيلي"], ["Martin", "مارتن"], ["Dubois", "دوبوا"], ["Robinson", "روبنسون"],
    ],
  },
  philippines: {
    patronymic: false,
    nationalities: ["PH"],
    boys: [
      ["Gabriel", "غابرييل"], ["Joshua", "جوشوا"], ["Nathan", "ناثان"], ["Miguel", "ميغيل"], ["Paolo", "باولو"], ["Rafael", "رافائيل"], ["Ethan", "إيثان"], ["Andrei", "أندريه"],
    ],
    girls: [
      ["Andrea", "أندريا"], ["Bea", "بيا"], ["Nicole", "نيكول"], ["Angela", "أنجيلا"], ["Sofia", "صوفيا"], ["Kyla", "كايلا"], ["Althea", "ألثيا"], ["Janelle", "جانيل"],
    ],
    families: [
      ["Santos", "سانتوس"], ["Reyes", "رييس"], ["Cruz", "كروز"], ["Bautista", "باوتيستا"], ["Garcia", "غارسيا"], ["Mendoza", "ميندوزا"], ["Del Rosario", "ديل روساريو"], ["Aquino", "أكينو"], ["Ramos", "راموس"],
    ],
  },
  maghreb: {
    patronymic: false,
    nationalities: ["TN", "MA", "DZ"],
    boys: [
      ["Yassine", "ياسين"], ["Anas", "أنس"], ["Ilyes", "إلياس"], ["Rayane", "ريان"], ["Mehdi", "مهدي"], ["Aymen", "أيمن"], ["Skander", "إسكندر"], ["Walid", "وليد"],
    ],
    girls: [
      ["Ines", "إيناس"], ["Lina", "لينا"], ["Yasmine", "ياسمين"], ["Meriem", "مريم"], ["Sarra", "سارة"], ["Amira", "أميرة"], ["Rim", "ريم"], ["Nesrine", "نسرين"],
    ],
    families: [
      ["Ben Ali", "بن علي"], ["Trabelsi", "الطرابلسي"], ["Bouazizi", "البوعزيزي"], ["El Amrani", "العمراني"], ["Benali", "بنعلي"], ["Haddadi", "حدادي"], ["Mejri", "المجري"], ["Chaabane", "شعبان"],
    ],
  },
};

/** Share of families from each background at the demo school. */
export const CULTURE_MIX: [Culture, number][] = [
  ["gulf", 34],
  ["southAsia", 20],
  ["levant", 14],
  ["egypt", 10],
  ["western", 12],
  ["philippines", 5],
  ["maghreb", 5],
];

export const EMPLOYERS = [
  "Qatar Airways", "QatarEnergy", "Hamad Medical Corporation", "Ministry of Interior", "QNB", "Ooredoo", "Sidra Medicine", "Qatar Foundation",
  "Ashghal", "Kahramaa", "Qatar University", "Ministry of Education", "HBK Contracting", "Al Jazeera", "Aspire Zone", "Hamad International Airport",
  "Mannai Corporation", "Commercial Bank", "Qatar Rail", "Primary Health Care Corporation", "Msheireb Properties", "Self-employed",
];

export const MEDICAL_NOTES = [
  "Peanut allergy. EpiPen kept in the clinic.",
  "Asthma. Inhaler in school bag; avoid dusty activities.",
  "Type 1 diabetes. Snacks allowed in class; glucose checks at 10:00 with the nurse.",
  "Wears glasses. Please seat near the front.",
  "Lactose intolerant.",
  "G6PD deficiency. No fava beans; check medicines with the nurse.",
  "Eczema. Cream applied before PE.",
  "Mild hearing loss in the left ear. Seat on the right side.",
];

export const BLOOD_GROUPS = ["O+", "O+", "O+", "A+", "A+", "B+", "B+", "AB+", "O-", "A-"];
