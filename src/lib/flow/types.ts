import type { FlowEffort, TokenUsage } from "./models";

// Shapes shared by Flow's server code and the panel.

/** What the panel sends about the page the person is looking at. */
export interface PageContext {
  path: string;
  title: string;
  /** Visible text of the main area, trimmed */
  text?: string;
  form?: FormSnapshot | null;
}

export interface FormField {
  id: string;
  label: string;
  type: string;
  value: string;
  options?: { value: string; label: string }[];
}

export interface FormSnapshot {
  title: string;
  fields: FormField[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** How a tool step looks in the panel */
export interface ToolUi {
  /** Short line, e.g. "Looked through 42 claims" */
  label: string;
  proposalId?: string;
  /** fill_form: values for the open form, applied in the browser */
  fill?: Record<string, string>;
  /** fill_form: field id → its label, for the card */
  fillLabels?: Record<string, string>;
  /** Links the step produced */
  links?: { title: string; href: string }[];
}

export interface ToolResult {
  id: string;
  name: string;
  /** What the model reads (JSON or text) */
  content: string;
  isError?: boolean;
  ui?: ToolUi;
}

export type StoredMessage =
  | { role: "user"; text: string; context?: string }
  | { role: "assistant"; provider: string; model: string; text: string; toolCalls: ToolCall[]; native?: unknown; stop: StopKind }
  | { role: "tool"; results: ToolResult[] };

export type StopKind = "end" | "tool" | "max_tokens" | "refusal" | "other";

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StepRequest {
  system: string;
  tools: ToolSpec[];
  history: StoredMessage[];
  model: string;
  effort: FlowEffort;
  apiKey: string;
  baseUrl?: string | null;
  signal?: AbortSignal;
}

export interface StepResult {
  text: string;
  toolCalls: ToolCall[];
  /** Provider-native assistant content, replayed unchanged on the next request */
  native?: unknown;
  stop: StopKind;
  usage: TokenUsage;
  /** The model that actually answered (a refusal fallback can switch it) */
  servedModel: string;
}

export interface FlowAdapter {
  step(req: StepRequest, onText: (delta: string) => void): Promise<StepResult>;
  /** Model ids the key can use; also how "Test connection" checks a key without spending anything. */
  listModels(apiKey: string, baseUrl?: string | null): Promise<string[]>;
}

export type FlowErrorCode = "auth" | "model" | "rate" | "unavailable" | "network" | "bad_request" | "unknown";

export class FlowProviderError extends Error {
  constructor(
    public code: FlowErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Events streamed to the panel, one JSON object per line. */
export type FlowEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "text"; delta: string }
  | { type: "step" }
  | { type: "tool"; id: string; name: string; status: "start" | "done"; ui?: ToolUi; isError?: boolean }
  | { type: "proposal"; proposal: ProposalView }
  | { type: "done"; costMicros: number | null }
  | { type: "error"; code: string; message: string };

export interface ProposalView {
  id: string;
  kind: string;
  title: string;
  /** Label → value rows shown on the card */
  details: { label: string; value: string }[];
  /** Warning shown above the confirm button */
  note?: string;
  confirmLabel: string;
  status: "pending" | "done" | "dismissed" | "failed";
  result?: { message: string; href?: string } | null;
}

/** One row of the chat as the panel shows it. */
export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; status: "running" | "done"; ui?: ToolUi; isError?: boolean }
  | { kind: "proposal"; id: string; proposal: ProposalView }
  | { kind: "error"; id: string; code: string; message?: string };

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}
