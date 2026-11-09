import { describe, expect, it, vi, beforeAll } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

vi.mock("server-only", () => ({}));

import { decryptKey, encryptKey, keyHint } from "@/lib/flow/crypto";
import { costMicros, microsToDirhams, pricesFor } from "@/lib/flow/models";
import { toAnthropicMessages } from "@/lib/flow/providers/anthropic";
import { toOpenAIMessages } from "@/lib/flow/providers/openai";
import { scriptedAdapter } from "@/lib/flow/providers/scripted";
import { markdownToDocx } from "@/lib/flow/docx";
import { buildContextBlock } from "@/lib/flow/prompt";
import type { StoredMessage } from "@/lib/flow/types";

beforeAll(() => {
  process.env.APP_SECRET = "test-secret-that-is-long-enough-for-hkdf-0123456789";
});

describe("AI keys are stored encrypted", () => {
  it("round-trips, but only for the organization it was saved for", () => {
    const stored = encryptKey("org_a", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234");
    expect(stored).not.toContain("abcdefghijklmnop");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptKey("org_a", stored)).toBe("sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234");
    expect(decryptKey("org_b", stored)).toBeNull();
  });

  it("refuses a tampered value and a different server secret", () => {
    const stored = encryptKey("org_a", "sk-secret-value-000");
    const parts = stored.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(decryptKey("org_a", parts.join(":"))).toBeNull();
    const before = process.env.APP_SECRET;
    process.env.APP_SECRET = "a-completely-different-secret-value-0987654321";
    expect(decryptKey("org_a", stored)).toBeNull();
    process.env.APP_SECRET = before;
  });

  it("shows only a short hint", () => {
    expect(keyHint("sk-ant-api03-abcdefghijklmnop-WXYZ")).toBe("sk-ant-…WXYZ");
    expect(keyHint("AIzaSyD-1234567890abcd")).toBe("AIza…abcd");
    expect(keyHint("gsk_live_secretvalue9876")).toBe("…9876");
  });
});

describe("spending", () => {
  it("prices Claude calls from the built-in table, cache reads and writes included", () => {
    const p = pricesFor("anthropic", "claude-opus-5-5", { priceIn: null, priceOut: null });
    // 10k uncached in at $4/M, 2k out at $20/M, 50k cache reads at $0.20/M, 1k cache writes at $5/M
    expect(costMicros(p, { input: 10_000, output: 2_000, cacheRead: 50_000, cacheWrite: 1_000 })).toBe(40_000 + 40_000 + 10_000 + 5_000);
  });

  it("uses the admin's prices for other providers, and admits when it doesn't know", () => {
    expect(pricesFor("openai", "some-model", { priceIn: null, priceOut: null })).toBeNull();
    expect(costMicros(null, { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 })).toBeNull();
    const p = pricesFor("openai", "some-model", { priceIn: 2_000_000, priceOut: 8_000_000 });
    expect(costMicros(p, { input: 1_000_000, output: 500_000, cacheRead: 0, cacheWrite: 0 })).toBe(6_000_000);
  });

  it("converts dollars to riyals at the 3.64 peg", () => {
    expect(microsToDirhams(1_000_000)).toBe(364);
  });
});

const history: StoredMessage[] = [
  { role: "user", text: "How much on groceries?", context: "<context>Now: …</context>" },
  {
    role: "assistant",
    provider: "anthropic",
    model: "claude-opus-5-5",
    text: "Let me check.",
    toolCalls: [{ id: "toolu_1", name: "spending_summary", input: { from: "2026-10-01", to: "2026-10-31" } }],
    native: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "toolu_1", name: "spending_summary", input: { from: "2026-10-01", to: "2026-10-31" } },
    ],
    stop: "tool",
  },
  { role: "tool", results: [{ id: "toolu_1", name: "spending_summary", content: '{"total":2340}' }] },
];

describe("conversations replay exactly", () => {
  it("sends Claude its own blocks back unchanged, thinking included", () => {
    const msgs = toAnthropicMessages(history);
    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toEqual({ role: "user", content: [{ type: "text", text: "<context>Now: …</context>" }, { type: "text", text: "How much on groceries?" }] });
    expect((msgs[1].content as { type: string }[]).map((b) => b.type)).toEqual(["thinking", "text", "tool_use"]);
    expect(msgs[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: '{"total":2340}' }] });
    // Same input, same output: the history is append-only.
    expect(JSON.stringify(toAnthropicMessages(history))).toBe(JSON.stringify(msgs));
  });

  it("can drop thinking blocks as a one-time recovery", () => {
    const msgs = toAnthropicMessages(history, true);
    expect((msgs[1].content as { type: string }[]).map((b) => b.type)).toEqual(["text", "tool_use"]);
  });

  it("speaks the Chat Completions format to OpenAI-compatible providers", () => {
    const msgs = toOpenAIMessages("system prompt", history);
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(msgs[2]).toMatchObject({ role: "assistant", content: "Let me check.", tool_calls: [{ id: "toolu_1", type: "function", function: { name: "spending_summary" } }] });
    expect(msgs[3]).toEqual({ role: "tool", tool_call_id: "toolu_1", content: '{"total":2340}' });
  });
});

describe("page context", () => {
  it("tells the model the time, the page and the open form", () => {
    const block = buildContextBlock({
      now: new Date("2026-11-08T09:30:00Z"),
      timeZone: "Asia/Qatar",
      page: { path: "/w/x/claims", title: "Claims", text: "215 claims", form: { title: "New claim", fields: [{ id: "c-amount", label: "Amount", type: "text", value: "" }] } },
      updates: ['The person confirmed "Approve CLM-2026-00012".'],
    });
    expect(block).toContain("12:30");
    expect(block).toContain("Page on screen: Claims — /w/x/claims");
    expect(block).toContain('- [c-amount] Amount (text) = ""');
    expect(block).toContain("confirmed");
  });
});

describe("the scripted test provider", () => {
  it("picks a tool, then answers from its result", async () => {
    const base = { system: "s", tools: [], model: "test-model", effort: "medium" as const, apiKey: "x" };
    const first = await scriptedAdapter.step({ ...base, history: [{ role: "user", text: "Which students missed more than three days in the last two weeks?" }] }, () => {});
    expect(first.toolCalls[0]).toMatchObject({ name: "student_attendance", input: { min_days_away: 4 } });
    let streamed = "";
    const second = await scriptedAdapter.step(
      { ...base, history: [{ role: "user", text: "q" }, { role: "assistant", provider: "scripted", model: "m", text: "", toolCalls: first.toolCalls, stop: "tool" }, { role: "tool", results: [{ id: first.toolCalls[0].id, name: "student_attendance", content: JSON.stringify({ rows: [{ student: "Ward Nasser", days_away: 6 }] }) }] }] },
      (d) => (streamed += d),
    );
    expect(second.text).toContain("Ward Nasser");
    expect(streamed).toBe(second.text);
  });
});

describe("drafts download as Word", () => {
  it("keeps headings, lists, tables and Arabic direction", async () => {
    const buf = await markdownToDocx("# Notice\n\nSports day is on **Thursday**.\n\n- PE kit\n- Water bottle\n\n| Class | Time |\n| --- | --- |\n| 5-B | 08:00 |\n\nيوم رياضي سعيد", "Sports day");
    const files = unzipSync(new Uint8Array(buf));
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("Sports day is on ");
    expect(xml).toContain("Thursday");
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("يوم رياضي سعيد");
    expect(xml).toContain("<w:bidi/>");
  });

  it("keeps a letter's line breaks", async () => {
    const xml = strFromU8(unzipSync(new Uint8Array(await markdownToDocx("With thanks,\nAl Manara International School", "")))["word/document.xml"]);
    expect(xml).toContain("<w:br/>");
    expect(xml).toContain("Al Manara International School");
  });
});
