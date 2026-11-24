// Cloudflare Workers entry. Secrets: ANTHROPIC_API_KEY, MARKET_APP_TOKEN (wrangler secret put ...).
import { handle, type Env } from "./handler.ts";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
