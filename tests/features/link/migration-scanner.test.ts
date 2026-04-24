import { describe, it, expect } from 'vitest';
import {
  buildLinkMigrationPreview,
  scanLinkMigrationCandidates,
  type LinkMigrationCandidate,
} from '@features/link/migration-scanner';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

/**
 * Link migration scanner — Normalize PKC links v1.
 *
 * Spec: docs/spec/link-migration-tool-v1.md §5-§6, §10.
 *
 * This suite pins the Phase 2 Slice 1 pure scanner: candidate
 * classification, URI-scheme non-interference, code-block masking,
 * TEXTLOG row-level scan, deterministic order, and safe-no-throw on
 * malformed input.
 */

const T = '2026-04-24T00:00:00Z';
const SELF = 'self-cid';
const OTHER = 'other-cid';

function text(lid: string, body: string, title: string = `Entry ${lid}`): Entry {
  return { lid, title, body, archetype: 'text', created_at: T, updated_at: T };
}

function attachment(lid: string, name: string, assetKey: string): Entry {
  return {
    lid,
    title: name,
    body: JSON.stringify({ name, mime: 'image/png', size: 10, asset_key: assetKey }),
    archetype: 'attachment',
    created_at: T,
    updated_at: T,
  };
}

function textlog(
  lid: string,
  title: string,
  rows: Array<{ id: string; text: string; createdAt?: string }>,
): Entry {
  return {
    lid,
    title,
    body: JSON.stringify({
      entries: rows.map((r) => ({
        id: r.id,
        text: r.text,
        createdAt: r.createdAt ?? T,
        flags: [],
      })),
    }),
    archetype: 'textlog',
    created_at: T,
    updated_at: T,
  };
}

function container(entries: Entry[], cid: string = SELF): Container {
  return {
    meta: {
      container_id: cid,
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

// ─────────────────────────────────────────────────────────────────
// Candidate A — empty label
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — empty label(Candidate A)', () => {
  it('fills `[](entry:<lid>)` with the entry title', () => {
    const c = container([
      text('src', '[](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject<Partial<LinkMigrationCandidate>>({
      entryLid: 'src',
      kind: 'empty-label',
      before: '[](entry:dst)',
      after: '[Destination](entry:dst)',
      confidence: 'safe',
    });
  });

  it('fills `[](asset:<key>)` with the attachment name', () => {
    const c = container([
      text('src', '[](asset:ast-001)'),
      attachment('att', 'photo.png', 'ast-001'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.before).toBe('[](asset:ast-001)');
    expect(candidates[0]!.after).toBe('[photo.png](asset:ast-001)');
  });

  it('falls back to (untitled) when entry title is empty', () => {
    const c = container([
      text('src', '[](entry:dst)'),
      text('dst', '', ''),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates[0]!.after).toBe('[(untitled)](entry:dst)');
  });

  it('skips non-empty canonical link(already OK)', () => {
    const c = container([
      text('src', '[Custom](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// Candidate B — legacy TEXTLOG fragment
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — legacy log fragment(Candidate B)', () => {
  it('rewrites `entry:<lid>#<logId>` → `entry:<lid>#log/<logId>` only when log row exists', () => {
    const c = container([
      text('src', '[note](entry:tl#log-1)'),
      textlog('tl', 'Work Log', [
        { id: 'log-1', text: 'first' },
      ]),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.kind).toBe('legacy-log-fragment');
    expect(candidates[0]!.before).toBe('[note](entry:tl#log-1)');
    expect(candidates[0]!.after).toBe('[note](entry:tl#log/log-1)');
    expect(candidates[0]!.confidence).toBe('safe');
  });

  it('does NOT emit a candidate when the log row is missing', () => {
    const c = container([
      text('src', '[note](entry:tl#log-ghost)'),
      textlog('tl', 'Work Log', [
        { id: 'log-1', text: 'first' },
      ]),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });

  it('does NOT emit a candidate when the target entry is NOT a textlog', () => {
    const c = container([
      text('src', '[x](entry:dst#log-1)'),
      text('dst', '', 'Destination'), // plain TEXT, not textlog
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });

  it('empty label + legacy fragment → one candidate with both label + fragment canonicalized', () => {
    const c = container([
      text('src', '[](entry:tl#log-1)'),
      textlog('tl', 'Work Log', [
        { id: 'log-1', text: 'first note' },
      ]),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.kind).toBe('legacy-log-fragment');
    // Label gets synthesized with log snippet, fragment gets canonicalized.
    expect(candidates[0]!.after).toBe('[Work Log › first note](entry:tl#log/log-1)');
  });
});

// ─────────────────────────────────────────────────────────────────
// Candidate C — same-container Portable PKC Reference
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — same-container portable reference(Candidate C)', () => {
  it('demotes `pkc://<self>/entry/<lid>` to `entry:<lid>`(label preserved)', () => {
    const c = container([
      text('src', `[link](pkc://${SELF}/entry/dst)`),
      text('dst', '', 'Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.kind).toBe('same-container-portable-reference');
    expect(candidates[0]!.before).toBe(`[link](pkc://${SELF}/entry/dst)`);
    expect(candidates[0]!.after).toBe('[link](entry:dst)');
  });

  it('demotes `pkc://<self>/asset/<key>` to `asset:<key>`(label preserved)', () => {
    const c = container([
      text('src', `[file](pkc://${SELF}/asset/ast-001)`),
      attachment('att', 'photo.png', 'ast-001'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.after).toBe('[file](asset:ast-001)');
  });

  it('demotes log-fragment portable reference and preserves log/ fragment', () => {
    const c = container([
      text('src', `[r](pkc://${SELF}/entry/tl#log/log-1)`),
      textlog('tl', 'Work Log', [{ id: 'log-1', text: 'first' }]),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.after).toBe('[r](entry:tl#log/log-1)');
  });

  it('synthesizes label when the portable reference has empty label', () => {
    const c = container([
      text('src', `[](pkc://${SELF}/entry/dst)`),
      text('dst', '', 'Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.after).toBe('[Destination](entry:dst)');
  });

  it('does NOT emit a candidate for cross-container portable reference', () => {
    const c = container([
      text('src', `[x](pkc://${OTHER}/entry/dst)`),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// Candidate D — legacy asset image embed(opt-in)
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — legacy asset image embed(Candidate D, optional)', () => {
  it('is NOT emitted by default(opt-in off)', () => {
    const c = container([
      text('src', '![pic](asset:ast-001)'),
      attachment('att', 'photo.png', 'ast-001'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });

  it('is emitted with review confidence when opt-in flag is ON', () => {
    const c = container([
      text('src', '![pic](asset:ast-001)'),
      attachment('att', 'photo.png', 'ast-001'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c, {
      enableAssetEmbedMigration: true,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.kind).toBe('legacy-asset-image-embed');
    expect(candidates[0]!.confidence).toBe('review');
    expect(candidates[0]!.before).toBe('![pic](asset:ast-001)');
    expect(candidates[0]!.after).toBe('[![pic](asset:ast-001)](asset:ast-001)');
  });
});

// ─────────────────────────────────────────────────────────────────
// Non-interference(spec §4)
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — URI scheme non-interference', () => {
  it.each([
    ['https', '[site](https://example.com)'],
    ['http', '[site](http://example.com)'],
    ['file', '[doc](file:///home/u/doc.md)'],
    ['ftp', '[ftp](ftp://example.com/x)'],
    ['mailto', '[email](mailto:user@example.com)'],
    ['tel', '[call](tel:+1-555-0100)'],
    ['ms-word', '[open](ms-word:ofe|u|https://example.com/x.docx)'],
    ['ms-excel', '[open](ms-excel:ofv|u|https://example.com/x.xlsx)'],
    ['ms-powerpoint', '[open](ms-powerpoint:ofv|u|https://example.com/x.pptx)'],
    ['onenote', '[open](onenote:https://example.com/section.one)'],
    ['obsidian', '[open](obsidian://open?vault=Notes&file=Today)'],
    ['vscode', '[open](vscode://file/home/u/code.ts)'],
    ['web+custom', '[open](web+custom://some/path)'],
  ])('never emits a candidate for %s URL', (_scheme, body) => {
    const c = container([text('src', body)]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });

  it('ignores malformed `pkc://` that the parser rejects', () => {
    const c = container([text('src', '[x](pkc://bad)')]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });

  it('ignores entry: with unknown-shape fragment(non-log, non-day)', () => {
    // `entry:e1#experimental-thing` parses as legacy log fragment —
    // but it only becomes a candidate if a matching textlog row
    // actually exists. With no target entry at all, no candidate.
    const c = container([
      text('src', '[x](entry:ghost#experimental-hash)'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });
});

describe('buildLinkMigrationPreview — code-block non-interference', () => {
  it('ignores links inside a fenced code block(triple-backtick)', () => {
    const body = [
      'Some prose with a real link [x](entry:e1).',
      '',
      '```',
      '[fake](entry:code-block)',
      '[](entry:empty-in-code)',
      '```',
      '',
      'More prose.',
    ].join('\n');
    const c = container([
      text('src', body),
      text('e1', '', 'Real Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    // e1 has non-empty label in the body, which is canonical — no
    // candidate. Code-fenced matches must NOT surface.
    expect(candidates).toHaveLength(0);
  });

  it('ignores links inside a tilde fenced code block', () => {
    const body = [
      '~~~',
      '[](entry:dst)',
      '~~~',
    ].join('\n');
    const c = container([
      text('src', body),
      text('dst', '', 'Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });

  it('ignores links inside inline code', () => {
    const c = container([
      text('src', 'Example: `[](entry:dst)` is a link in code.'),
      text('dst', '', 'Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(0);
  });

  it('finds a real link AFTER a fenced code block is masked out', () => {
    const body = [
      '```',
      '[fake](entry:ignored)',
      '```',
      '',
      'Real: [](entry:dst)',
    ].join('\n');
    const c = container([
      text('src', body),
      text('dst', '', 'Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.before).toBe('[](entry:dst)');
    expect(candidates[0]!.after).toBe('[Destination](entry:dst)');
  });
});

// ─────────────────────────────────────────────────────────────────
// Archetype scope
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — archetype scope', () => {
  it('scans text entry body', () => {
    const c = container([
      text('src', '[](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    expect(buildLinkMigrationPreview(c).candidates).toHaveLength(1);
  });

  it('scans every log row inside a textlog entry', () => {
    // Use empty-label links inside the log text so each row
    // triggers a Candidate A; non-empty-label links are already
    // canonical(§3.6)and would be filtered out.
    const c = container([
      textlog('tl', 'Work Log', [
        { id: 'log-1', text: '[](entry:dst)' },
        { id: 'log-2', text: '[](entry:dst)' },
      ]),
      text('dst', '', 'Destination'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(2);
    // Both candidates carry textlog location with logId.
    const byLog = candidates.map((c) =>
      c.location.kind === 'textlog' ? c.location.logId : null,
    );
    expect(byLog).toEqual(['log-1', 'log-2']);
  });

  it('scans folder body', () => {
    const folder: Entry = {
      lid: 'f1', title: 'Folder', body: '[](entry:dst)',
      archetype: 'folder', created_at: T, updated_at: T,
    };
    const c = container([folder, text('dst', '', 'Destination')]);
    expect(buildLinkMigrationPreview(c).candidates).toHaveLength(1);
  });

  it('does NOT scan attachment entries(body is JSON, not markdown)', () => {
    const c = container([
      // Even though the JSON string technically contains `entry:` token,
      // attachment archetype is out-of-scope per §5.3.
      attachment('att', '[](entry:fake)', 'ast-001'),
    ]);
    expect(buildLinkMigrationPreview(c).candidates).toHaveLength(0);
  });

  it('does NOT scan system-reserved entries(`__about__` / `__settings__`)', () => {
    const about: Entry = {
      lid: '__about__', title: 'About', body: '[](entry:fake)',
      archetype: 'system-about', created_at: T, updated_at: T,
    };
    expect(buildLinkMigrationPreview(container([about])).candidates).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// Deterministic order
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — deterministic order', () => {
  it('candidates are ordered by (entry order, body offset ascending)', () => {
    const c = container([
      text('src1', 'A [](entry:dst) B [](asset:ast-001)'),
      text('src2', '[](entry:dst)'),
      text('dst', '', 'Destination'),
      attachment('att', 'photo.png', 'ast-001'),
    ]);
    const { candidates } = buildLinkMigrationPreview(c);
    expect(candidates).toHaveLength(3);
    expect(candidates[0]!.entryLid).toBe('src1');
    expect(candidates[1]!.entryLid).toBe('src1');
    expect(candidates[2]!.entryLid).toBe('src2');
    // src1 offsets ascending: the entry link starts before the asset link.
    const loc0 = candidates[0]!.location as { kind: 'body'; start: number };
    const loc1 = candidates[1]!.location as { kind: 'body'; start: number };
    expect(loc0.start).toBeLessThan(loc1.start);
  });

  it('produces identical output across repeated scans(determinism guard)', () => {
    const c = container([
      text('src', '[](entry:dst) [](asset:ast-001)'),
      text('dst', '', 'Destination'),
      attachment('att', 'photo.png', 'ast-001'),
    ]);
    const a = buildLinkMigrationPreview(c).candidates;
    const b = buildLinkMigrationPreview(c).candidates;
    expect(b).toEqual(a);
  });
});

// ─────────────────────────────────────────────────────────────────
// Preview summary shape
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — summary', () => {
  it('counts candidates by kind and confidence', () => {
    const c = container([
      text('src', `[](entry:dst) [note](entry:tl#log-1) [a](pkc://${SELF}/entry/dst)`),
      text('dst', '', 'Destination'),
      textlog('tl', 'Work Log', [{ id: 'log-1', text: 'first' }]),
    ]);
    const preview = buildLinkMigrationPreview(c);
    expect(preview.summary.totalCandidates).toBe(3);
    expect(preview.summary.safeCandidates).toBe(3);
    expect(preview.summary.reviewCandidates).toBe(0);
    expect(preview.summary.byKind['empty-label']).toBe(1);
    expect(preview.summary.byKind['legacy-log-fragment']).toBe(1);
    expect(preview.summary.byKind['same-container-portable-reference']).toBe(1);
    expect(preview.summary.entriesAffected).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────
// Malformed input safety
// ─────────────────────────────────────────────────────────────────

describe('buildLinkMigrationPreview — malformed input safety', () => {
  it('does not throw on malformed textlog body', () => {
    const bad: Entry = {
      lid: 'tl', title: 'Broken', body: '{not json',
      archetype: 'textlog', created_at: T, updated_at: T,
    };
    expect(() => buildLinkMigrationPreview(container([bad]))).not.toThrow();
  });

  it('does not throw on malformed attachment body(asset owner lookup)', () => {
    const c = container([
      text('src', '[](asset:ast-001)'),
      { lid: 'bad', title: 'x', body: '{not json', archetype: 'attachment', created_at: T, updated_at: T },
    ]);
    expect(() => buildLinkMigrationPreview(c)).not.toThrow();
    const { candidates } = buildLinkMigrationPreview(c);
    // Label falls back to (untitled) when owner lookup fails.
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.after).toBe('[(untitled)](asset:ast-001)');
  });

  it('does not throw on empty body', () => {
    expect(() => buildLinkMigrationPreview(container([text('src', '')]))).not.toThrow();
    expect(buildLinkMigrationPreview(container([text('src', '')])).candidates).toHaveLength(0);
  });

  it('does not throw on markdown with unbalanced brackets', () => {
    const c = container([
      text('src', '[not a link (not a link [also broken](no-close'),
    ]);
    expect(() => buildLinkMigrationPreview(c)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────
// Facade export
// ─────────────────────────────────────────────────────────────────

describe('scanLinkMigrationCandidates — convenience facade', () => {
  it('returns candidates without the summary wrapper', () => {
    const c = container([
      text('src', '[](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const candidates = scanLinkMigrationCandidates(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.kind).toBe('empty-label');
  });
});
