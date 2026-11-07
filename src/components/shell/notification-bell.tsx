"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CheckCheck, CheckCircle2, Clock, MessageSquare, ShieldAlert, UserPlus, XCircle, CalendarClock } from "lucide-react";
import { useI18n } from "@/components/providers";
import { pick } from "@/lib/i18n";
import { cn } from "@/lib/cn";

interface Item {
  id: string;
  kind: string;
  title: string;
  titleAr: string | null;
  body: string | null;
  bodyAr: string | null;
  href: string | null;
  read: boolean;
  at: string;
}

function kindIcon(kind: string) {
  if (kind.endsWith("approved") || kind.endsWith("reimbursed")) return <CheckCircle2 className="size-4 text-success" />;
  if (kind.endsWith("rejected")) return <XCircle className="size-4 text-danger" />;
  if (kind === "comment") return <MessageSquare className="size-4 text-info" />;
  if (kind === "bill.due") return <CalendarClock className="size-4 text-accent" />;
  if (kind === "warranty.ending") return <ShieldAlert className="size-4 text-warning" />;
  if (kind === "member.joined") return <UserPlus className="size-4 text-accent" />;
  return <Clock className="size-4 text-muted" />;
}

/** Bell with unread count; refreshes every minute and when the tab regains focus. */
export function NotificationBell({ slug }: { slug: string }) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<{ unread: number; items: Item[] }>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/w/${slug}/notifications`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [slug]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const mark = async (body: object) => {
    await fetch(`/api/w/${slug}/notifications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    void load();
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => (setOpen(o), o && load())}>
      <Popover.Trigger className="relative grid size-9 place-items-center rounded-xl text-muted transition hover:bg-sunken hover:text-fg" aria-label={`${t("notifications.title")}${data.unread ? ` (${data.unread})` : ""}`}>
        <Bell className="size-[1.1rem]" />
        <AnimatePresence>
          {data.unread > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute end-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.6rem] leading-4 font-semibold text-white">
              {data.unread > 9 ? "9+" : fmt.number(data.unread)}
            </motion.span>
          )}
        </AnimatePresence>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content dir={dir} align="end" sideOffset={8} className="z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-lift data-[state=open]:animate-[pop-in_160ms_ease-out]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">{t("notifications.title")}</p>
            {data.unread > 0 && (
              <button type="button" onClick={() => mark({ all: true })} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                <CheckCheck className="size-3.5" /> {t("notifications.markAllRead")}
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {data.items.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted">{t("notifications.empty")}</li>}
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!n.read) void mark({ ids: [n.id] });
                    setOpen(false);
                    if (n.href) router.push(n.href);
                  }}
                  className={cn("flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-sunken", !n.read && "bg-accent-soft/40")}
                >
                  <span className="mt-0.5">{kindIcon(n.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.read && "font-medium")}>{pick(locale, n.title, n.titleAr)}</span>
                    {n.body && <span className="block truncate text-xs text-muted">{pick(locale, n.body, n.bodyAr)}</span>}
                    <span className="block text-xs text-subtle">{fmt.relative(n.at, new Date())}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
