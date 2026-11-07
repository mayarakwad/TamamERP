"use client";

import { Dialog as D } from "radix-ui";
import { useI18n } from "@/components/providers";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { dir } = useI18n();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content
          dir={dir}
          className={cn("fixed inset-x-4 top-[14vh] z-50 mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 shadow-lift outline-none data-[state=open]:animate-[pop-in_180ms_var(--ease-out-soft)]", className)}
        >
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
