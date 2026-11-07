// Theme catalogue. The colour tokens themselves live in src/app/themes.css so
// the browser can switch themes without JavaScript; this file holds the
// metadata the UI needs (names, preview swatches).

export const THEMES = [
  {
    id: "pearl",
    name: "Pearl",
    nameAr: "لؤلؤ",
    swatch: ["#F7F4F1", "#FFFFFF", "#8A1538"],
    swatchDark: ["#141113", "#1D191B", "#E26A8A"],
  },
  {
    id: "corniche",
    name: "Corniche",
    nameAr: "الكورنيش",
    swatch: ["#F3F7F9", "#FFFFFF", "#0B6E8A"],
    swatchDark: ["#0B1419", "#111D24", "#38B2D3"],
  },
  {
    id: "oasis",
    name: "Oasis",
    nameAr: "واحة",
    swatch: ["#F4F7F2", "#FFFFFF", "#1F7A4D"],
    swatchDark: ["#0E1510", "#141E17", "#4CC38A"],
  },
  {
    id: "dunes",
    name: "Dunes",
    nameAr: "كثبان",
    swatch: ["#FAF5EE", "#FFFDF9", "#B5541C"],
    swatchDark: ["#17120D", "#201912", "#E58A4E"],
  },
  {
    id: "majlis",
    name: "Majlis",
    nameAr: "مجلس",
    swatch: ["#F5F4FA", "#FFFFFF", "#4B3FA8"],
    swatchDark: ["#100E1C", "#171528", "#8C80F0"],
  },
  {
    id: "lantern",
    name: "Lantern",
    nameAr: "فانوس",
    swatch: ["#FBF8F1", "#FFFFFF", "#8F5D00"],
    swatchDark: ["#15120B", "#1E1A10", "#F0B43C"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const THEME_IDS = THEMES.map((t) => t.id) as [ThemeId, ...ThemeId[]];

/** Pick black or white text for a background colour (WCAG relative luminance). */
export function readableOn(hex: string): "#FFFFFF" | "#111111" {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against white vs. near-black; choose the larger.
  const vsWhite = 1.05 / (L + 0.05);
  const vsBlack = (L + 0.05) / 0.0566;
  return vsWhite >= vsBlack ? "#FFFFFF" : "#111111";
}
