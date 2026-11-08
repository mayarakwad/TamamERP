"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { openConversation } from "@/app/actions/flow";
import type { ChatItem, FlowEvent, ProposalView } from "@/lib/flow/types";
import { snapshotPage } from "./page-context";

// Flow's chat state lives here, above the panel, so a conversation survives
// closing the panel and moving between pages.

export type FlowStatus = "idle" | "thinking" | "streaming";

interface FlowContextValue {
  available: boolean;
  isOpen: boolean;
  open: (prompt?: string) => void;
  close: () => void;
  items: ChatItem[];
  status: FlowStatus;
  conversationId: string | null;
  title: string;
  usePage: boolean;
  setUsePage: (v: boolean) => void;
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;
  load: (id: string, title: string, items: ChatItem[]) => void;
  updateProposal: (p: ProposalView) => void;
  /** A question queued by open(prompt), sent once the panel is ready */
  pending: string | null;
  takePending: () => string | null;
}

const FlowContext = createContext<FlowContextValue | null>(null);

export function useFlow() {
  return useContext(FlowContext);
}

let seq = 0;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${seq++}`;

export function FlowProvider({ slug, available, children }: { slug: string; available: boolean; children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [usePage, setUsePage] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const convoRef = useRef<string | null>(null);
  const storeKey = `tamam.flow.${slug}`;
  const remember = useCallback(
    (id: string | null) => {
      try {
        if (id) sessionStorage.setItem(storeKey, id);
        else sessionStorage.removeItem(storeKey);
      } catch {}
    },
    [storeKey],
  );

  // A reload keeps the chat that was open in this tab.
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(storeKey);
    } catch {}
    if (!id || !available) return;
    let cancelled = false;
    openConversation(slug, id).then((r) => {
      if (cancelled || !r.ok || convoRef.current) return;
      convoRef.current = id;
      setConversationId(id);
      setTitle(r.title);
      setItems(r.items);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, storeKey, available]);

  const reset = useCallback(() => {
    abort.current?.abort();
    setItems([]);
    setConversationId(null);
    convoRef.current = null;
    remember(null);
    setTitle("");
    setStatus("idle");
  }, [remember]);

  const load = useCallback((id: string, t: string, loaded: ChatItem[]) => {
    abort.current?.abort();
    setItems(loaded);
    setConversationId(id);
    convoRef.current = id;
    remember(id);
    setTitle(t);
    setStatus("idle");
  }, [remember]);

  const updateProposal = useCallback((p: ProposalView) => {
    setItems((list) => list.map((i) => (i.kind === "proposal" && i.id === p.id ? { ...i, proposal: p } : i)));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || abort.current) return;
      const controller = new AbortController();
      abort.current = controller;
      setItems((list) => [...list, { kind: "user", id: nextId("u"), text: message }]);
      setStatus("thinking");
      let textId: string | null = null;
      const apply = (e: FlowEvent) => {
        switch (e.type) {
          case "conversation":
            convoRef.current = e.id;
            remember(e.id);
            setConversationId(e.id);
            setTitle(e.title);
            break;
          case "text": {
            setStatus("streaming");
            if (!textId) {
              const id = nextId("t");
              textId = id;
              setItems((list) => [...list, { kind: "text", id, text: e.delta }]);
            } else {
              const id = textId;
              setItems((list) => list.map((i) => (i.kind === "text" && i.id === id ? { ...i, text: i.text + e.delta } : i)));
            }
            break;
          }
          case "step":
            textId = null;
            setStatus("thinking");
            break;
          case "tool":
            textId = null;
            if (e.status === "start") setItems((list) => [...list, { kind: "tool", id: e.id, name: e.name, status: "running" }]);
            else setItems((list) => list.map((i) => (i.kind === "tool" && i.id === e.id ? { ...i, status: "done", ui: e.ui, isError: e.isError } : i)));
            break;
          case "proposal":
            setItems((list) => [...list, { kind: "proposal", id: e.proposal.id, proposal: e.proposal }]);
            break;
          case "error":
            setItems((list) => [...list, { kind: "error", id: nextId("e"), code: e.code, message: e.message }]);
            break;
          case "done":
            break;
        }
      };
      try {
        const res = await fetch(`/api/w/${slug}/flow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: convoRef.current, message, page: snapshotPage(usePage) }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) apply(JSON.parse(line) as FlowEvent);
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) apply({ type: "error", code: e instanceof Error && e.message === "401" ? "role" : "unknown", message: "" });
      } finally {
        abort.current = null;
        setStatus("idle");
      }
    },
    [slug, usePage, remember],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const open = useCallback((prompt?: string) => {
    if (prompt) setPending(prompt);
    setOpen(true);
  }, []);

  const takePending = useCallback(() => {
    const p = pending;
    if (p) setPending(null);
    return p;
  }, [pending]);

  const value = useMemo<FlowContextValue>(
    () => ({ available, isOpen, open, close: () => setOpen(false), items, status, conversationId, title, usePage, setUsePage, send, stop, reset, load, updateProposal, pending, takePending }),
    [available, isOpen, open, items, status, conversationId, title, usePage, send, stop, reset, load, updateProposal, pending, takePending],
  );
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}
