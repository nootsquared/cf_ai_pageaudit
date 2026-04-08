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
