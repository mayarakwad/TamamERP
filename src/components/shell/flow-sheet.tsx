"use client";

import { Dialog } from "radix-ui";
import { motion } from "motion/react";
import { MessageSquareText, MousePointerClick, PenLine, Sparkles, X, KeyRound } from "lucide-react";
import { useI18n } from "@/components/providers";

// Flow's side panel. The assistant itself arrives in stage 4; until then the
// panel explains what it will do, which is also what it shows when an
// organization hasn't connected an AI key.
export function FlowSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, dir, locale } = useI18n();
  const ar = locale === "ar";
  const points = [
    { icon: MessageSquareText, text: ar ? "يجيب عن أسئلة حول بياناتك: «كم صرفنا على البقالة في أكتوبر؟»" : "Answers questions about your data: “How much did we spend on groceries in October?”" },
    { icon: PenLine, text: ar ? "يكتب مسودات الرسائل والتقارير ويشرح الأرقام." : "Drafts emails and reports, and explains the numbers." },
    { icon: MousePointerClick, text: ar ? "أي تغيير على البيانات يظهر كاقتراح تؤكده بنقرة واحدة." : "Anything that changes data appears as a proposal you confirm with one click." },
    { icon: KeyRound, text: ar ? "يعمل بمفتاح الذكاء الاصطناعي الخاص بمؤسستك، مشفّراً على الخادم." : "Runs on your organization's own AI key, stored encrypted on the server." },
  ];
  const side = dir === "rtl" ? -1 : 1;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <Dialog.Content dir={dir} asChild>
          <motion.div
            initial={{ x: 40 * side, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col border-s border-line bg-surface shadow-lift"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <Dialog.Title className="flex items-center gap-2.5 font-semibold">
                <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-[color-mix(in_oklch,var(--accent)_60%,#f2c060)] text-accent-fg">
                  <Sparkles className="size-4" />
                </span>
                Flow
              </Dialog.Title>
              <Dialog.Close className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken" aria-label={t("common.close")}>
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-lg font-semibold">{t("common.comingSoon", { stage: 4 })}</p>
              <Dialog.Description className="mt-1 text-sm text-muted">
                {ar ? "فلو مساعدك الذكي داخل تمام. إليك ما سيفعله:" : "Flow is your AI assistant inside Tamam. Here's what it will do:"}
              </Dialog.Description>
              <ul className="mt-6 space-y-4">
                {points.map((p, i) => (
                  <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i + 0.1 }} className="flex gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <p.icon className="size-4" />
                    </span>
                    <p className="pt-1.5 text-sm">{p.text}</p>
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
