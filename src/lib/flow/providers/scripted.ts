import "server-only";
import type { FlowAdapter, StepResult, StoredMessage, ToolCall } from "../types";

// A stand-in "model" for automated tests and local development without an AI
// key. It picks tools with simple rules and writes plain answers from their
// results, so the whole pipeline (tools, permissions, proposals, streaming,
// usage) runs for real. Only available when FLOW_SCRIPTED=1 on the server.

export const scriptedEnabled = () => process.env.FLOW_SCRIPTED === "1";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };

function dohaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function weekStart(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // Sunday: the school week in Qatar
  return d.toISOString().slice(0, 10);
}

function monthRange(text: string, today: string): { from: string; to: string } {
  const lower = text.toLowerCase();
  const idx = MONTHS.findIndex((m) => lower.includes(m));
  const year = Number(today.slice(0, 4));
  const month = idx >= 0 ? idx : Number(today.slice(5, 7)) - 1;
  const y = idx >= 0 && idx > Number(today.slice(5, 7)) - 1 ? year - 1 : year;
  const from = new Date(Date.UTC(y, month, 1));
  const to = new Date(Date.UTC(y, month + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

let counter = 0;
const call = (name: string, input: unknown): ToolCall => ({ id: `toolu_test_${Date.now().toString(36)}_${counter++}`, name, input });

function pickTools(text: string, context: string): ToolCall[] {
  const today = dohaToday();
  const t = text.toLowerCase();
  const claim = text.match(/CLM-\d{4}-\d{5}/i)?.[0];
  if (claim && /approve|اعتمد/i.test(text)) return [call("propose_claim_decision", { claim: claim.toUpperCase(), decision: "approve" })];
  if (/missed|absent|away|غاب/i.test(text)) {
    const n = t.match(/more than (\d+|\w+)/);
    const min = n ? (Number(n[1]) || WORDS[n[1]] || 0) + 1 : 1;
    const span = t.match(/last (\d+|\w+) (day|week)s?/);
    const n2 = span ? Number(span[1]) || WORDS[span[1]] || 1 : 0;
    const from = span ? new Date(new Date(`${today}T12:00:00Z`).getTime() - n2 * (span[2] === "week" ? 7 : 1) * 86400_000).toISOString().slice(0, 10) : weekStart(today);
    return [call("student_attendance", { from, to: today, min_days_away: min })];
  }
  if (/spen[dt]|صرف/i.test(text)) return [call("spending_summary", { ...monthRange(text, today), group_by: "category" })];
  if (/fill/i.test(text)) {
    const fields = [...context.matchAll(/^- \[([^\]]+)\] ([^(\n]+)/gm)].map((m) => ({ id: m[1], label: m[2].trim().toLowerCase() }));
    const values: Record<string, string> = {};
    const amount = text.match(/\d+(?:\.\d+)?/)?.[0];
    const at = text.match(/\bat ([A-Za-z][\w&' -]*)/)?.[1]?.trim();
    for (const f of fields) {
      if (amount && /amount/.test(f.label)) values[f.id] = amount;
      if (at && /merchant|shop|store|where/.test(f.label)) values[f.id] = at;
    }
    return [call("fill_form", { values })];
  }
  if (/announce/i.test(text)) return [call("propose_announcement", { audience: "parents", title: "Sports day on Thursday", body: "Sports day is on Thursday. Children should come in their PE kit." })];
  if (/briefing|attention|today/i.test(text)) return [call("todays_briefing", {})];
  const find = text.match(/^(?:find|search(?: for)?)\s+(.+)/i)?.[1];
  if (find) return [call("search_records", { query: find })];
  return [];
}

function table(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "Nothing matched.";
  const keys = Object.keys(rows[0]).filter((k) => k !== "link" && k !== "id").slice(0, 5);
  const head = `| ${keys.join(" | ")} |\n| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows.slice(0, 10).map((r) => `| ${keys.map((k) => String(r[k] ?? "")).join(" | ")} |`).join("\n");
  return `${head}\n${body}`;
}

function answerFrom(results: Extract<StoredMessage, { role: "tool" }>["results"]): string {
  const parts: string[] = [];
  for (const r of results) {
    if (r.isError) parts.push(`I couldn't do that: ${r.content}`);
    else if (r.ui?.proposalId) parts.push("I've prepared this for you. Check the details and press **Confirm** when you're happy.");
    else if (r.ui?.fill) parts.push("I've suggested values for the form. Press **Fill in** to use them.");
    else {
      try {
        const data = JSON.parse(r.content) as Record<string, unknown>;
        const list = (data.rows ?? data.students ?? data.groups ?? data.items ?? data.hits) as Record<string, unknown>[] | undefined;
        parts.push(Array.isArray(list) ? `Here's what I found:\n\n${table(list)}` : "Done.");
      } catch {
        parts.push(r.content.slice(0, 400));
      }
    }
  }
  return parts.join("\n\n");
}

export const scriptedAdapter: FlowAdapter = {
  async step(req, onText): Promise<StepResult> {
    const last = req.history[req.history.length - 1];
    let text = "";
    let toolCalls: ToolCall[] = [];
    if (last?.role === "tool") text = answerFrom(last.results);
    else if (last?.role === "user") {
      toolCalls = pickTools(last.text, last.context ?? "");
      if (!toolCalls.length) text = "This is the test assistant. Try asking about spending, absences, approvals or today's briefing.";
    }
    // Stream in a few pieces, like a real model.
    for (const piece of text.match(/[\s\S]{1,24}/g) ?? []) {
      onText(piece);
      await new Promise((r) => setTimeout(r, 5));
    }
    const input = Math.ceil((req.system.length + JSON.stringify(req.history).length) / 4);
    return { text, toolCalls, stop: toolCalls.length ? "tool" : "end", servedModel: req.model, usage: { input, output: Math.ceil(text.length / 4) + 20 * toolCalls.length, cacheRead: 0, cacheWrite: 0 } };
  },
  async listModels() {
    return ["test-model"];
  },
};
