export type ExtractionResult = {
  title: string;
  claims: string[];
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Heuristics to reject blocks that are clearly not natural-language prose
function isGarbageBlock(raw: string): boolean {
  // CSS / inline styles: contain CSS curly braces
  if (/[{}]/.test(raw)) return true;

  // Wikipedia TOC entries: start with a digit and contain "Toggle" or "subsection"
  if (/^\d+[\s\u00a0]/.test(raw.trim()) && /Toggle|subsection/i.test(raw)) return true;

  return false;
}

export async function extractClaims(url: string): Promise<ExtractionResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25_000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        // Full Chrome 131 header set — Cloudflare bot detection inspects these
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        // Client hint headers Chrome sends automatically for HTTPS navigation
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        // Sec-Fetch headers — Cloudflare uses these to identify real browser navigations
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      redirect: 'follow',
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = (e as Error).name === 'AbortError'
      ? `Timed out fetching ${url} after 25 s`
      : `Failed to fetch ${url}: ${(e as Error).message}`;
    throw new Error(msg);
  }
  clearTimeout(timer);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const blocks: string[] = [];
  let current = '';
  let title = '';
  let ogTitle = '';
  let h1Text = '';
  let h1Done = false;
  // Track nesting depth of style/script elements so their text is suppressed
  let suppressDepth = 0;

  const rewriter = new HTMLRewriter()
    .on('title', {
      text(chunk) {
        title += chunk.text;
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        ogTitle = el.getAttribute('content') ?? '';
      },
    })
    .on('h1', {
      text(chunk) {
        if (!h1Done) h1Text += chunk.text;
      },
      element(el) {
        el.onEndTag(() => { h1Done = true; });
      },
    })
    // Suppress text inside <style> and <script> regardless of nesting
    .on('style, script, noscript', {
      element(el) {
        suppressDepth++;
        el.onEndTag(() => {
          suppressDepth--;
        });
      },
    })
    // Prose elements — include dd for FAQ/definition lists
    .on('p, blockquote, li, dd', {
      element(el) {
        if (suppressDepth > 0) return;
        if (current.trim()) {
          blocks.push(current.trim());
        }
        current = '';
        el.onEndTag(() => {
          if (suppressDepth > 0) {
            current = '';
            return;
          }
          if (current.trim()) {
            blocks.push(current.trim());
          }
          current = '';
        });
      },
      text(chunk) {
        if (suppressDepth > 0) return;
        current += chunk.text;
      },
    });

  await rewriter.transform(response).arrayBuffer();

  // Decode entities, reject garbage blocks, split into sentences
  const sentences = blocks
    .map((block) => decodeHtmlEntities(block))
    .filter((block) => !isGarbageBlock(block))
    .flatMap((block) =>
      block
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        // Must be long enough and end with terminal punctuation (complete sentences)
        .filter(
          (s) =>
            s.length >= 40 &&
            s.split(/\s+/).length >= 6 &&
            /[.!?]$/.test(s) &&
            !isGarbageBlock(s),
        ),
    );

  const bestTitle = ogTitle.trim() || h1Text.trim() || title.trim();
  return {
    title: decodeHtmlEntities(bestTitle),
    claims: [...new Set(sentences)],
  };
}
