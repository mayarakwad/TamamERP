import "server-only";
import { z } from "zod";
import type { Workspace } from "../../auth/dal";
import type { Formatter } from "../../format";
import type { Locale, TFunction } from "../../i18n";
import type { School } from "../../school/scope";
import type { PageContext, ProposalView, ToolSpec, ToolUi } from "../types";

// A Flow tool: a name and description the model reads, a Zod schema that
// every input is validated against before anything runs, and a function
// that runs as the person asking (their permissions, their campus).

export interface FlowCtx {
  ws: Workspace;
  slug: string;
  locale: Locale;
  t: TFunction;
  fmt: Formatter;
  now: Date;
  conversationId: string;
  /** The school view of this person (null outside schools); loaded on first use */
  school: () => Promise<School | null>;
  page?: PageContext | null;
}

export interface ToolOutcome {
  /** What the model reads; objects are sent as JSON */
  content: unknown;
  ui: ToolUi;
  isError?: boolean;
  proposal?: ProposalView;
}

export type ToolKind = "read" | "propose" | "client";

export interface FlowTool<S extends z.ZodType = z.ZodType> {
  name: string;
  kind: ToolKind;
  description: string | ((ws: Workspace) => string);
  input: S;
  available(ws: Workspace): boolean;
  run(ctx: FlowCtx, input: z.output<S>, callId: string): Promise<ToolOutcome>;
}

export function defineTool<S extends z.ZodType>(t: FlowTool<S>): FlowTool<S> {
  return t;
}

/** JSON Schema for the provider (inputs: fields with defaults are optional). */
export function toSpec(tool: FlowTool, ws: Workspace): ToolSpec {
  const schema = z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return { name: tool.name, description: typeof tool.description === "function" ? tool.description(ws) : tool.description, parameters: schema };
}

/** A tool error the model can read and recover from. */
export function toolError(message: string, label: string): ToolOutcome {
  return { content: { error: message }, ui: { label }, isError: true };
}

export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Start of a Doha calendar day */
export function dohaDay(date: string): Date {
  return new Date(`${date}T00:00:00+03:00`);
}

/** Money for the model: riyals as a number */
export const riyals = (dirhams: number) => Math.round(dirhams) / 100;

/** "/w/slug/claims/123" → "claims/123" */
export function stripWorkspace(link: string, slug: string): string {
  let l = link.trim();
  try {
    if (/^https?:\/\//.test(l)) l = new URL(l).pathname + new URL(l).search;
  } catch {}
  l = l.replace(/^\/+/, "");
  const prefix = `w/${slug}/`;
  if (l.startsWith(prefix)) l = l.slice(prefix.length);
  else if (l === `w/${slug}`) l = "";
  return l;
}
