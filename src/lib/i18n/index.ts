import { en, type Messages } from "./en";
import { ar } from "./ar";
import type { Locale } from "../format";

export type { Messages, Locale };

export const dictionaries: Record<Locale, Messages> = { en, ar };

// "nav.dashboard" | "auth.signIn" | …
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<typeof en>;

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function createT(locale: Locale): TFunction {
  const dict = dictionaries[locale] ?? en;
  return (key, vars) => {
    let node: unknown = dict;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)?.[part];
    let text = typeof node === "string" ? node : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    }
    return text;
  };
}

/** Pick the right language field from a bilingual record. */
export function pick(locale: Locale, en: string, ar?: string | null): string {
  return locale === "ar" && ar ? ar : en;
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
