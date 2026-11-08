// Providers and models Flow can use, with prices for spending tracking.
// Prices are in micro-dollars per million tokens ($4.00 → 4_000_000) so cost
// maths stays in integers. Claude prices are Anthropic's published rates
// (checked October 2026). Other providers change models and prices often, so
// their model list is loaded live from the provider, and the admin enters
// the prices from the provider's pricing page.

export const FLOW_PROVIDERS = ["anthropic", "openai", "google", "compatible"] as const;
export type FlowProvider = (typeof FLOW_PROVIDERS)[number] | "scripted";

export interface ProviderInfo {
  id: FlowProvider;
  label: string;
  keyPlaceholder: string;
  keysUrl: string | null;
  pricingUrl: string | null;
  /** Fixed endpoint for OpenAI-compatible providers. */
  baseUrl?: string;
  defaultModel: string;
}

export const PROVIDERS: Record<(typeof FLOW_PROVIDERS)[number], ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    keyPlaceholder: "sk-ant-…",
    keysUrl: "https://platform.claude.com",
    pricingUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    defaultModel: "claude-opus-5-5",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    keyPlaceholder: "sk-…",
    keysUrl: "https://platform.openai.com/api-keys",
    pricingUrl: "https://openai.com/api/pricing/",
    defaultModel: "",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    keyPlaceholder: "AIza…",
    keysUrl: "https://aistudio.google.com/apikey",
    pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "",
  },
  compatible: {
    id: "compatible",
    label: "Other (OpenAI-compatible)",
    keyPlaceholder: "…",
    keysUrl: null,
    pricingUrl: null,
    defaultModel: "",
  },
};

export interface ClaudeModel {
  id: string;
  label: string;
  /** Short note for the model picker */
  note: "recommended" | "fast" | "cheapest" | "most-capable" | null;
  priceIn: number;
  priceOut: number;
  priceCacheRead: number;
  /** Adaptive thinking and the effort setting */
  adaptive: boolean;
  /** Server-side refusal fallback ("default" routing) on the Claude API */
  fallbacks: boolean;
}

const M = 1_000_000;

export const CLAUDE_MODELS: ClaudeModel[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "recommended", priceIn: 4 * M, priceOut: 20 * M, priceCacheRead: 0.2 * M, adaptive: true, fallbacks: true },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "fast", priceIn: 2 * M, priceOut: 10 * M, priceCacheRead: 0.2 * M, adaptive: true, fallbacks: true },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "cheapest", priceIn: 0.1 * M, priceOut: 0.5 * M, priceCacheRead: 0.01 * M, adaptive: true, fallbacks: false },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1", note: "most-capable", priceIn: 10 * M, priceOut: 50 * M, priceCacheRead: 0.25 * M, adaptive: true, fallbacks: true },
  { id: "claude-opus-5", label: "Claude Opus 5", note: null, priceIn: 5 * M, priceOut: 25 * M, priceCacheRead: 0.5 * M, adaptive: true, fallbacks: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: null, priceIn: 2 * M, priceOut: 10 * M, priceCacheRead: 0.2 * M, adaptive: true, fallbacks: false },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: null, priceIn: 5 * M, priceOut: 25 * M, priceCacheRead: 0.5 * M, adaptive: true, fallbacks: false },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: null, priceIn: 3 * M, priceOut: 15 * M, priceCacheRead: 0.3 * M, adaptive: true, fallbacks: false },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: null, priceIn: 1 * M, priceOut: 5 * M, priceCacheRead: 0.1 * M, adaptive: false, fallbacks: false },
];

export function claudeModel(id: string): ClaudeModel | undefined {
  return CLAUDE_MODELS.find((m) => m.id === id);
}

export interface Prices {
  in: number;
  out: number;
  cacheRead: number;
  /** Writing to the prompt cache (Claude: 1.25× input for the 5-minute cache). */
  cacheWrite: number;
}

/** Prices for a model: the admin's own figures win, then the built-in Claude table. */
export function pricesFor(provider: FlowProvider, model: string, custom: { priceIn: number | null; priceOut: number | null }): Prices | null {
  if (custom.priceIn != null && custom.priceOut != null) {
    // Most providers bill cached input at about a tenth of the normal rate.
    return { in: custom.priceIn, out: custom.priceOut, cacheRead: Math.round(custom.priceIn / 10), cacheWrite: provider === "anthropic" ? Math.round(custom.priceIn * 1.25) : custom.priceIn };
  }
  if (provider === "anthropic") {
    const m = claudeModel(model);
    if (m) return { in: m.priceIn, out: m.priceOut, cacheRead: m.priceCacheRead, cacheWrite: Math.round(m.priceIn * 1.25) };
  }
  if (provider === "scripted") return { in: 1 * M, out: 5 * M, cacheRead: 0.1 * M, cacheWrite: 1.25 * M };
  return null;
}

export interface TokenUsage {
  /** Input tokens billed at the normal rate (not read from or written to cache) */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Cost of one call in micro-dollars, or null when the price isn't known. */
export function costMicros(prices: Prices | null, u: TokenUsage): number | null {
  if (!prices) return null;
  const total = u.input * prices.in + u.output * prices.out + u.cacheRead * prices.cacheRead + u.cacheWrite * prices.cacheWrite;
  return Math.round(total / 1_000_000);
}

/** The Qatari riyal is pegged to the dollar at 3.64. */
export const QAR_PER_USD = 3.64;

/** micro-dollars → dirhams (hundredths of a riyal) */
export function microsToDirhams(micros: number): number {
  return Math.round((micros / 1_000_000) * QAR_PER_USD * 100);
}

export const FLOW_TONES = ["friendly", "concise", "formal", "playful"] as const;
export type FlowTone = (typeof FLOW_TONES)[number];

export const FLOW_AVATARS = ["orb", "falcon", "palm", "pearl", "crescent", "dhow", "star", "spark"] as const;
export type FlowAvatar = (typeof FLOW_AVATARS)[number];

export const FLOW_EFFORTS = ["low", "medium", "high"] as const;
export type FlowEffort = (typeof FLOW_EFFORTS)[number];

/** The name to show: the default "Flow" is written فلو in Arabic; a name someone chose stays as they typed it. */
export function flowDisplayName(name: string | null | undefined, locale: "en" | "ar"): string {
  const n = name?.trim() || "Flow";
  return n === "Flow" && locale === "ar" ? "فلو" : n;
}
