"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { MotionConfig } from "motion/react";
import type { Prefs } from "@/lib/prefs";
import { applyPrefsToDocument } from "@/lib/prefs-dom";
import { createT, dirOf, type TFunction } from "@/lib/i18n";
import { createFormatter, type Formatter, type Locale } from "@/lib/format";
import { savePrefs } from "@/app/actions/prefs";

interface PrefsContextValue {
  prefs: Prefs;
  /** Apply instantly, then save to the account in the background. */
  update: (patch: Partial<Prefs>) => void;
  saving: boolean;
}

interface I18nContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: TFunction;
  fmt: Formatter;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);
const I18nContext = createContext<I18nContextValue | null>(null);

export function AppProviders({ initialPrefs, children }: { initialPrefs: Prefs; children: React.ReactNode }) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, startSaving] = useTransition();
  const pending = useRef<Partial<Prefs>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the server sends fresh preferences (e.g. after signing in elsewhere), adopt them.
  const serverKey = JSON.stringify(initialPrefs);
  const [lastServerKey, setLastServerKey] = useState(serverKey);
  if (serverKey !== lastServerKey) {
    setLastServerKey(serverKey);
    setPrefs(initialPrefs);
  }

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      applyPrefsToDocument(next);
      return next;
    });
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    // Sliders fire many changes; save once they settle. Language saves immediately.
    const delay = "locale" in patch ? 0 : 450;
    timer.current = setTimeout(() => {
      const toSave = pending.current;
      pending.current = {};
      startSaving(async () => {
        await savePrefs(toSave);
      });
    }, delay);
  }, []);

  // Follow the device's light/dark setting while in "system" mode.
  useEffect(() => {
    if (prefs.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPrefsToDocument(prefs);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs]);

  const i18n = useMemo<I18nContextValue>(
    () => ({
      locale: prefs.locale,
      dir: dirOf(prefs.locale),
      t: createT(prefs.locale),
      fmt: createFormatter({ locale: prefs.locale, digits: prefs.digits }),
    }),
    [prefs.locale, prefs.digits],
  );

  const reducedMotion = prefs.motion === "reduced" ? "always" : prefs.motion === "full" ? "never" : "user";

  return (
    <PrefsContext value={{ prefs, update, saving }}>
      <I18nContext value={i18n}>
        <MotionConfig reducedMotion={reducedMotion} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
          {children}
        </MotionConfig>
      </I18nContext>
    </PrefsContext>
  );
}

export function usePrefs() {
  const ctx = use(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside AppProviders");
  return ctx;
}

export function useI18n() {
  const ctx = use(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside AppProviders");
  return ctx;
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True when animations should be skipped (device setting or personal choice). */
export function useReducedMotion(): boolean {
  const { prefs } = usePrefs();
  const deviceReduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
  if (prefs.motion === "reduced") return true;
  if (prefs.motion === "full") return false;
  return deviceReduced;
}
