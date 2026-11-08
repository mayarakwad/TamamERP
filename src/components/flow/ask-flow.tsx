"use client";

import { Sparkles } from "lucide-react";
import { useI18n } from "@/components/providers";
import type { MessageKey } from "@/lib/i18n";
import { useFlow } from "./flow-provider";

/** A small "Ask Flow" button that opens the panel with a question. Hidden when Flow isn't available. */
export function AskFlow({ prompt, label = "flow.open" }: { prompt: MessageKey; label?: MessageKey }) {
  const { t } = useI18n();
  const flow = useFlow();
  if (!flow?.available) return null;
  return (
    <button type="button" onClick={() => flow.open(t(prompt))} className="no-print inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent transition hover:bg-accent-soft">
      <Sparkles className="size-3.5" /> {t(label)}
    </button>
  );
}
