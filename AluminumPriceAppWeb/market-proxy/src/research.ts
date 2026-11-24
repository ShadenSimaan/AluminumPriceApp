// The research core is shared with the desktop app's direct connection (src/market/research.ts).
// This file only wires it to the server's provider key and server-side page fetching.
import { anthropicCreateMessage, type Effort, type ResearchDeps } from "../../src/market/research.ts";
import { fetchPageText } from "./verify.ts";

export { DEFAULT_MODEL, ProviderError, runResearch, type ResearchDeps } from "../../src/market/research.ts";

export function anthropicDeps(apiKey: string, opts: { model?: string; effort?: Effort } = {}): ResearchDeps {
  return {
    createMessage: anthropicCreateMessage(apiKey),
    fetchPage: (url) => fetchPageText(url),
    model: opts.model,
    effort: opts.effort,
  };
}
