import { DurableObject } from "cloudflare:workers";

// ─── Shared Types ────────────────────────────────────────────────────────────
// These are the public contract. When adding AI later, import these in the
// analysis function so it can POST patches back to the DO.

export type JobStatus = "pending" | "processing" | "complete" | "error";

export type Claim = {
  text: string;
  verdict: "true" | "false" | "uncertain";
  explanation: string;
};

export type JobState = {
  id: string;
  url: string;
  status: JobStatus;
  claims: Claim[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};

// ─── Durable Object ──────────────────────────────────────────────────────────

export class JobTracker extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const reqUrl = new URL(request.url);

    if (request.method === "GET") {
      const state = await this.ctx.storage.get<JobState>("job");

      if (!state) {
        // Initialization path: called by POST /jobs with id + url params
        const id = reqUrl.searchParams.get("id");
        const jobUrl = reqUrl.searchParams.get("url");

        if (id && jobUrl) {
          const now = Date.now();
          const newState: JobState = {
            id,
            url: jobUrl,
            status: "pending",
            claims: [],
            createdAt: now,
            updatedAt: now,
          };
          await this.ctx.storage.put("job", newState);
          return Response.json(newState, { status: 201 });
        }

        // Status check on a non-existent job
        return Response.json({ error: "Job not found" }, { status: 404 });
      }

      return Response.json(state);
    }

    if (request.method === "POST") {
      // Patch path: called to update status/claims/error.
      // id, url, and createdAt are immutable — preserved from stored state.
      // To add AI later: POST { status: "processing" } before the AI call,
      // then POST { status: "complete", claims: [...] } or { status: "error", error: "..." }.
      const existing = await this.ctx.storage.get<JobState>("job");
      if (!existing) {
        return Response.json({ error: "Job not found" }, { status: 404 });
      }

      const patch = await request.json<Partial<JobState>>();
      const updated: JobState = {
        ...existing,
        ...patch,
        id: existing.id,
        url: existing.url,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      };
      await this.ctx.storage.put("job", updated);
      return Response.json(updated);
    }

    return new Response("Method Not Allowed", { status: 405 });
  }
}

// ─── Worker Fetch Handler ────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // POST /jobs — submit a URL, get back a job ID
    if (request.method === "POST" && parts[0] === "jobs" && parts.length === 1) {
      let body: { url?: unknown };
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.url || typeof body.url !== "string") {
        return Response.json({ error: "Missing required field: url" }, { status: 400 });
      }

      const jobId = crypto.randomUUID();
      const stub = env.JOB_TRACKER.get(env.JOB_TRACKER.idFromName(jobId));

      // Initialize the DO state by calling GET with id + url params
      const initUrl = new URL("https://do.internal/");
      initUrl.searchParams.set("id", jobId);
      initUrl.searchParams.set("url", body.url);
      await stub.fetch(initUrl.toString());

      return Response.json({ jobId }, { status: 201 });
    }

    // GET /jobs/:id — check status and results
    if (request.method === "GET" && parts[0] === "jobs" && parts.length === 2) {
      const jobId = parts[1];
      const stub = env.JOB_TRACKER.get(env.JOB_TRACKER.idFromName(jobId));
      const doRes = await stub.fetch("https://do.internal/");

      // Preserve the DO's status code (404 if job not found)
      const body = await doRes.json();
      return Response.json(body, { status: doRes.status });
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
} satisfies ExportedHandler<Env>;
