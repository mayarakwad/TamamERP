import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { claudeModel } from "../models";
import { FlowProviderError, type FlowAdapter, type StepRequest, type StepResult, type StopKind, type StoredMessage, type ToolCall } from "../types";

// Claude through Anthropic's official SDK: a streaming request per step of
// the tool loop. The conversation is append-only and the system prompt and
// tool list are frozen when it starts, so the prompt cache stays warm and
// the thinking blocks we replay stay valid.

type Block = Anthropic.Beta.BetaContentBlockParam;

function isThinking(b: { type: string }) {
  return b.type === "thinking" || b.type === "redacted_thinking";
}

/** Our stored history → Messages API turns. */
export function toAnthropicMessages(history: StoredMessage[], stripThinking = false): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of history) {
    if (m.role === "user") {
      const content: Block[] = [];
      if (m.context) content.push({ type: "text", text: m.context });
      content.push({ type: "text", text: m.text || "…" });
      out.push({ role: "user", content });
    } else if (m.role === "assistant") {
      let content: Block[];
      if (m.provider === "anthropic" && Array.isArray(m.native)) {
        content = (m.native as Block[]).filter((b) => !(stripThinking && isThinking(b)));
      } else {
        content = [];
        if (m.text) content.push({ type: "text", text: m.text });
        for (const c of m.toolCalls) content.push({ type: "tool_use", id: c.id, name: c.name, input: (c.input ?? {}) as Record<string, unknown> });
      }
      if (content.length) out.push({ role: "assistant", content });
    } else {
      out.push({
        role: "user",
        content: m.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
      });
    }
  }
  return out;
}

function stopKind(reason: string | null): StopKind {
  if (reason === "end_turn" || reason === "stop_sequence") return "end";
  if (reason === "tool_use") return "tool";
  if (reason === "max_tokens") return "max_tokens";
  if (reason === "refusal") return "refusal";
  return "other";
}

function mapError(e: unknown): FlowProviderError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new FlowProviderError("auth", e.message);
  if (e instanceof Anthropic.NotFoundError) return new FlowProviderError("model", e.message);
  if (e instanceof Anthropic.RateLimitError) return new FlowProviderError("rate", e.message);
  if (e instanceof Anthropic.BadRequestError) return new FlowProviderError("bad_request", e.message);
  if (e instanceof Anthropic.InternalServerError) return new FlowProviderError("unavailable", e.message);
  if (e instanceof Anthropic.APIConnectionError) return new FlowProviderError("network", e.message);
  if (e instanceof Anthropic.APIError) return new FlowProviderError(e.status && e.status >= 500 ? "unavailable" : "unknown", e.message);
  return new FlowProviderError("unknown", e instanceof Error ? e.message : String(e));
}

function client(apiKey: string) {
  return new Anthropic({ apiKey, maxRetries: 2 });
}

async function runOnce(req: StepRequest, onText: (d: string) => void, stripThinking: boolean): Promise<StepResult> {
  const known = claudeModel(req.model);
  const messages = toAnthropicMessages(req.history, stripThinking);
  const tools: Anthropic.Beta.BetaTool[] = req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
    // Inputs stream as they're generated; every input is validated against its schema before a tool runs.
    eager_input_streaming: true,
  }));
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: known ? 64000 : 8192,
    system: [{ type: "text", text: req.system }],
    tools,
    messages,
    // Caches the frozen system prompt, the tools and the conversation so far.
    cache_control: { type: "ephemeral" },
    ...(known?.adaptive ? { thinking: { type: "adaptive" as const }, output_config: { effort: req.effort } } : {}),
    // If a safety classifier declines, the API retries on a fallback model inside the same call.
    ...(known?.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
  const stream = client(req.apiKey).beta.messages.stream(params, { signal: req.signal });
  stream.on("text", (delta) => onText(delta));
  const final = await stream.finalMessage();

  const toolCalls: ToolCall[] = [];
  let text = "";
  for (const b of final.content) {
    if (b.type === "text") text += b.text;
    else if (b.type === "tool_use") toolCalls.push({ id: b.id, name: b.name, input: b.input });
  }
  const u = final.usage;
  return {
    text,
    toolCalls,
    native: final.content,
    stop: stopKind(final.stop_reason),
    servedModel: final.model,
    usage: { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
  };
}

export const anthropicAdapter: FlowAdapter = {
  async step(req, onText) {
    const hasThinking = req.history.some((m) => m.role === "assistant" && m.provider === "anthropic" && Array.isArray(m.native) && (m.native as { type: string }[]).some(isThinking));
    let jsonRetries = 0;
    let stripped = false;
    for (;;) {
      try {
        return await runOnce(req, onText, stripped);
      } catch (e) {
        if (req.signal?.aborted) throw new FlowProviderError("unknown", "aborted");
        // Replayed thinking blocks can be refused if the conversation changed (e.g. the model was
        // switched). Recover once without them; the model answers without that earlier reasoning.
        if (e instanceof Anthropic.BadRequestError && hasThinking && !stripped) {
          stripped = true;
          continue;
        }
        // A streamed tool input that couldn't be parsed (anything that isn't an API error):
        // re-issue the turn, at most twice.
        if (!(e instanceof Anthropic.APIError) && jsonRetries++ < 2) continue;
        throw mapError(e);
      }
    }
  },

  async listModels(apiKey) {
    try {
      const ids: string[] = [];
      for await (const m of client(apiKey).models.list({ limit: 100 })) ids.push(m.id);
      return ids;
    } catch (e) {
      throw mapError(e);
    }
  },
};
