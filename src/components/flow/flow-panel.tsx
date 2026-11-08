"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileText,
  History,
  KeyRound,
  Loader2,
  MoreHorizontal,
  PenLine,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useI18n } from "@/components/providers";
import { celebrate } from "@/components/motion/celebrate";
import { cn } from "@/lib/cn";
import { hourIn } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { FLOW_AVATARS, FLOW_TONES, flowDisplayName, type FlowAvatar as AvatarId, type FlowTone } from "@/lib/flow/models";
import type { ChatItem, ConversationSummary, ProposalView, ToolUi } from "@/lib/flow/types";
import { confirmProposal, deleteConversation, dismissProposal, listConversations, openConversation, savePersonalFlow } from "@/app/actions/flow";
import type { FlowShell } from "@/components/shell/types";
import type { OrgType, Permission, Role } from "@/lib/rbac";
import { FlowAvatar } from "./avatar";
import { FlowMarkdown } from "./markdown";
import { useFlow } from "./flow-provider";
import { fillForm, snapshotForm } from "./page-context";

type View = "chat" | "history" | "personal";

function useReducedMotion() {
  const [reduced] = useState(() => typeof window !== "undefined" && (document.documentElement.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches));
  return reduced;
}

export function FlowPanel({ slug, flow, orgType, role, extras, firstName, timeZone }: { slug: string; flow: FlowShell; orgType: OrgType; role: Role; extras: Permission[]; firstName: string; timeZone: string }) {
  const { dir, locale } = useI18n();
  const f = useFlow();
  const [view, setView] = useState<View>("chat");
  const [persona, setPersona] = useState(flow.personal);
  const name = flowDisplayName(persona.name || flow.defaults.name, locale);
  const avatar = persona.avatar ?? flow.defaults.avatar;

  // Ctrl/⌘ J opens and closes Flow from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (f?.isOpen) f.close();
        else f?.open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [f]);

  if (!f) return null;
  const side = dir === "rtl" ? -1 : 1;

  return (
    <Dialog.Root open={f.isOpen} onOpenChange={(o) => (o ? f.open() : f.close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/10 data-[state=open]:animate-[fade-in_150ms_ease-out] dark:bg-black/30" />
        <Dialog.Content dir={dir} data-flow-panel="" aria-describedby={undefined} asChild onOpenAutoFocus={(e) => e.preventDefault()}>
          <motion.div
            initial={{ x: 32 * side, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="fixed inset-y-0 end-0 z-[60] flex w-full flex-col border-s border-line bg-surface shadow-lift outline-none sm:max-w-[440px]"
          >
            <Header
              name={name}
              avatar={avatar}
              busy={f.status !== "idle"}
              view={view}
              setView={setView}
              canConfigure={flow.canConfigure}
              slug={slug}
              hasChat={f.items.length > 0}
              onNew={() => {
                f.reset();
                setView("chat");
              }}
            />
            {view === "history" ? (
              <HistoryView slug={slug} onOpen={() => setView("chat")} />
            ) : view === "personal" ? (
              <PersonalView flow={flow} persona={persona} onSaved={(p) => setPersona(p)} onBack={() => setView("chat")} />
            ) : flow.state !== "ok" ? (
              <Unavailable state={flow.state} canConfigure={flow.canConfigure} slug={slug} />
            ) : (
              <ChatView slug={slug} name={name} avatar={avatar} orgType={orgType} role={role} extras={extras} firstName={firstName} kids={flow.children} timeZone={timeZone} />
            )}
            <Dialog.Title className="sr-only">{name}</Dialog.Title>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Header({ name, avatar, busy, view, setView, canConfigure, slug, hasChat, onNew }: { name: string; avatar: AvatarId; busy: boolean; view: View; setView: (v: View) => void; canConfigure: boolean; slug: string; hasChat: boolean; onNew: () => void }) {
  const { t, dir } = useI18n();
  const f = useFlow()!;
  const Back = dir === "rtl" ? ChevronRight : ChevronLeft;
  const btn = "grid size-8 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-fg";
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
      {view !== "chat" ? (
        <button type="button" className={btn} onClick={() => setView("chat")} aria-label={t("flow.back")}>
          <Back className="size-4" />
        </button>
      ) : (
        <FlowAvatar avatar={avatar} busy={busy} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{view === "history" ? t("flow.history") : view === "personal" ? t("flow.personalTitle") : name}</div>
        {view === "chat" && f.title && <div className="truncate text-xs text-muted">{f.title}</div>}
      </div>
      {view === "chat" && (
        <>
          {hasChat && (
            <button type="button" className={btn} onClick={onNew} aria-label={t("flow.newChat")} title={t("flow.newChat")}>
              <PenLine className="size-4" />
            </button>
          )}
          <button type="button" className={btn} onClick={() => setView("history")} aria-label={t("flow.history")} title={t("flow.history")}>
            <History className="size-4" />
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className={btn} aria-label={t("flow.more")}>
              <MoreHorizontal className="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="z-[70] min-w-48 rounded-xl border border-line bg-surface p-1 shadow-lift">
                <DropdownMenu.Item onSelect={() => setView("personal")} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-sunken">
                  <SlidersHorizontal className="size-4 text-muted" /> {t("flow.personalize")}
                </DropdownMenu.Item>
                {canConfigure && (
                  <DropdownMenu.Item asChild className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-sunken">
                    <Link href={`/w/${slug}/settings/flow`} onClick={() => f.close()}>
                      <Settings2 className="size-4 text-muted" /> {t("flow.settings")}
                    </Link>
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>
      )}
      <Dialog.Close className={btn} aria-label={t("flow.close")}>
        <X className="size-4" />
      </Dialog.Close>
    </div>
  );
}

function Unavailable({ state, canConfigure, slug }: { state: FlowShell["state"]; canConfigure: boolean; slug: string }) {
  const { t } = useI18n();
  const f = useFlow()!;
  const copy: Record<Exclude<FlowShell["state"], "ok">, [MessageKey, MessageKey]> = {
    nokey: ["flow.nokeyTitle", canConfigure ? "flow.nokeyAdmin" : "flow.nokeyMember"],
    off: ["flow.offTitle", "flow.offBody"],
    role: ["flow.roleTitle", "flow.roleBody"],
    badkey: ["flow.badkeyTitle", "flow.badkeyBody"],
  };
  const [title, body] = copy[state as Exclude<FlowShell["state"], "ok">];
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <KeyRound className="size-6" />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{t(title)}</h3>
      <p className="mt-1.5 max-w-xs text-sm text-muted">{t(body)}</p>
      {canConfigure && (state === "nokey" || state === "badkey" || state === "off") && (
        <Link href={`/w/${slug}/settings/flow`} onClick={() => f.close()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm hover:brightness-105">
          <KeyRound className="size-4" /> {t("flow.connect")}
        </Link>
      )}
    </div>
  );
}

// ───────────────────────── Chat ─────────────────────────

function suggestionsFor(orgType: OrgType, role: Role, extras: Permission[], kids: string[], pathname: string, hasForm: boolean): MessageKey[] {
  const out: MessageKey[] = [];
  if (hasForm) out.push("flow.s_form");
  const rest = pathname.split("/").slice(3).join("/");
  if (/^reports\//.test(rest) || rest === "campuses") out.push("flow.s_pageExplain");
  else if (rest && !rest.startsWith("settings")) out.push("flow.s_page");
  if (orgType === "home") {
    if (role === "owner" || role === "admin") out.push("flow.s_attention", "flow.s_homeGroceries", "flow.s_homeWaiting", "flow.s_homeBills", "flow.s_homeWarranty");
    else out.push("flow.s_memberClaim", "flow.s_memberMine", "flow.s_homeGroceries");
  } else if (orgType === "business") {
    if (role === "owner" || role === "admin" || role === "accountant") out.push("flow.s_attention", "flow.s_bizOwes", "flow.s_bizProfit", "flow.s_bizReminder", "flow.s_bizStock");
    else out.push(extras.includes("inventory.manage") ? "flow.s_bizStock" : "flow.s_attention", "flow.s_bizLeave", "flow.s_bizRequest");
  } else {
    if (role === "parent") out.push("flow.s_parentHow", "flow.s_parentFees", "flow.s_parentNote");
    else if (role === "teacher") out.push("flow.s_attention", "flow.s_teachAbsent", "flow.s_teachMarks");
    else if (role === "accountant") out.push("flow.s_schoolFees", "flow.s_attention");
    else out.push("flow.s_attention", "flow.s_schoolAbsent", "flow.s_schoolRoll", "flow.s_schoolCampuses", "flow.s_schoolNotice");
  }
  void kids;
  return [...new Set(out)].slice(0, 5);
}

function ChatView({ slug, name, avatar, orgType, role, extras, firstName, kids, timeZone }: { slug: string; name: string; avatar: AvatarId; orgType: OrgType; role: Role; extras: Permission[]; firstName: string; kids: string[]; timeZone: string }) {
  const { t } = useI18n();
  const f = useFlow()!;
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [hasForm] = useState(() => (typeof document !== "undefined" ? !!snapshotForm() : false));
  const input = useRef<HTMLTextAreaElement>(null);

  // A question queued by "Ask Flow" elsewhere (palette, dashboard, form button).
  useEffect(() => {
    const p = f.takePending();
    if (p) f.send(p);
    else input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [f.items, f.status]);

  const submit = () => {
    if (!draft.trim() || f.status !== "idle") return;
    f.send(draft);
    setDraft("");
  };

  const [hour] = useState(() => hourIn(timeZone));
  const greeting = hour < 12 ? "flow.greetingMorning" : hour < 17 ? "flow.greetingAfternoon" : "flow.greetingEvening";
  const suggestions = suggestionsFor(orgType, role, extras, kids, pathname, hasForm);
  const lastTextId = [...f.items].reverse().find((i) => i.kind === "text")?.id;

  return (
    <>
      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
        {f.items.length === 0 ? (
          <div className="flex min-h-full flex-col justify-end gap-5 pb-2">
            <div>
              <FlowAvatar avatar={avatar} className="size-12 rounded-2xl" />
              <h3 className="mt-3 text-xl font-semibold">{t(greeting, { name: firstName })}</h3>
              <p className="mt-1 text-sm text-muted">{t("flow.intro")}</p>
            </div>
            <div className="flex flex-col items-start gap-2">
              {suggestions.map((s, i) => (
                <motion.button
                  key={s}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i + 0.05 }}
                  onClick={() => f.send(t(s, { child: kids[0] ?? "" }))}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-start text-sm shadow-sm transition hover:-translate-y-px hover:border-accent-line hover:bg-accent-soft/40"
                >
                  {t(s, { child: kids[0] ?? "" })}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {f.items.map((item) => (
              <Item key={item.id} item={item} slug={slug} name={name} avatar={avatar} showActions={item.id === lastTextId && f.status === "idle"} />
            ))}
            {f.status === "thinking" && (
              <div className="flex items-center gap-2.5 text-sm text-muted">
                <FlowAvatar avatar={avatar} busy className="size-6 rounded-lg" />
                <span className="flow-shimmer">{f.items.at(-1)?.kind === "user" ? t("flow.thinking") : t("flow.working")}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-line p-3">
        <div className="rounded-2xl border border-line bg-surface shadow-sm focus-within:border-accent-line focus-within:ring-2 focus-within:ring-accent/15">
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={Math.min(6, Math.max(1, draft.split("\n").length))}
            dir="auto"
            placeholder={t("flow.placeholder", { name })}
            aria-label={t("flow.placeholder", { name })}
            className="block max-h-40 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm outline-none placeholder:text-subtle"
          />
          <div className="flex items-center gap-2 px-2.5 pb-2.5">
            <button
              type="button"
              onClick={() => f.setUsePage(!f.usePage)}
              title={t("flow.usePageHint")}
              aria-pressed={f.usePage}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition", f.usePage ? "border-accent-line bg-accent-soft text-accent" : "border-line text-muted hover:bg-sunken")}
            >
              <FileText className="size-3.5" /> {t("flow.usePage")}
            </button>
            {f.status === "idle" ? (
              <button type="button" onClick={submit} disabled={!draft.trim()} aria-label={t("flow.send")} className="ms-auto grid size-8 place-items-center rounded-xl bg-accent text-accent-fg shadow-sm transition hover:brightness-105 disabled:opacity-40">
                <ArrowUp className="size-4" />
              </button>
            ) : (
              <button type="button" onClick={f.stop} aria-label={t("flow.stop")} className="ms-auto grid size-8 place-items-center rounded-xl bg-fg text-surface shadow-sm">
                <Square className="size-3.5 fill-current" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 px-1 text-center text-[0.7rem] text-subtle">{t("flow.disclaimer", { name })}</p>
      </div>
    </>
  );
}

function Item({ item, slug, name, avatar, showActions }: { item: ChatItem; slug: string; name: string; avatar: AvatarId; showActions: boolean }) {
  const { t } = useI18n();
  if (item.kind === "user")
    return (
      <div dir="auto" className="ms-10 self-end rounded-2xl rounded-ee-md bg-accent-soft px-3.5 py-2 text-sm whitespace-pre-wrap text-fg">
        {item.text}
      </div>
    );
  if (item.kind === "text")
    return (
      <div className="group flex gap-2.5">
        <FlowAvatar avatar={avatar} className="mt-0.5 size-6 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div data-flow-answer={item.id}>
            <FlowMarkdown text={item.text} />
          </div>
          <AnswerActions item={item} slug={slug} visible={showActions} />
        </div>
      </div>
    );
  if (item.kind === "tool") return <ToolRow item={item} />;
  if (item.kind === "proposal") return <ProposalCard proposal={item.proposal} slug={slug} name={name} />;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>{t(`flow.err_${item.code}` as MessageKey) === `flow.err_${item.code}` ? t("flow.err_unknown") : t(`flow.err_${item.code}` as MessageKey)}</span>
    </div>
  );
}

function ToolRow({ item }: { item: Extract<ChatItem, { kind: "tool" }> }) {
  const { t } = useI18n();
  const f = useFlow()!;
  if (item.ui?.fill) return <FillCard ui={item.ui} />;
  return (
    <div className="ms-8.5 flex flex-col gap-1">
      <div className={cn("flex items-center gap-2 text-xs", item.isError ? "text-warning" : "text-muted")}>
        {item.status === "running" ? <Loader2 className="size-3.5 animate-spin" /> : item.isError ? <XCircle className="size-3.5" /> : <Check className="size-3.5 text-success" />}
        <span className="truncate">{item.ui?.label ?? t("flow.working")}</span>
      </div>
      {!!item.ui?.links?.length && (
        <div className="flex flex-wrap gap-1.5 ps-5">
          {item.ui.links.slice(0, 4).map((l) => (
            <Link key={l.href} href={l.href} onClick={() => f.close()} className="max-w-[16rem] truncate rounded-lg border border-line px-2 py-0.5 text-xs hover:border-accent-line hover:text-accent">
              {l.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FillCard({ ui }: { ui: ToolUi }) {
  const { t } = useI18n();
  const f = useFlow()!;
  const [done, setDone] = useState(false);
  const values = Object.entries(ui.fill ?? {});
  return (
    <div className="ms-8.5 rounded-2xl border border-accent-line bg-accent-soft/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Wand2 className="size-4 text-accent" /> {ui.label}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {values.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="max-w-[10rem] truncate text-muted">{ui.fillLabels?.[k] ?? k}</dt>
            <dd dir="auto" className="truncate">{v}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        disabled={done}
        onClick={async () => {
          const n = await fillForm(ui.fill ?? {});
          if (!n) return toast.error(t("flow.formGone"));
          setDone(true);
          toast.success(t("flow.filled"));
          f.close();
        }}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg shadow-sm hover:brightness-105 disabled:opacity-60"
      >
        {done ? <Check className="size-4" /> : <Wand2 className="size-4" />} {done ? t("flow.done") : t("flow.fillIn")}
      </button>
    </div>
  );
}

function ProposalCard({ proposal, slug, name }: { proposal: ProposalView; slug: string; name: string }) {
  const { t } = useI18n();
  const f = useFlow()!;
  const router = useRouter();
  const reduced = useReducedMotion();
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      const r = await confirmProposal(slug, proposal.id);
      if (!r.ok) return void toast.error(r.error);
      f.updateProposal(r.proposal);
      if (r.proposal.status === "done") {
        toast.success(r.proposal.result?.message ?? t("flow.done"));
        if (r.celebrate) celebrate(reduced);
        router.refresh();
      } else toast.error(r.proposal.result?.message ?? t("flow.failed"));
    });
  const dismiss = () =>
    start(async () => {
      const r = await dismissProposal(slug, proposal.id);
      if (r.proposal) f.updateProposal(r.proposal);
    });
  const s = proposal.status;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn("ms-8.5 rounded-2xl border p-3.5 shadow-sm", s === "done" ? "border-success/40 bg-success/5" : s === "failed" ? "border-danger/40 bg-danger/5" : s === "dismissed" ? "border-line bg-sunken/50 opacity-70" : "border-accent-line bg-accent-soft/40")}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
        <div dir="auto" className="min-w-0 flex-1 text-sm font-semibold">{proposal.title}</div>
      </div>
      <dl className="mt-2.5 grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1 text-sm">
        {proposal.details.map((d, i) => (
          <div key={i} className="contents">
            <dt className="max-w-[10rem] truncate text-muted">{d.label}</dt>
            <dd dir="auto" className="min-w-0 break-words whitespace-pre-wrap">{d.value}</dd>
          </div>
        ))}
      </dl>
      {proposal.note && s === "pending" && <p className="mt-2 text-xs text-muted">{proposal.note}</p>}
      <AnimatePresence mode="wait" initial={false}>
        {s === "pending" ? (
          <motion.div key="actions" exit={{ opacity: 0 }} className="mt-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={confirm} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-medium text-accent-fg shadow-sm transition hover:brightness-105 disabled:opacity-60">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {pending ? t("flow.confirming") : proposal.confirmLabel}
              </button>
              <button type="button" onClick={dismiss} disabled={pending} className="inline-flex h-9 items-center rounded-xl px-3 text-sm text-muted hover:bg-sunken">
                {t("flow.dismiss")}
              </button>
            </div>
            <p className="mt-2 text-[0.7rem] text-subtle">{t("flow.proposalBy", { name })}</p>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2 text-sm">
            {s === "done" ? <CheckCircle2 className="size-4 text-success" /> : s === "failed" ? <XCircle className="size-4 text-danger" /> : null}
            <span className="min-w-0 flex-1">{s === "dismissed" ? t("flow.dismissed") : (proposal.result?.message ?? (s === "done" ? t("flow.done") : t("flow.failed")))}</span>
            {s === "done" && proposal.result?.href && (
              <Link href={proposal.result.href} onClick={() => f.close()} className="font-medium text-accent hover:underline">
                {t("flow.openRecord")}
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AnswerActions({ item, slug, visible }: { item: Extract<ChatItem, { kind: "text" }>; slug: string; visible: boolean }) {
  const { t } = useI18n();
  const f = useFlow()!;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const node = document.querySelector(`[data-flow-answer="${item.id}"]`);
    try {
      if (node && "ClipboardItem" in window) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([item.text], { type: "text/plain" }), "text/html": new Blob([node.innerHTML], { type: "text/html" }) })]);
      } else await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("errors.generic"));
    }
  };
  const word = async () => {
    const res = await fetch(`/api/w/${slug}/flow/docx`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown: item.text, title: f.title }) });
    if (!res.ok) return toast.error(t("errors.generic"));
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (res.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/)?.[1] && decodeURIComponent(res.headers.get("Content-Disposition")!.match(/filename\*=UTF-8''([^;]+)/)![1])) || "Flow.docx";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const btn = "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted transition hover:bg-sunken hover:text-fg";
  return (
    <div className={cn("mt-1 flex gap-1 transition-opacity", visible ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100")}>
      <button type="button" onClick={copy} className={btn}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? t("flow.copied") : t("flow.copy")}
      </button>
      <button type="button" onClick={word} className={btn}>
        <FileDown className="size-3.5" /> {t("flow.downloadWord")}
      </button>
    </div>
  );
}

// ───────────────────────── History ─────────────────────────

function HistoryView({ slug, onOpen }: { slug: string; onOpen: () => void }) {
  const { t, fmt } = useI18n();
  const f = useFlow()!;
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [now] = useState(() => new Date());
  useEffect(() => {
    listConversations(slug).then(setList);
  }, [slug]);
  if (!list)
    return (
      <div className="flex-1 space-y-2 p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12 rounded-xl" />
        ))}
      </div>
    );
  if (!list.length) return <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">{t("flow.historyEmpty")}</div>;
  return (
    <div className="flex-1 overflow-y-auto p-2">
      {list.map((c) => (
        <div key={c.id} className={cn("group flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-sunken", c.id === f.conversationId && "bg-accent-soft/50")}>
          <button
            type="button"
            className="min-w-0 flex-1 text-start"
            onClick={async () => {
              const r = await openConversation(slug, c.id);
              if (r.ok) {
                f.load(c.id, r.title, r.items);
                onOpen();
              }
            }}
          >
            <div dir="auto" className="truncate text-sm font-medium">{c.title || "…"}</div>
            <div className="text-xs text-muted">{fmt.relative(c.updatedAt, now)}</div>
          </button>
          <button
            type="button"
            aria-label={t("flow.deleteChat")}
            onClick={async () => {
              await deleteConversation(slug, c.id);
              setList((l) => l?.filter((x) => x.id !== c.id) ?? null);
              if (c.id === f.conversationId) f.reset();
              toast.success(t("flow.deleted"));
            }}
            className="grid size-8 place-items-center rounded-lg text-muted opacity-0 transition group-hover:opacity-100 hover:bg-surface hover:text-danger focus:opacity-100"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Personal ─────────────────────────

function PersonalView({ flow, persona, onSaved, onBack }: { flow: FlowShell; persona: FlowShell["personal"]; onSaved: (p: FlowShell["personal"]) => void; onBack: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(persona.name ?? "");
  const [avatar, setAvatar] = useState<AvatarId | null>(persona.avatar);
  const [tone, setTone] = useState<FlowTone | null>(persona.tone);
  const [pending, start] = useTransition();
  const shown = avatar ?? flow.defaults.avatar;
  const toneShown = tone ?? flow.defaults.tone;
  const save = () =>
    start(async () => {
      await savePersonalFlow({ name: name.trim() || null, avatar, tone });
      onSaved({ name: name.trim() || null, avatar, tone });
      toast.success(t("flow.saved"));
      router.refresh();
      onBack();
    });
  const avatars = useMemo(() => FLOW_AVATARS, []);
  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-5">
      <p className="text-sm text-muted">{t("flow.personalBody")}</p>
      <label className="mt-5 block text-sm font-medium" htmlFor="flow-name">
        {t("flow.name")}
      </label>
      <input id="flow-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder={flow.defaults.name} className="mt-1.5 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent-line focus:ring-2 focus:ring-accent/15" />
      <div className="mt-5 text-sm font-medium">{t("flow.avatar")}</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {avatars.map((a) => (
          <button key={a} type="button" onClick={() => setAvatar(a === flow.defaults.avatar && !persona.avatar ? null : a)} aria-pressed={shown === a} className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-xs transition", shown === a ? "border-accent-line bg-accent-soft" : "border-line hover:bg-sunken")}>
            <FlowAvatar avatar={a} className="size-9" />
            {t(`flow.avatar_${a}`)}
          </button>
        ))}
      </div>
      <div className="mt-5 text-sm font-medium">{t("flow.tone")}</div>
      <div className="mt-2 space-y-2">
        {FLOW_TONES.map((x) => (
          <button key={x} type="button" onClick={() => setTone(x)} aria-pressed={toneShown === x} className={cn("block w-full rounded-xl border p-3 text-start transition", toneShown === x ? "border-accent-line bg-accent-soft" : "border-line hover:bg-sunken")}>
            <div className="text-sm font-medium">
              {t(`flow.tone_${x}`)}
              {x === flow.defaults.tone && <span className="ms-2 text-xs font-normal text-muted">{t("flow.useDefault", { value: t(`flow.tone_${x}`) }).replace(/\s*\(.*\)/, "")}</span>}
            </div>
            <div className="mt-0.5 text-xs text-muted">“{t(`flow.toneSample_${x}`)}”</div>
          </button>
        ))}
      </div>
      <button type="button" onClick={save} disabled={pending} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm hover:brightness-105 disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
      </button>
    </div>
  );
}
