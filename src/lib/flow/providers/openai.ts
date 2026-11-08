import "server-only";
import OpenAI from "openai";
import { FlowProviderError, type FlowAdapter, type StepRequest, type StepResult, type StopKind, type StoredMessage, type ToolCall } from "../types";

// OpenAI, Google Gemini (through Google's OpenAI-compatible endpoint) and any
// other OpenAI-compatible service (OpenRouter, Mistral, a local Ollama...),
// all through the Chat Completions API with streaming and function calling.

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function toOpenAIMessages(system: string, history: StoredMessage[]): Msg[] {
  const out: Msg[] = [{ role: "system", content: system }];
  for (const m of history) {
    if (m.role === "user") out.push({ role: "user", content: m.context ? `${m.context}\n\n${m.text}` : m.text });
    else if (m.role === "assistant") {
      if (!m.text && !m.toolCalls.length) continue;
      out.push({
        role: "assistant",
        content: m.text || null,
        ...(m.toolCalls.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) } : {}),
      });
    } else {
      for (const r of m.results) out.push({ role: "tool", tool_call_id: r.id, content: r.isError ? `Error: ${r.content}` : r.content });
    }
  }
  return out;
}

function stopKind(reason: string | null | undefined, hasTools: boolean): StopKind {
  if (hasTools || reason === "tool_calls" || reason === "function_call") return hasTools ? "tool" : "end";
  if (reason === "length") return "max_tokens";
  if (reason === "content_filter") return "refusal";
  return "end";
}

function mapError(e: unknown): FlowProviderError {
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) return new FlowProviderError("auth", e.message);
  if (e instanceof OpenAI.NotFoundError) return new FlowProviderError("model", e.message);
  if (e instanceof OpenAI.RateLimitError) return new FlowProviderError("rate", e.message);
  if (e instanceof OpenAI.BadRequestError) return new FlowProviderError("bad_request", e.message);
  if (e instanceof OpenAI.InternalServerError) return new FlowProviderError("unavailable", e.message);
  if (e instanceof OpenAI.APIConnectionError) return new FlowProviderError("network", e.message);
  if (e instanceof OpenAI.APIError) return new FlowProviderError(e.status && e.status >= 500 ? "unavailable" : "unknown", e.message);
  return new FlowProviderError("unknown", e instanceof Error ? e.message : String(e));
}

export function openAIAdapter(fixedBaseUrl?: string): FlowAdapter {
  const make = (apiKey: string, baseUrl?: string | null) => new OpenAI({ apiKey, baseURL: fixedBaseUrl ?? (baseUrl || undefined), maxRetries: 2 });

  return {
    async step(req: StepRequest, onText): Promise<StepResult> {
      try {
        const stream = await make(req.apiKey, req.baseUrl).chat.completions.create(
          {
            model: req.model,
            messages: toOpenAIMessages(req.system, req.history),
            tools: req.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal: req.signal },
        );
        let text = "";
        let finish: string | null | undefined;
        let usage: OpenAI.Completions.CompletionUsage | undefined;
        let served = req.model;
        const calls: { id: string; name: string; args: string }[] = [];
        for await (const chunk of stream) {
          if (chunk.model) served = chunk.model;
          if (chunk.usage) usage = chunk.usage;
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const d = choice.delta;
          if (d?.content) {
            text += d.content;
            onText(d.content);
          }
          for (const tc of d?.tool_calls ?? []) {
            const slot = (calls[tc.index] ??= { id: "", name: "", args: "" });
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name += tc.function.name;
            if (tc.function?.arguments) slot.args += tc.function.arguments;
          }
          if (choice.finish_reason) finish = choice.finish_reason;
        }
        const toolCalls: ToolCall[] = calls
          .filter((c) => c && c.name)
          .map((c, i) => {
            let input: unknown = {};
            try {
              input = c.args ? JSON.parse(c.args) : {};
            } catch {
              input = { __invalid_json: c.args };
            }
            return { id: c.id || `call_${Date.now().toString(36)}_${i}`, name: c.name, input };
          });
        const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
        return {
          text,
          toolCalls,
          stop: stopKind(finish, toolCalls.length > 0),
          servedModel: served,
          usage: { input: Math.max(0, (usage?.prompt_tokens ?? 0) - cached), output: usage?.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 },
        };
      } catch (e) {
        if (req.signal?.aborted) throw new FlowProviderError("unknown", "aborted");
        throw mapError(e);
      }
    },

    async listModels(apiKey, baseUrl) {
      try {
        const ids: string[] = [];
        for await (const m of make(apiKey, baseUrl).models.list()) ids.push(m.id.replace(/^models\//, ""));
        return ids.sort();
      } catch (e) {
        // Listing models sends nothing but the key, so a 400 here (Google's answer to a bad key) means the key.
        if (e instanceof OpenAI.BadRequestError) throw new FlowProviderError("auth", e.message);
        throw mapError(e);
      }
    },
  };
}
