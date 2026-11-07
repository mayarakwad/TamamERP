"use client";

import { motion } from "motion/react";
import { Building2, GraduationCap, Home, Check } from "lucide-react";
import { WallpaperArt } from "@/components/appearance/wallpapers";
import { useI18n } from "@/components/providers";

// The decorative half of the sign-in page: the three worlds Tamam serves,
// floating over a mashrabiya pattern.
export function Showcase() {
  const { t, fmt, locale } = useI18n();
  const cards = [
    {
      icon: Home,
      title: t("orgTypes.home"),
      line: locale === "ar" ? "ماريا · البقالة، كارفور" : "Maria · Groceries, Carrefour",
      value: fmt.money(21125, { decimals: true }),
      status: locale === "ar" ? "تمت الموافقة" : "Approved",
    },
    {
      icon: GraduationCap,
      title: t("orgTypes.school"),
      line: locale === "ar" ? "الحضور اليوم، فرع لوسيل" : "Attendance today, Lusail campus",
      value: fmt.percent(0.964, 1),
      status: locale === "ar" ? "٣ فروع" : "3 campuses",
    },
    {
      icon: Building2,
      title: t("orgTypes.business"),
      line: locale === "ar" ? "ملف حماية الأجور لشهر أكتوبر" : "October WPS salary file",
      value: fmt.money(18642000),
      status: locale === "ar" ? "جاهز" : "Ready",
    },
  ];
  return (
    <aside className="relative hidden overflow-hidden lg:block" aria-hidden>
      <div className="absolute inset-0">
        <WallpaperArt id="mashrabiya" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklch,var(--accent)_25%,transparent)] to-transparent" />
      <div className="relative flex h-full flex-col justify-center gap-5 px-16">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-md text-4xl leading-tight font-semibold tracking-tight text-fg"
        >
          {t("app.tagline")}
        </motion.p>
        <div className="mt-4 flex max-w-md flex-col gap-3">
          {cards.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, x: locale === "ar" ? -24 : 24 }}
              animate={{ opacity: 1, x: 0, y: [0, -4, 0] }}
              transition={{
                opacity: { delay: 0.15 + i * 0.12, duration: 0.5 },
                x: { delay: 0.15 + i * 0.12, type: "spring", stiffness: 160, damping: 20 },
                y: { delay: 1 + i * 0.7, duration: 5, repeat: Infinity, ease: "easeInOut" },
              }}
              className="flex items-center gap-4 rounded-2xl border border-line bg-glass p-4 shadow-lift backdrop-blur-xl"
              style={{ marginInlineStart: i * 28 }}
            >
              <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                <c.icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted">{c.title}</p>
                <p className="truncate text-sm text-fg">{c.line}</p>
              </div>
              <div className="text-end">
                <p className="tabular text-sm font-semibold text-fg">{c.value}</p>
                <p className="inline-flex items-center gap-1 text-xs text-success">
                  <Check className="size-3" />
                  {c.status}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </aside>
  );
}
