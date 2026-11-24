// Node entry (any VPS / container / local test): node --experimental-strip-types src/node.ts
// Reads the same variables as the Worker from the process environment. Put it behind HTTPS in production.
import { createServer } from "node:http";
import { handle, type Env } from "./handler.ts";

const env: Env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  MARKET_APP_TOKEN: process.env.MARKET_APP_TOKEN,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  MARKET_MODEL: process.env.MARKET_MODEL,
  MARKET_EFFORT: process.env.MARKET_EFFORT,
  MARKET_FIXTURES: process.env.MARKET_FIXTURES,
};
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const method = req.method ?? "GET";
  const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" || method === "OPTIONS" ? undefined : Buffer.concat(chunks),
  });
  const response = await handle(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, host, () => {
  console.log(`market-proxy listening on http://${host}:${port} (${env.MARKET_FIXTURES === "1" ? "FIXTURE MODE" : "live"})`);
});
