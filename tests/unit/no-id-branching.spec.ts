import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Static guard for principle P4: no evaluator source file may mention a recording id.
const SRC = path.resolve(__dirname, '..', '..', 'src');
const RECORDING_ID = /\bR(0[1-9]|1[0-2])\b/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('no recording-id literal appears anywhere under src/', () => {
  const files = walk(SRC).filter(f => f.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(5);
  const offenders = files.flatMap(f =>
    readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .map((line, i) => ({ f: path.relative(SRC, f), line: i + 1, text: line }))
      .filter(l => RECORDING_ID.test(l.text)),
  );
  expect(offenders).toEqual([]);
});
