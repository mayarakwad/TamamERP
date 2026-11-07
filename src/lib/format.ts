// Formatting for numbers, money and dates. Pure functions: the same output on
// the server and in the browser, because the time zone is always the
// workspace's (Asia/Qatar by default) rather than the machine's.

export type Locale = "en" | "ar";
export type Digits = "latn" | "arab";

export interface FormatConfig {
  locale: Locale;
  digits: Digits;
  timeZone?: string;
  currency?: string;
}

const DEFAULT_TZ = "Asia/Qatar";

function tag(cfg: FormatConfig, calendar?: string): string {
  const base = cfg.locale === "ar" ? "ar-QA" : "en-GB";
  const ext = [`nu-${cfg.locale === "ar" ? cfg.digits : "latn"}`];
  if (calendar) ext.unshift(`ca-${calendar}`);
  return `${base}-u-${ext.join("-")}`;
}

// Intl objects are relatively expensive; cache them by their options.
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(opts)}`;
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}
function df(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(opts)}`;
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

export function createFormatter(cfg: FormatConfig) {
  const timeZone = cfg.timeZone ?? DEFAULT_TZ;
  const currency = cfg.currency ?? "QAR";
  const loc = tag(cfg);

  return {
    config: cfg,

    number(value: number, opts: Intl.NumberFormatOptions = {}) {
      return nf(loc, { maximumFractionDigits: 2, ...opts }).format(value);
    },

    percent(value: number, fractionDigits = 0) {
      return nf(loc, {
        style: "percent",
        maximumFractionDigits: fractionDigits,
      }).format(value);
    },

    /** Amount in dirhams → "QAR 1,250.00" / "١٬٢٥٠٫٠٠ ر.ق." */
    money(dirhams: number, opts: { decimals?: boolean | "auto"; compact?: boolean } = {}) {
      const riyals = dirhams / 100;
      const decimals =
        opts.decimals === "auto" || opts.decimals === undefined
          ? !Number.isInteger(riyals)
          : opts.decimals;
      return nf(loc, {
        style: "currency",
        currency,
        currencyDisplay: cfg.locale === "en" ? "code" : "symbol",
        minimumFractionDigits: decimals ? 2 : 0,
        maximumFractionDigits: decimals ? 2 : 0,
        notation: opts.compact ? "compact" : "standard",
      }).format(riyals);
    },

    /** Gregorian date: "7 Nov 2026" */
    date(d: Date | string, style: "short" | "medium" | "long" | "full" = "medium") {
      const opts: Intl.DateTimeFormatOptions =
        style === "short"
          ? { day: "2-digit", month: "2-digit", year: "numeric" }
          : style === "medium"
            ? { day: "numeric", month: "short", year: "numeric" }
            : style === "long"
              ? { day: "numeric", month: "long", year: "numeric" }
              : { weekday: "long", day: "numeric", month: "long", year: "numeric" };
      return df(loc, { ...opts, timeZone }).format(new Date(d));
    },

    /** Hijri (Umm al-Qura) date: "16 Jumada I 1448 AH" */
    hijri(d: Date | string, style: "medium" | "long" = "long") {
      return df(tag(cfg, "islamic-umalqura"), {
        day: "numeric",
        month: style === "long" ? "long" : "short",
        year: "numeric",
        timeZone,
      }).format(new Date(d));
    },

    time(d: Date | string) {
      return df(loc, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(d));
    },

    dateTime(d: Date | string) {
      return df(loc, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }).format(new Date(d));
    },

    monthName(d: Date | string, style: "long" | "short" = "long") {
      return df(loc, { month: style, year: "numeric", timeZone }).format(new Date(d));
    },

    monthShort(d: Date | string) {
      return df(loc, { month: "short", timeZone }).format(new Date(d));
    },

    weekday(d: Date | string) {
      return df(loc, { weekday: "long", timeZone }).format(new Date(d));
    },

    /** "3 hours ago" / "قبل ٣ ساعات" relative to `now`. */
    relative(d: Date | string, now: Date) {
      const diff = (new Date(d).getTime() - now.getTime()) / 1000;
      const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
      const abs = Math.abs(diff);
      if (abs < 60) return rtf.format(Math.round(diff), "second");
      if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
      if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
      if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
      return rtf.format(Math.round(diff / (86400 * 365)), "year");
    },
  };
}

export type Formatter = ReturnType<typeof createFormatter>;

/** Hour of day (0-23) in the workspace time zone, for greetings. */
export function hourIn(timeZone: string, d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(d),
  );
}

/** "2026-11" for the month containing `d` in the given time zone. */
export function monthKey(d: Date, timeZone = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** Start of the month (as a UTC instant) for a "YYYY-MM" key in Qatar time (UTC+3, no DST). */
export function monthStart(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, -3));
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
