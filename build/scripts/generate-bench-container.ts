/**
 * Synthetic container generator for PR #176 profile wave.
 *
 * Produces a deterministic Container fixture at the requested
 * scale, sized for repeatable benchmark runs. The fixture is
 * written as a plain JSON file (not zipped) so the Playwright
 * bench can `JSON.parse` it directly into IndexedDB seed.
 *
 * Determinism: a small splitmix64-style PRNG seeded by
 * `--seed=<n>` (default `1`) drives all entry/relation choices.
 * Same seed + same scale → byte-identical output, so bench runs
 * are comparable across days.
 *
 * Usage:
 *   tsx build/scripts/generate-bench-container.ts \
 *     --entries=1000 --textlogs=20 --assets=50 \
 *     --output=bench-fixtures/c-1000.json
 *
 * Defaults match the four bench scales the findings doc uses:
 *   100 entries (control / fast)
 *   500 entries (typical user)
 *   1000 entries (power user)
 *   5000 entries (stress)
 *
 * Composition (per 1000 entries):
 *   ~70%  text       — 200-2000 chars markdown body, mixed inline asset refs
 *   ~10%  textlog    — 5-30 log entries each, 50-500 chars
 *   ~10%  todo       — open / done split 60/40, half with date
 *   ~5%   folder     — sprinkled, some hold textlog/text children
 *   ~5%   attachment — points at an asset key in container.assets
 *
 * No browser APIs — pure node script. Output JSON is the
 * `Container` shape from `src/core/model/container.ts`.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface Args {
  entries: number;
  textlogs: number;
  assets: number;
  output: string;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    entries: 1000,
    textlogs: 20,
    assets: 50,
    output: 'bench-fixtures/c-1000.json',
    seed: 1,
  };
  for (const a of argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (!k || v === undefined) continue;
    switch (k) {
      case 'entries':
        out.entries = Math.max(0, parseInt(v, 10) || 0);
        break;
      case 'textlogs':
        out.textlogs = Math.max(0, parseInt(v, 10) || 0);
        break;
      case 'assets':
        out.assets = Math.max(0, parseInt(v, 10) || 0);
        break;
      case 'output':
        out.output = v;
        break;
      case 'seed':
        out.seed = parseInt(v, 10) || 1;
        break;
      default:
        console.warn(`[gen-bench] unknown arg: --${k}`);
    }
  }
  return out;
}

// ── deterministic PRNG (splitmix64-ish, JS-safe) ───────────────────────────
function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length)]!;
}

const T0 = '2026-04-01T00:00:00.000Z';
const WORDS = [
  'meeting', 'review', 'launch', 'spec', 'draft', 'ship', 'rollback',
  'audit', 'profile', 'ASSETS', 'TODOS', 'kickoff', 'retro', 'dependencies',
  'lambda', 'stack', 'queue', 'cache', 'budget', 'token', 'guard',
  'hydrate', 'orphan', 'index', 'walk', 'parse', 'render', 'dispatch',
];

function paragraph(rng: () => number, words: number): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(pick(rng, WORDS));
  return out.join(' ');
}

function genTextBody(rng: () => number, assetKeys: readonly string[]): string {
  const paragraphs = pickInt(rng, 1, 6);
  const parts: string[] = [];
  for (let p = 0; p < paragraphs; p++) {
    const len = pickInt(rng, 8, 80);
    parts.push(paragraph(rng, len));
    if (rng() < 0.25 && assetKeys.length > 0) {
      const k = pick(rng, assetKeys);
      parts.push(`![${pick(rng, WORDS)}](asset:${k})`);
    }
    if (rng() < 0.2) {
      // Insert a heading every now and then to give the markdown
      // renderer + sub-location indexer something to chew on.
      parts.push(`\n## ${paragraph(rng, pickInt(rng, 2, 5))}\n`);
    }
  }
  return parts.join('\n\n');
}

function genTextlogBody(rng: () => number, assetKeys: readonly string[]): string {
  const count = pickInt(rng, 5, 30);
  const entries: Array<{
    id: string;
    text: string;
    created_at: string;
    flags?: readonly string[];
  }> = [];
  for (let i = 0; i < count; i++) {
    const text = paragraph(rng, pickInt(rng, 10, 100))
      + (rng() < 0.2 && assetKeys.length > 0
        ? ` ![${pick(rng, WORDS)}](asset:${pick(rng, assetKeys)})`
        : '');
    entries.push({ id: `log-${i}`, text, created_at: T0, flags: [] });
  }
  return JSON.stringify({ entries });
}

function genTodoBody(rng: () => number): string {
  const status = rng() < 0.6 ? 'open' : 'done';
  const description = paragraph(rng, pickInt(rng, 3, 15));
  const hasDate = rng() < 0.5;
  const day = pickInt(rng, 1, 28);
  const date = hasDate ? `2026-04-${String(day).padStart(2, '0')}` : undefined;
  return JSON.stringify({ status, description, ...(date ? { date } : {}) });
}

function genAttachmentBody(assetKey: string, name: string): string {
  return JSON.stringify({
    name,
    mime: 'image/png',
    size: 1024,
    asset_key: assetKey,
  });
}

// Real asset bytes are *not* generated — we only want to exercise
// reference scanning and metadata. Each "asset" is a small base64
// payload (~0.3 KB) so the bench focuses on entry/relation walks
// rather than IDB write volume.
function genAssetBytes(rng: () => number): string {
  const len = pickInt(rng, 200, 400);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(65 + Math.floor(rng() * 26));
  }
  return Buffer.from(s).toString('base64');
}

interface SyntheticContainer {
  meta: {
    container_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    schema_version: number;
  };
  entries: Array<{
    lid: string;
    title: string;
    archetype: string;
    body: string;
    created_at: string;
    updated_at: string;
    color_tag?: string;
    tags?: string[];
  }>;
  relations: Array<{
    id: string;
    from: string;
    to: string;
    kind: string;
    created_at: string;
    updated_at: string;
  }>;
  revisions: unknown[];
  assets: Record<string, string>;
}

function generate(args: Args): SyntheticContainer {
  const rng = makeRng(args.seed);

  // ── Assets ────────────────────────────────────────────────
  const assets: Record<string, string> = {};
  const assetKeys: string[] = [];
  for (let i = 0; i < args.assets; i++) {
    const key = `ast-${i.toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;
    assets[key] = genAssetBytes(rng);
    assetKeys.push(key);
  }

  // ── Entries ───────────────────────────────────────────────
  const entries: SyntheticContainer['entries'] = [];
  const folderLids: string[] = [];

  // Sprinkle ~5% folders first so later entries can reference them.
  const folderCount = Math.max(1, Math.round(args.entries * 0.05));
  for (let i = 0; i < folderCount; i++) {
    const lid = `fld-${i.toString(36)}`;
    folderLids.push(lid);
    entries.push({
      lid,
      title: `Folder ${i}`,
      archetype: 'folder',
      body: '',
      created_at: T0,
      updated_at: T0,
    });
  }

  // ~10% textlogs (capped to args.textlogs absolute number when given).
  const textlogTarget = Math.min(args.textlogs, Math.round(args.entries * 0.1));
  for (let i = 0; i < textlogTarget; i++) {
    entries.push({
      lid: `tl-${i.toString(36)}`,
      title: `Textlog ${i}`,
      archetype: 'textlog',
      body: genTextlogBody(rng, assetKeys),
      created_at: T0,
      updated_at: T0,
    });
  }

  // ~5% attachment entries pointing at the synthetic asset keys.
  const attachmentTarget = Math.min(assetKeys.length, Math.round(args.entries * 0.05));
  for (let i = 0; i < attachmentTarget; i++) {
    const key = assetKeys[i]!;
    entries.push({
      lid: `att-${i.toString(36)}`,
      title: `attachment-${i}.png`,
      archetype: 'attachment',
      body: genAttachmentBody(key, `attachment-${i}.png`),
      created_at: T0,
      updated_at: T0,
    });
  }

  // ~10% todos (split open/done by genTodoBody).
  const todoTarget = Math.round(args.entries * 0.1);
  for (let i = 0; i < todoTarget; i++) {
    entries.push({
      lid: `todo-${i.toString(36)}`,
      title: `Todo ${i}`,
      archetype: 'todo',
      body: genTodoBody(rng),
      created_at: T0,
      updated_at: T0,
    });
  }

  // Remainder: text entries.
  const textTarget = args.entries - entries.length;
  for (let i = 0; i < textTarget; i++) {
    entries.push({
      lid: `txt-${i.toString(36)}`,
      title: `Text entry ${i} ${pick(rng, WORDS)}`,
      archetype: 'text',
      body: genTextBody(rng, assetKeys),
      created_at: T0,
      updated_at: T0,
    });
  }

  // ── Relations ────────────────────────────────────────────
  // Park a random subset of non-folder entries inside folders so
  // tree mode has structural depth to walk, and so the
  // tree-hide-buckets / search-hide-buckets filters have realistic
  // bucket-membership counts.
  const relations: SyntheticContainer['relations'] = [];
  let relIdSeq = 0;
  const nextRelId = (): string => `rel-${(relIdSeq++).toString(36)}`;

  for (const e of entries) {
    if (e.archetype === 'folder') continue;
    if (rng() < 0.6 && folderLids.length > 0) {
      const parent = pick(rng, folderLids);
      relations.push({
        id: nextRelId(),
        from: parent,
        to: e.lid,
        kind: 'structural',
        created_at: T0,
        updated_at: T0,
      });
    }
  }

  // Add a small number of cross-entry semantic / categorical
  // relations to give the connectedness graph realistic edge
  // density (~5% of entries touched).
  const semanticCount = Math.round(entries.length * 0.05);
  for (let i = 0; i < semanticCount; i++) {
    const a = pick(rng, entries);
    const b = pick(rng, entries);
    if (a.lid === b.lid) continue;
    relations.push({
      id: nextRelId(),
      from: a.lid,
      to: b.lid,
      kind: rng() < 0.5 ? 'semantic' : 'categorical',
      created_at: T0,
      updated_at: T0,
    });
  }

  return {
    meta: {
      container_id: `bench-${args.entries}`,
      title: `bench:${args.entries}`,
      created_at: T0,
      updated_at: T0,
      schema_version: 1,
    },
    entries,
    relations,
    revisions: [],
    assets,
  };
}

function main(): void {
  const args = parseArgs(process.argv);
  const container = generate(args);
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, JSON.stringify(container));
  // eslint-disable-next-line no-console
  console.log(
    `[gen-bench] ${args.output}: ${container.entries.length} entries, `
    + `${container.relations.length} relations, `
    + `${Object.keys(container.assets).length} assets `
    + `(${(JSON.stringify(container).length / 1024).toFixed(1)} KB)`,
  );
}

main();
