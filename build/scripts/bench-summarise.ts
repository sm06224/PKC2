/**
 * Aggregate `bench-results/*.json` into a markdown summary.
 *
 * Per-scenario JSON shape (written by tests/bench/profile.bench.ts):
 *   {
 *     scale: 'c-1000',
 *     entries: 1000,
 *     scenario: 'cold-boot',
 *     bootElapsedMs: number,
 *     heapUsedMb: number | null,
 *     measures: [{ name, startTime, duration }, ...],
 *     capturedAt: ISO string
 *   }
 *
 * Output:
 *   - `bench-results/SUMMARY.md` (human readable)
 *   - `bench-results/SUMMARY.json` (machine readable, used by CI
 *     diffing in the future)
 *
 * Aggregation rule for `measures`: group by `name`, take
 * count + sum + p50 + p95 + max. p50/p95 use the standard
 * sorted-array nearest-rank approach; small samples (< 4) report
 * the full set.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

interface ProfileEntry {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
}

interface ScenarioResult {
  readonly scale: string;
  readonly entries: number;
  readonly scenario: string;
  readonly bootElapsedMs: number;
  readonly heapUsedMb: number | null;
  readonly measures: readonly ProfileEntry[];
  readonly capturedAt: string;
}

interface Aggregate {
  readonly name: string;
  readonly count: number;
  readonly sumMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

function aggregate(measures: readonly ProfileEntry[]): readonly Aggregate[] {
  const byName = new Map<string, number[]>();
  for (const m of measures) {
    if (!byName.has(m.name)) byName.set(m.name, []);
    byName.get(m.name)!.push(m.duration);
  }
  const out: Aggregate[] = [];
  for (const [name, durations] of byName.entries()) {
    const sorted = [...durations].sort((a, b) => a - b);
    out.push({
      name,
      count: sorted.length,
      sumMs: +sorted.reduce((a, b) => a + b, 0).toFixed(2),
      p50Ms: +quantile(sorted, 0.5).toFixed(2),
      p95Ms: +quantile(sorted, 0.95).toFixed(2),
      maxMs: +sorted[sorted.length - 1]!.toFixed(2),
    });
  }
  // Sort by total time desc — the largest sumMs is usually the
  // first thing worth optimising.
  out.sort((a, b) => b.sumMs - a.sumMs);
  return out;
}

function loadResults(dir: string): readonly ScenarioResult[] {
  const out: ScenarioResult[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const f of entries) {
    if (!f.endsWith('.json')) continue;
    if (f === 'SUMMARY.json') continue;
    const path = resolve(dir, f);
    if (!statSync(path).isFile()) continue;
    const raw = readFileSync(path, 'utf-8');
    try {
      out.push(JSON.parse(raw) as ScenarioResult);
    } catch {
      console.warn(`[bench-summarise] skipping malformed ${f}`);
    }
  }
  // Stable order: scale ascending, then scenario.
  out.sort((a, b) =>
    a.entries !== b.entries
      ? a.entries - b.entries
      : a.scenario.localeCompare(b.scenario),
  );
  return out;
}

function fmtTable(rows: readonly Aggregate[], topN = 12): string {
  const lines: string[] = [];
  lines.push('| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |');
  lines.push('|---|---|---|---|---|---|');
  for (const a of rows.slice(0, topN)) {
    lines.push(
      `| \`${a.name}\` | ${a.count} | ${a.sumMs} | ${a.p50Ms} | ${a.p95Ms} | ${a.maxMs} |`,
    );
  }
  return lines.join('\n');
}

function summariseMarkdown(results: readonly ScenarioResult[]): string {
  const lines: string[] = [];
  lines.push('# Profile bench summary (PR #176)');
  lines.push('');
  lines.push(
    '_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._',
  );
  lines.push('');
  if (results.length === 0) {
    lines.push('*No bench results found in `bench-results/`. Did you run `npm run bench:run`?*');
    return lines.join('\n');
  }
  lines.push('## Cold-boot wall clock');
  lines.push('');
  lines.push('| scale | entries | boot enter→exit (ms) | heap used (MB) |');
  lines.push('|---|---|---|---|');
  for (const r of results) {
    if (r.scenario !== 'cold-boot') continue;
    lines.push(
      `| ${r.scale} | ${r.entries} | ${r.bootElapsedMs.toFixed(1)} | ${r.heapUsedMb ?? '—'} |`,
    );
  }
  lines.push('');
  for (const r of results) {
    lines.push(`## ${r.scale} (${r.entries} entries) — \`${r.scenario}\``);
    lines.push('');
    if (r.bootElapsedMs >= 0) {
      lines.push(`- boot enter→exit: **${r.bootElapsedMs.toFixed(1)} ms**`);
    }
    if (r.heapUsedMb !== null) {
      lines.push(`- heap used: **${r.heapUsedMb} MB**`);
    }
    lines.push(`- captured: ${r.capturedAt}`);
    lines.push('');
    const agg = aggregate(r.measures);
    if (agg.length === 0) {
      lines.push('*(no measures recorded)*');
    } else {
      lines.push(fmtTable(agg));
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main(): void {
  const resultsDir = resolve(process.cwd(), 'bench-results');
  const results = loadResults(resultsDir);
  const md = summariseMarkdown(results);
  writeFileSync(resolve(resultsDir, 'SUMMARY.md'), md);
  writeFileSync(
    resolve(resultsDir, 'SUMMARY.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        scenarios: results.map((r) => ({
          scale: r.scale,
          entries: r.entries,
          scenario: r.scenario,
          bootElapsedMs: r.bootElapsedMs,
          heapUsedMb: r.heapUsedMb,
          aggregate: aggregate(r.measures),
        })),
      },
      null,
      2,
    ),
  );
  // eslint-disable-next-line no-console
  console.log(`[bench-summarise] wrote ${results.length} scenarios → bench-results/SUMMARY.{md,json}`);
}

main();
