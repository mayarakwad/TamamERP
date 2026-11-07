// Amounts in words for invoices and payslips ("tafqeet"), in English and Arabic.
// Qatari riyals and dirhams (1 QAR = 100 dirhams).

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function enBelowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

export function numberToEnglish(n: number): string {
  if (n === 0) return "Zero";
  const scales = ["", "Thousand", "Million", "Billion"];
  const parts: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${enBelowThousand(chunk)}${scales[i] ? ` ${scales[i]}` : ""}`);
  }
  return parts.join(" ");
}

// ── Arabic ──
// Numbers are written in the masculine form that goes with ريال and درهم.

const AR_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
const AR_TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

function arBelowThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(AR_HUNDREDS[h]);
  if (rest) {
    if (rest <= 10) parts.push(AR_ONES[rest]);
    else if (rest < 20) parts.push(AR_TEENS[rest - 10]);
    else {
      const u = rest % 10;
      const t = Math.floor(rest / 10);
      parts.push(u ? `${AR_ONES[u]} و${AR_TENS[t]}` : AR_TENS[t]);
    }
  }
  return parts.join(" و");
}

/** The counted noun's form after a number: 1 / 2 / 3–10 / 11–99 / 100+ */
type Forms = [one: string, two: string, few: string, many: string, hundred: string];

function counted(n: number, f: Forms): { word: string; number: boolean } {
  const last2 = n % 100;
  if (n === 1) return { word: f[0], number: false };
  if (n === 2) return { word: f[1], number: false };
  if (last2 >= 3 && last2 <= 10) return { word: f[2], number: true };
  if (last2 >= 11 && last2 <= 99) return { word: f[3], number: true };
  // 100, 200, 1000, 1001, 1002 … take the singular genitive
  if (last2 === 1 || last2 === 2) return { word: f[4], number: true };
  return { word: f[4], number: true };
}

const THOUSAND: Forms = ["ألف", "ألفان", "آلاف", "ألفاً", "ألف"];
const MILLION: Forms = ["مليون", "مليونان", "ملايين", "مليوناً", "مليون"];
const BILLION: Forms = ["مليار", "ملياران", "مليارات", "ملياراً", "مليار"];

export function numberToArabic(n: number): string {
  if (n === 0) return "صفر";
  const groups: string[] = [];
  const scales = [null, THOUSAND, MILLION, BILLION];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (!chunk) continue;
    const scale = scales[i];
    if (!scale) {
      groups.unshift(arBelowThousand(chunk));
      continue;
    }
    const c = counted(chunk, scale);
    groups.unshift(chunk <= 2 ? c.word : `${arBelowThousand(chunk)} ${c.word}`);
  }
  return groups.join(" و");
}

const RIYAL: Forms = ["ريال قطري", "ريالان قطريان", "ريالات قطرية", "ريالاً قطرياً", "ريال قطري"];
const DIRHAM: Forms = ["درهم", "درهمان", "دراهم", "درهماً", "درهم"];

function arCount(n: number, f: Forms) {
  const c = counted(n, f);
  if (n === 1) return `${f[0]} واحد`;
  if (n === 2) return c.word;
  return `${numberToArabic(n)} ${c.word}`;
}

/** "Qatari Riyals One Thousand Two Hundred and Fifty Dirhams Only" / "فقط ألف ومئتان ريال قطري و… لا غير" */
export function amountInWords(dirhams: number, locale: "en" | "ar", currency = "QAR"): string {
  const negative = dirhams < 0;
  const abs = Math.abs(Math.round(dirhams));
  const riyals = Math.floor(abs / 100);
  const fils = abs % 100;
  if (locale === "ar") {
    const parts: string[] = [];
    if (riyals || !fils) parts.push(currency === "QAR" ? arCount(riyals, RIYAL) : `${numberToArabic(riyals)} ${currency}`);
    if (fils) parts.push(arCount(fils, DIRHAM));
    return `${negative ? "سالب " : ""}فقط ${parts.join(" و")} لا غير`;
  }
  const name = currency === "QAR" ? "Qatari Riyals" : currency;
  const main = `${name} ${numberToEnglish(riyals)}`;
  return `${negative ? "Minus " : ""}${main}${fils ? ` and ${numberToEnglish(fils)} Dirhams` : ""} Only`;
}
