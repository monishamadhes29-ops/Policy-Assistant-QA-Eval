import { test, expect } from '@playwright/test';
import liveCases from '../fixtures/live-cases.json';
import { evaluateLive } from '../../src/evaluate';
import { LiveCasesFileSchema } from '../../src/schemas';

// Designed tests D-01..D-14 (architect.md §12). Skipped — reported as NOT_RUN — without a live endpoint.
// Cases with `stub_provider_event` additionally need the fault-injecting provider stub (§12.2).

test.skip(!process.env.BASE_URL, 'NOT_RUN: no live endpoint configured');

for (const c of LiveCasesFileSchema.parse(liveCases)) {
  test(`${c.id}: ${c.requirement}`, async ({ request }) => {
    test.skip(Boolean(c.stub_provider_event) && !process.env.PROVIDER_STUB, `NOT_RUN: needs ${c.needs}`);
    const started = Date.now();
    const res = await request.post('/answer', {
      headers: c.headers,
      data: c.body,
      failOnStatusCode: false,
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    const observed = { http_status: res.status(), body, elapsed_ms: Date.now() - started };
    const result = evaluateLive(c, observed); // same checks as offline
    expect(result.checks.filter(x => x.verdict === 'FAIL'), JSON.stringify(result, null, 2)).toEqual([]);
  });
}
