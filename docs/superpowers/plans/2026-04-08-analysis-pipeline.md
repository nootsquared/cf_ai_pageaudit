# Analysis Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a background analysis pipeline that fetches a URL, extracts readable text, splits it into claims, searches each claim with Tavily, evaluates each with Llama 3.3 on Workers AI, and writes results back to the JobTracker Durable Object.

**Architecture:** Three new files handle distinct concerns — `extract.ts` (fetch + parse), `search.ts` (Tavily), `analyze.ts` (orchestration + AI). `index.ts` gains a single `ctx.waitUntil(runAnalysis(...))` call. The DO's existing `POST /` route receives all state updates unchanged.

**Tech Stack:** Cloudflare Workers, HTMLRewriter, Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`), Tavily Search API, TypeScript

---

### Task 1: Add `TAVILY_API_KEY` to the Env type

**Files:**
- Modify: `workers/worker-configuration.d.ts` (lines 14)

Secrets aren't emitted by `wrangler types`, so we add it manually to the global `Env` interface. This makes `env.TAVILY_API_KEY` type-safe across all files.

- [ ] **Step 1: Update the `Env` interface**

Replace line 14 in `workers/worker-configuration.d.ts`:

```ts
// Before
interface Env extends Cloudflare.Env {}

// After
interface Env extends Cloudflare.Env {
  TAVILY_API_KEY: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add workers/worker-configuration.d.ts
git commit -m "chore: add TAVILY_API_KEY to Env type"
```

---

### Task 2: Create `src/extract.ts`

**Files:**
- Create: `workers/src/extract.ts`

Uses `HTMLRewriter` to stream-parse the fetched HTML, collecting text only from content elements (`p`, `h1`–`h6`, `li`, `blockquote`, `td`). Splits the collected blocks into sentences and filters out anything too short to be a meaningful claim.

- [ ] **Step 1: Create the file**

Create `workers/src/extract.ts` with the following content:

```ts
export async function extractClaims(url: string): Promise<string[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const blocks: string[] = [];
  let current = '';

  // Collect text block-by-block from content elements.
  // Each element handler resets `current` on open and flushes on close.
  const rewriter = new HTMLRewriter()
    .on('p, h1, h2, h3, h4, h5, h6, li, blockquote, td', {
      element(el) {
        if (current.trim()) {
          blocks.push(current.trim());
        }
        current = '';
        el.onEndTag(() => {
          if (current.trim()) {
            blocks.push(current.trim());
          }
          current = '';
        });
      },
      text(chunk) {
        current += chunk.text;
      },
    });

  await rewriter.transform(response).arrayBuffer();

  // Split each block into sentences, filter short ones
  const sentences = blocks.flatMap((block) =>
    block
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 40 && s.split(/\s+/).length >= 6)
  );

  // Deduplicate
  return [...new Set(sentences)];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `workers/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add workers/src/extract.ts
git commit -m "feat: add HTML text extraction and claim splitting"
```

---

### Task 3: Create `src/search.ts`

**Files:**
- Create: `workers/src/search.ts`

Wraps the Tavily `/search` endpoint. Returns an empty array on any error so failures never block the rest of the pipeline.

- [ ] **Step 1: Create the file**

Create `workers/src/search.ts` with the following content:

```ts
export type TavilyResult = {
  title: string;
  url: string;
  content: string;
};

export async function searchClaim(
  claim: string,
  apiKey: string
): Promise<TavilyResult[]> {
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: claim,
        search_depth: 'basic',
        max_results: 3,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json<{ results: TavilyResult[] }>();
    return data.results ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `workers/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add workers/src/search.ts
git commit -m "feat: add Tavily search wrapper"
```

---

### Task 4: Create `src/analyze.ts`

**Files:**
- Create: `workers/src/analyze.ts`

Orchestrates the full pipeline. Sets the job to `"processing"`, extracts claims, processes them in batches of 5 (search + AI per claim), then writes `"complete"` or `"error"` back to the DO stub.

- [ ] **Step 1: Create the file**

Create `workers/src/analyze.ts` with the following content:

```ts
import type { Claim } from './index';
import { extractClaims } from './extract';
import { searchClaim, TavilyResult } from './search';

async function evaluateClaim(
  claim: string,
  evidence: TavilyResult[],
  env: Env
): Promise<Claim> {
  const evidenceText =
    evidence.length > 0
      ? evidence.map((r, i) => `${i + 1}. ${r.title} — ${r.content}`).join('\n')
      : 'No evidence found.';

  try {
    const result = (await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any, {
      messages: [
        {
          role: 'system',
          content:
            'You are a fact-checker. Given a claim and web search results as evidence, respond with ONLY a valid JSON object with two fields: "verdict" (must be exactly one of: "true", "false", "uncertain") and "explanation" (one sentence summarizing your reasoning). Do not include any text outside the JSON object.',
        },
        {
          role: 'user',
          content: `Claim: ${claim}\nEvidence:\n${evidenceText}`,
        },
      ],
    })) as { response: string };

    // Extract JSON — model sometimes wraps it in markdown code fences
    const jsonMatch = result.response.trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]) as { verdict: string; explanation: string };
    if (!['true', 'false', 'uncertain'].includes(parsed.verdict)) {
      throw new Error(`Invalid verdict: ${parsed.verdict}`);
    }

    return {
      text: claim,
      verdict: parsed.verdict as Claim['verdict'],
      explanation: String(parsed.explanation),
    };
  } catch {
    return { text: claim, verdict: 'uncertain', explanation: 'Could not evaluate.' };
  }
}

async function postToStub(stub: DurableObjectStub, patch: Record<string, unknown>): Promise<void> {
  await stub.fetch('https://do.internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function runAnalysis(
  stub: DurableObjectStub,
  url: string,
  env: Env
): Promise<void> {
  try {
    await postToStub(stub, { status: 'processing' });

    const claimTexts = await extractClaims(url);
    const allClaims: Claim[] = [];
    const batchSize = 5;

    for (let i = 0; i < claimTexts.length; i += batchSize) {
      const batch = claimTexts.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (claim) => {
          const evidence = await searchClaim(claim, env.TAVILY_API_KEY);
          return evaluateClaim(claim, evidence, env);
        })
      );
      allClaims.push(...results);
    }

    await postToStub(stub, { status: 'complete', claims: allClaims });
  } catch (e) {
    await postToStub(stub, { status: 'error', error: String(e) });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `workers/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add workers/src/analyze.ts
git commit -m "feat: add analysis orchestration with batched AI evaluation"
```

---

### Task 5: Wire `runAnalysis` into `src/index.ts`

**Files:**
- Modify: `workers/src/index.ts`

Two changes: import `runAnalysis`, and call `ctx.waitUntil(runAnalysis(...))` after job initialization in `POST /jobs`.

- [ ] **Step 1: Add the import at the top of `workers/src/index.ts`**

After the existing `import { DurableObject } from "cloudflare:workers";` line, add:

```ts
import { runAnalysis } from './analyze';
```

- [ ] **Step 2: Add `ctx.waitUntil` in the `POST /jobs` handler**

Find this block in `index.ts`:

```ts
      await stub.fetch(initUrl.toString());

      return Response.json({ jobId }, { status: 201 });
```

Replace it with:

```ts
      await stub.fetch(initUrl.toString());

      ctx.waitUntil(runAnalysis(stub, body.url, env));

      return Response.json({ jobId }, { status: 201 });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `workers/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add workers/src/index.ts
git commit -m "feat: wire runAnalysis into POST /jobs background task"
```

---

### Task 6: Register the Tavily secret and smoke test

**Files:** none (config + manual verification)

- [ ] **Step 1: Add the Tavily secret to your local `.dev.vars` file**

Create `workers/.dev.vars` (used by `wrangler dev` for local secrets, gitignored):

```
TAVILY_API_KEY=your_actual_tavily_api_key_here
```

Verify `.dev.vars` is in `workers/.gitignore`. If not, add it:
```bash
echo ".dev.vars" >> workers/.gitignore
git add workers/.gitignore
git commit -m "chore: gitignore .dev.vars"
```

- [ ] **Step 2: Start the dev server**

Run from `workers/`:
```bash
npm run dev
```
Expected: starts on `http://localhost:8787` with no errors. You should see `env.TAVILY_API_KEY` listed as a bound secret in the output.

- [ ] **Step 3: Submit a job and poll for results**

```bash
# Submit
JOB_ID=$(curl -s -X POST http://localhost:8787/jobs \
  -H "Content-Type: application/json" \
  -d '{"url": "https://en.wikipedia.org/wiki/Cloudflare"}' | jq -r '.jobId')
echo "Job ID: $JOB_ID"

# Poll until complete (run this a few times over ~30 seconds)
curl -s "http://localhost:8787/jobs/$JOB_ID" | jq '{status: .status, claimCount: (.claims | length)}'
```

Expected progression:
1. First poll: `{ "status": "processing", "claimCount": 0 }`
2. Later poll: `{ "status": "complete", "claimCount": <N> }`

- [ ] **Step 4: Inspect a few claims**

```bash
curl -s "http://localhost:8787/jobs/$JOB_ID" | jq '.claims[:3]'
```

Expected: array of objects each with `text`, `verdict` (`"true"`, `"false"`, or `"uncertain"`), and `explanation`.
