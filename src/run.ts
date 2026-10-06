import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateAll } from './evaluate';
import { EvaluatorInputError, loadDataset, ROOT_DIR } from './loader';
import { buildReport, renderMarkdown } from './report';
import { isBlocking } from './verdict';

/**
 * CLI (§6.7, §13.2). Exit codes: 0 = all product checks PASS; 1 = at least one product FAIL or
 * blocking NOT_EVALUATED (expected for this dataset); 2 = evaluator/input error.
 */
function parseArgs(argv: string[]): { only: string[] | null; out: string } {
  let only: string[] | null = null;
  let out = path.join(ROOT_DIR, 'reports');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') {
      const v = argv[++i];
      if (!v) throw new EvaluatorInputError('--only needs a recording id');
      only = [...(only ?? []), ...v.split(',').map(s => s.trim()).filter(Boolean)];
    } else if (a === '--out') {
      const v = argv[++i];
      if (!v) throw new EvaluatorInputError('--out needs a directory');
      out = path.resolve(v);
    } else {
      throw new EvaluatorInputError(`unknown argument: ${a}`);
    }
  }
  return { only, out };
}

function main(): number {
  const { only, out } = parseArgs(process.argv.slice(2));
  const ds = loadDataset();
  // Every recording is always evaluated; --only filters what is reported (reproduction aid).
  const all = evaluateAll(ds);
  if (only) {
    const unknown = only.filter(id => !all.some(r => r.recording_id === id));
    if (unknown.length) throw new EvaluatorInputError(`--only: unknown recording id(s) ${unknown.join(', ')}`);
  }
  const results = only ? all.filter(r => only.includes(r.recording_id)) : all;
  const report = buildReport(results, ds, only);

  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  writeFileSync(path.join(out, 'report.md'), renderMarkdown(report), 'utf8');

  const s = report.summary.recordings;
  for (const r of results) {
    const failing = r.checks.filter(c => c.verdict === 'FAIL').map(c => c.rule);
    console.log(`${r.recording_id.padEnd(4)} ${r.verdict.padEnd(14)} ${failing.join(', ')}`);
  }
  console.log(`\n${s.pass}/${s.total} PASS, ${s.fail} FAIL, ${s.not_evaluated} NOT_EVALUATED`);
  console.log(`${report.designed_tests.length} designed live tests NOT_RUN`);
  console.log(`Report written to ${path.relative(process.cwd(), out) || '.'}${path.sep}report.{json,md}`);
  return results.some(isBlocking) ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof EvaluatorInputError) {
    console.error(`Evaluator input error: ${e.message}`);
    process.exitCode = 2;
  } else {
    console.error(e);
    process.exitCode = 2;
  }
}
