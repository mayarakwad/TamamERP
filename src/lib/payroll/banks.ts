// Banks in Qatar as the Wage Protection System names them (the "bank short
// name" in a salary file), with the 4-letter code their IBANs carry where known.
// Source: WPS file format specification, Annex 2.

export const WPS_BANKS: { code: string; name: string; nameAr: string; iban?: string }[] = [
  { code: "QNB", name: "Qatar National Bank", nameAr: "بنك قطر الوطني", iban: "QNBA" },
  { code: "CBQ", name: "Commercial Bank of Qatar", nameAr: "البنك التجاري القطري", iban: "CBQA" },
  { code: "DBQ", name: "Doha Bank", nameAr: "بنك الدوحة", iban: "DOHB" },
  { code: "QIB", name: "Qatar Islamic Bank", nameAr: "مصرف قطر الإسلامي", iban: "QISB" },
  { code: "IIB", name: "Qatar International Islamic Bank", nameAr: "بنك قطر الدولي الإسلامي", iban: "QIIB" },
  { code: "MAR", name: "Masraf Al Rayan", nameAr: "مصرف الريان", iban: "MAFR" },
  { code: "ABQ", name: "Ahli Bank", nameAr: "البنك الأهلي", iban: "ABQQ" },
  { code: "BBQ", name: "Dukhan Bank (formerly Barwa Bank)", nameAr: "بنك دخان (بنك بروة سابقاً)", iban: "BRWA" },
  { code: "HSB", name: "HSBC Bank Middle East", nameAr: "بنك HSBC الشرق الأوسط", iban: "BBME" },
  { code: "SCB", name: "Standard Chartered Bank", nameAr: "بنك ستاندرد تشارترد", iban: "SCBL" },
  { code: "ARB", name: "Arab Bank", nameAr: "البنك العربي", iban: "ARAB" },
  { code: "MSQ", name: "Mashreq Bank", nameAr: "بنك المشرق", iban: "MSHQ" },
  { code: "UBL", name: "United Bank Ltd", nameAr: "يونايتد بنك المحدود" },
  { code: "BNP", name: "BNP Paribas", nameAr: "بي إن بي باريبا" },
  { code: "QDB", name: "Qatar Development Bank", nameAr: "بنك قطر للتنمية" },
  { code: "IBQ", name: "International Bank of Qatar", nameAr: "بنك قطر الدولي" },
  { code: "KCB", name: "Al Khaliji Bank", nameAr: "بنك الخليجي" },
];

export const WPS_BANK_CODES = new Set(WPS_BANKS.map((b) => b.code));

/** Guess the WPS bank from a Qatari IBAN ("QA.. QNBA ..."). */
export function bankFromIban(iban: string): string | null {
  const code = iban.replace(/\s/g, "").toUpperCase().slice(4, 8);
  return WPS_BANKS.find((b) => b.iban === code)?.code ?? null;
}

/** ISO 13616 check: country code, check digits, mod-97 = 1. Qatari IBANs are 29 characters. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("QA") && iban.length !== 29) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/** Build a valid IBAN from country + bank code + account (used for demo data). */
export function makeIban(country: string, bban: string): string {
  const rearranged = bban.toUpperCase() + country.toUpperCase() + "00";
  let rem = 0;
  for (const ch of rearranged) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return `${country.toUpperCase()}${String(98 - rem).padStart(2, "0")}${bban.toUpperCase()}`;
}

export function formatIban(raw: string) {
  return raw.replace(/\s/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}
