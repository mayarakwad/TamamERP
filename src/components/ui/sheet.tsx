"use client";

import { Dialog } from "radix-ui";
import { Sparkles, X } from "lucide-react";
import { useFlow } from "@/components/flow/flow-provider";
import { useI18n } from "@/components/providers";
import { cn } from "@/lib/cn";

/** A panel that slides in from the inline-end edge (right in English, left in Arabic). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const { t, dir } = useI18n();
  const flow = useFlow();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[1px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <Dialog.Content
          dir={dir}
          className={cn(
            "fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-line bg-surface shadow-lift outline-none",
            "data-[state=open]:animate-[sheet-in_260ms_var(--ease-out-soft)]",
            wide ? "max-w-2xl" : "max-w-lg",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {flow?.available && (
                <button type="button" onClick={() => flow.open()} className="grid size-8 place-items-center rounded-lg text-accent hover:bg-accent-soft" aria-label={t("flow.askAboutForm")} title={t("flow.askAboutForm")}>
                  <Sparkles className="size-4" />
                </button>
              )}
              <Dialog.Close className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken" aria-label={t("common.close")}>
                <X className="size-4" />
              </Dialog.Close>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
