// Text normalization for search: case, Latin accents, Arabic letter forms,
// diacritics (tashkeel), tatweel and Arabic-Indic digits all fold together.

const ARABIC_DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;

export function normalizeSearch(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // Latin accents
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a query into normalized terms (all must match). */
export function searchTerms(query: string): string[] {
  return normalizeSearch(query).split(" ").filter((t) => t.length > 0).slice(0, 6);
}
