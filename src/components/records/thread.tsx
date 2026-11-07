"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, Pencil, RotateCcw, Send, XCircle, Paperclip, CircleDollarSign } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { pick, type MessageKey } from "@/lib/i18n";
import { addComment } from "@/app/actions/comments";
import type { ThreadItem } from "@/lib/thread";

function eventIcon(action?: string) {
  if (!action) return Circle;
  if (action.endsWith("approved") || action.endsWith("recorded")) return CheckCircle2;
  if (action.endsWith("rejected")) return XCircle;
  if (action.endsWith("reimbursed")) return CircleDollarSign;
  if (action.endsWith("reopened")) return RotateCcw;
  if (action.endsWith("updated")) return Pencil;
  if (action.startsWith("attachment")) return Paperclip;
  return Circle;
}

/** Comments and history for a record, with a composer. Used for approval threads. */
export function Thread({ slug, entityType, entityId, items, now, viewerId }: { slug: string; entityType: string; entityId: string; items: ThreadItem[]; now: string; viewerId: string }) {
  const { t, fmt, locale } = useI18n();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const res = await addComment(slug, entityType, entityId, body);
      if (res.ok) setBody("");
      else toast.error(t(res.error as MessageKey));
    });

  return (
    <Card className="flex flex-col">
      <h2 className="border-b border-line px-[var(--pad)] py-3 text-sm font-semibold">{t("thread.title")}</h2>
      <ol className="flex-1 space-y-4 px-[var(--pad)] py-4">
        {items.length === 0 && <li className="text-sm text-muted">{t("thread.empty")}</li>}
        {items.map((it, i) =>
          it.kind === "comment" ? (
            <motion.li key={it.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="flex gap-3">
              <Avatar name={it.user?.name ?? "?"} color={it.user?.avatarColor} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  <span className="font-medium text-fg">{it.user?.id === viewerId ? t("thread.you") : pick(locale, it.user?.name ?? "", it.user?.nameAr)}</span> · {fmt.relative(it.at, new Date(now))}
                </p>
                <p className="mt-1 rounded-2xl rounded-ss-sm bg-sunken px-3.5 py-2 text-sm whitespace-pre-wrap">{it.body}</p>
              </div>
            </motion.li>
          ) : (
            <li key={it.id} className="flex items-center gap-3 ps-1.5 text-xs text-muted">
              {(() => {
                const Icon = eventIcon(it.action);
                return <Icon className="size-4 shrink-0 text-subtle" />;
              })()}
              <span className="min-w-0">
                <span className="font-medium text-fg">{pick(locale, it.user?.name ?? "", it.user?.nameAr)}</span>
                {locale === "ar" ? " · " : " "}
                {pick(locale, it.body, it.bodyAr)} · {fmt.relative(it.at, new Date(now))}
              </span>
            </li>
          ),
        )}
      </ol>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) send();
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) send();
          }}
          rows={1}
          placeholder={t("thread.placeholder")}
          className="min-h-10 resize-none"
        />
        <Button type="submit" size="icon" disabled={pending || !body.trim()} aria-label={t("thread.send")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 rtl:-scale-x-100" />}
        </Button>
      </form>
    </Card>
  );
}
