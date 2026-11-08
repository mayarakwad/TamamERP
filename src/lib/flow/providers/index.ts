import "server-only";
import { PROVIDERS, type FlowProvider } from "../models";
import type { FlowAdapter } from "../types";
import { anthropicAdapter } from "./anthropic";
import { openAIAdapter } from "./openai";
import { scriptedAdapter, scriptedEnabled } from "./scripted";

export function adapterFor(provider: FlowProvider): FlowAdapter | null {
  switch (provider) {
    case "anthropic":
      return anthropicAdapter;
    case "openai":
      return openAIAdapter();
    case "google":
      return openAIAdapter(PROVIDERS.google.baseUrl);
    case "compatible":
      return openAIAdapter();
    case "scripted":
      return scriptedEnabled() ? scriptedAdapter : null;
    default:
      return null;
  }
}
