// Choices offered by the setup wizard. Shared by the form and its validation.

/** Two-decimal currencies only: money is stored in hundredths. */
export const SETUP_CURRENCIES = ["QAR", "SAR", "AED", "USD", "EUR", "GBP", "EGP"] as const;
export type SetupCurrency = (typeof SETUP_CURRENCIES)[number];

/** Gulf and nearby zones first; the full list follows in the picker. */
export const PREFERRED_TIMEZONES = [
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Africa/Cairo",
  "Asia/Amman",
  "Asia/Beirut",
  "Europe/London",
];

export const BRAND_COLOURS = ["#8A1538", "#0B6E8A", "#1F7A4D", "#B5541C", "#4B3FA8", "#8F5D00", "#BE185D", "#334155"];
