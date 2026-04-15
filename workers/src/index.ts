import { FactCheckAgent } from './agent';

// ─── Re-export FactCheckAgent so wrangler can find it ────────────────────────
export { FactCheckAgent };

// ─── Shared Types (consumed by agent.ts, extract.ts, trust.ts, etc.) ─────────

export type JobStatus = "pending" | "processing" | "complete" | "error";

export type JobPhase =
  | "queued"
  | "fetching"
  | "extracting"
  | "analyzing"
  | "complete"
  | "error";

export type ClaimSource = {
  domain: string;
  tier: "primary" | "academic" | "factcheck" | "news";
  weight: number;
};

export type Claim = {
  text: string;
  verdict: "true" | "false" | "uncertain";
  explanation: string;
  sources: ClaimSource[];
};

export type AgentKey = "fetch" | "extract" | "evidence" | "judge";

export type TaskStatus = "pending" | "running" | "done" | "error";

export type TaskLogEntry = {
  id: string;
  agent: AgentKey;
  label: string;
  status: TaskStatus;
  ts: number;
};

export type JobState = {
  id: string;
  url: string;
  title?: string;
  status: JobStatus;
  phase: JobPhase;
  totalClaims: number;
  processedClaims: number;
  claims: Claim[];
  tasks: TaskLogEntry[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function jsonCors(data: unknown, init: ResponseInit = {}): Response {
  return withCors(Response.json(data, init));
}

// ─── Worker Fetch Handler ─────────────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // ── POST /verify ──────────────────────────────────────────────────────────
    if (request.method === "POST" && parts[0] === "verify" && parts.length === 1) {
      let body: { url?: unknown };
      try {
        body = await request.json();
      } catch {
        return jsonCors({ ok: false, error: "Invalid JSON body" }, { status: 400 });
      }
      if (!body.url || typeof body.url !== "string") {
        return jsonCors(
          { ok: false, error: "Missing required field: url" },
          { status: 400 },
        );
      }

      let parsed: URL;
      try {
        parsed = new URL(body.url);
      } catch {
        return jsonCors({ ok: false, error: "Invalid URL format" }, { status: 400 });
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return jsonCors(
          { ok: false, error: "URL must use http or https" },
          { status: 400 },
        );
      }

      const UA_BROWSER =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

      // ── 1. Try HEAD first (no body download, fast) ───────────────────────────
      try {
        const headAc = new AbortController();
        const headTimer = setTimeout(() => headAc.abort(), 5_000);
        const headRes = await fetch(parsed.toString(), {
          method: "HEAD",
          headers: { "User-Agent": UA_BROWSER },
          redirect: "follow",
          signal: headAc.signal,
        });
        clearTimeout(headTimer);
        return jsonCors({ ok: true, status: headRes.status });
      } catch {
        // HEAD timed out or the server rejected it — fall through to GET
      }

      // ── 2. Fallback: GET with short timeout ──────────────────────────────────
      try {
        const getAc = new AbortController();
        const getTimer = setTimeout(() => getAc.abort(), 8_000);
        const getRes = await fetch(parsed.toString(), {
          method: "GET",
          headers: {
            "User-Agent": UA_BROWSER,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          redirect: "follow",
          signal: getAc.signal,
        });
        clearTimeout(getTimer);
        return jsonCors({ ok: true, status: getRes.status });
      } catch {
        // GET also failed — fall through to fail-open
      }

      // ── 3. Fail-open: if we can't probe the URL, assume it may be reachable ──
      // Some sites block bot probes (JS challenges, IP filtering, etc.) but are
      // perfectly valid. Let the job attempt the analysis and fail gracefully if
      // the URL truly cannot be fetched.
      return jsonCors({ ok: true, status: 0 });
    }

    // ── POST /jobs — create a new fact-check job ──────────────────────────────
    if (request.method === "POST" && parts[0] === "jobs" && parts.length === 1) {
      let body: { url?: unknown };
      try {
        body = await request.json();
      } catch {
        return jsonCors({ error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.url || typeof body.url !== "string") {
        return jsonCors(
          { error: "Missing required field: url" },
          { status: 400 },
        );
      }

      const jobId = crypto.randomUUID();

      // Get the FactCheckAgent stub for this job
      const stub = env.FACT_CHECK_AGENT.get(
        env.FACT_CHECK_AGENT.idFromName(jobId),
      );

      // Initialise the agent state AND kick off the agentic analysis.
      // x-partykit-room is required by partyserver (used by the agents package)
      // to identify the DO instance; without it Server.fetch swallows the error.
      const initUrl = new URL("https://do.internal/");
      initUrl.searchParams.set("id", jobId);
      initUrl.searchParams.set("url", body.url);
      await stub.fetch(initUrl.toString(), {
        headers: { "x-partykit-room": jobId },
      });

      return jsonCors({ jobId }, { status: 201 });
    }

    // ── GET /jobs/:id — poll job state ────────────────────────────────────────
    if (
      request.method === "GET" &&
      parts[0] === "jobs" &&
      parts.length === 2
    ) {
      const jobId = parts[1];
      const stub = env.FACT_CHECK_AGENT.get(
        env.FACT_CHECK_AGENT.idFromName(jobId),
      );
      const doRes = await stub.fetch("https://do.internal/", {
        headers: { "x-partykit-room": jobId },
      });
      const body = await doRes.json();
      return jsonCors(body, { status: doRes.status });
    }

    return withCors(new Response("Not Found", { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
