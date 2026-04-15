# SiteSeer

An AI-powered misinformation detector. Paste any URL and SiteSeer fetches the page, extracts factual claims, searches for evidence across trusted sources, and returns a per-claim verdict in real time.

**Live:** [cf-ai-siteseer.pages.dev](https://cf-ai-siteseer.pages.dev)

**Try it with:** [The Flat Earth Society FAQ](https://www.theflatearthsociety.org/home/index.php/about-the-society/faq)

---

## How It Works

1. Enter a URL in the search bar and press Enter
2. SiteSeer fetches and parses the page content
3. Llama 3.3 70B (via Cloudflare Workers AI) filters sentences down to verifiable factual claims
4. Each claim is searched against the web via Tavily, with sources ranked by credibility tier (government, academic, fact-check, news)
5. The LLM evaluates each claim against the evidence and returns a verdict: **true**, **false**, or **uncertain**
6. Results appear live as analysis completes

---

## Cloudflare Stack

| Component | What it does |
|-----------|-------------|
| **Workers AI** (Llama 3.3 70B) | Claim extraction, query generation, verdict evaluation |
| **Durable Objects** | Persistent job state that tracks progress and results across requests |
| **Cloudflare Pages** | Hosts the React frontend |
| **Cloudflare Worker** | API layer that orchestrates the full analysis pipeline |

External dependency: **Tavily API** for web search.

---

## Local Setup

### Prerequisites
- Node.js 18+
- A [Cloudflare account](https://cloudflare.com) with Workers AI enabled
- A [Tavily API key](https://tavily.com)

### 1. Clone and install

```bash
git clone https://github.com/nootsquared/cf_ai_siteseer.git
cd cf_ai_siteseer
npm install
cd workers && npm install && cd ..
```

### 2. Configure the worker

Create `workers/.dev.vars`:

```
TAVILY_API_KEY=your_tavily_key_here
```

### 3. Run locally

In one terminal, start the worker:
```bash
cd workers
npx wrangler dev --remote
```

In another, start the frontend:
```bash
npm run dev
```

Frontend runs at `http://localhost:5173`, worker at `http://localhost:8787`.

---

## Deploying

### Worker (backend)

```bash
cd workers
npx wrangler deploy
npx wrangler secret put TAVILY_API_KEY
```

Copy the worker URL printed after deploy (e.g. `https://siteseer-api.<subdomain>.workers.dev`).

### Frontend (Cloudflare Pages)

In the Cloudflare dashboard, create a Pages project connected to this repo with:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `VITE_WORKER_URL` = your worker URL |
