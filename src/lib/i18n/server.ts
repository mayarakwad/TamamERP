import "server-only";
import { getRequestPrefs } from "../auth/dal";
import { createFormatter } from "../format";
import { createT, dirOf } from "./index";

/** Translator + formatter for the current request (Server Components and actions). */
export async function getI18n(scope?: { currency?: string; timeZone?: string }) {
  const prefs = await getRequestPrefs();
  const locale = prefs.locale;
  return {
    locale,
    dir: dirOf(locale),
    t: createT(locale),
    fmt: createFormatter({ locale, digits: prefs.digits, currency: scope?.currency, timeZone: scope?.timeZone }),
    prefs,
  };
}
