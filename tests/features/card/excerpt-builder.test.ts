/**
 * Card excerpt builder — Slice 5.1.
 *
 * Pins the archetype-by-archetype excerpt sourcing, the markdown
 * flatten transformations, the XSS safety contract, the textlog
 * fragment routing, and the length cap.
 *
 * Spec: docs/spec/card-embed-presentation-v0.md §5.4
 *       docs/development/card-widget-ui-v0-audit.md §3 (Slice 5.1)
 */
import { describe, it, expect } from 'vitest';
import { buildCardExcerpt } from '@features/card/excerpt-builder';
import type { Entry, ArchetypeId } from '@core/model/record';
import type { ParsedEntryRef } from '@features/entry-ref/entry-ref';

const TS = '2026-04-25T00:00:00Z';

function entry(
  archetype: ArchetypeId,
  body: string,
  lid = 'e1',
  title = 'T',
): Entry {
  return {
    lid,
    title,
    body,
    archetype,
    created_at: TS,
    updated_at: TS,
  };
}

const REF_ENTRY = (lid = 'e1'): ParsedEntryRef => ({ kind: 'entry', lid });

describe('buildCardExcerpt — TEXT', () => {
  it('returns the body as plain text for short bodies', () => {
    const e = entry('text', 'hello world');
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe('hello world');
  });

  it('flattens ATX headings, bullets, and emphasis', () => {
    const e = entry(
      'text',
      '# Heading\n\n- bullet **bold** _italic_\n\n## sub heading',
    );
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe(
      'Heading bullet bold italic sub heading',
    );
  });

  it('reduces markdown links to their label', () => {
    const e = entry('text', 'see [the entry](entry:e2) for details');
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe(
      'see the entry for details',
    );
  });

  it('drops image embeds entirely (alt text discarded)', () => {
    const e = entry('text', 'before ![alt text](asset:k1) after');
    // Alt is dropped to keep the excerpt focused on the prose; the
    // surrounding text collapses cleanly.
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe('before after');
  });

  it('drops fenced code blocks', () => {
    const e = entry(
      'text',
      'before\n\n```js\nconst x = 1;\n```\n\nafter',
    );
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe('before after');
  });

  it('preserves inline code text without backticks', () => {
    const e = entry('text', 'use `npm test` to run');
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe('use npm test to run');
  });

  it('strips blockquote markers but keeps the quoted text', () => {
    const e = entry('text', '> quoted line\nplain line');
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe('quoted line plain line');
  });

  it('strips literal HTML tags', () => {
    const e = entry('text', 'before <div>inside</div> after');
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe('before inside after');
  });

  it('strips embedded card placeholders so they do not pollute the excerpt', () => {
    const e = entry(
      'text',
      'see @[card](entry:e2) for context, then read on',
    );
    expect(buildCardExcerpt(e, REF_ENTRY())).toBe(
      'see for context, then read on',
    );
  });

  it('caps long bodies at the configured length with ellipsis', () => {
    const long = 'a'.repeat(500);
    const out = buildCardExcerpt(entry('text', long), REF_ENTRY())!;
    expect(out.length).toBe(160);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns null when the body is empty after flatten', () => {
    expect(buildCardExcerpt(entry('text', ''), REF_ENTRY())).toBeNull();
    expect(buildCardExcerpt(entry('text', '   \n\n   '), REF_ENTRY())).toBeNull();
    expect(buildCardExcerpt(entry('text', '```\nonly code\n```'), REF_ENTRY())).toBeNull();
  });
});

describe('buildCardExcerpt — TEXTLOG', () => {
  const log = (id: string, text: string, day = '2026-04-25') => ({
    id,
    text,
    createdAt: `${day}T10:00:00Z`,
    flags: [],
  });
  const body = JSON.stringify({
    entries: [
      log('a', 'first morning note', '2026-04-24'),
      log('b', 'second mid-day note', '2026-04-24'),
      log('c', 'today first', '2026-04-25'),
      log('d', 'today latest', '2026-04-25'),
    ],
  });

  it('uses the most recent log for entry: target', () => {
    expect(
      buildCardExcerpt(entry('textlog', body), REF_ENTRY()),
    ).toBe('today latest');
  });

  it('uses the named log for #log/<id> target', () => {
    const ref: ParsedEntryRef = { kind: 'log', lid: 'e1', logId: 'b' };
    expect(buildCardExcerpt(entry('textlog', body), ref)).toBe(
      'second mid-day note',
    );
  });

  it('uses the first log of the named day for #day/<yyyy-mm-dd>', () => {
    const ref: ParsedEntryRef = {
      kind: 'day',
      lid: 'e1',
      dateKey: '2026-04-25',
    };
    expect(buildCardExcerpt(entry('textlog', body), ref)).toBe(
      'today first',
    );
  });

  it('uses the from-id log for #log/<from>..<to> range', () => {
    const ref: ParsedEntryRef = {
      kind: 'range',
      lid: 'e1',
      fromId: 'b',
      toId: 'c',
    };
    expect(buildCardExcerpt(entry('textlog', body), ref)).toBe(
      'second mid-day note',
    );
  });

  it('uses the owning log for heading-form targets', () => {
    const ref: ParsedEntryRef = {
      kind: 'heading',
      lid: 'e1',
      logId: 'a',
      slug: 'morning',
    };
    expect(buildCardExcerpt(entry('textlog', body), ref)).toBe(
      'first morning note',
    );
  });

  it('uses the bare logId for legacy fragment refs', () => {
    const ref: ParsedEntryRef = {
      kind: 'legacy',
      lid: 'e1',
      logId: 'c',
    };
    expect(buildCardExcerpt(entry('textlog', body), ref)).toBe(
      'today first',
    );
  });

  it('returns null when the named log does not exist', () => {
    const ref: ParsedEntryRef = { kind: 'log', lid: 'e1', logId: 'ghost' };
    expect(buildCardExcerpt(entry('textlog', body), ref)).toBeNull();
  });

  it('returns null for an empty textlog body', () => {
    const empty = JSON.stringify({ entries: [] });
    expect(buildCardExcerpt(entry('textlog', empty), REF_ENTRY())).toBeNull();
  });

  it('flattens markdown inside the chosen log', () => {
    const md = JSON.stringify({
      entries: [log('a', '# Heading\n\n**bold** `code`')],
    });
    expect(buildCardExcerpt(entry('textlog', md), REF_ENTRY())).toBe(
      'Heading bold code',
    );
  });
});

describe('buildCardExcerpt — TODO', () => {
  it('uses the description field', () => {
    const body = JSON.stringify({
      status: 'open',
      description: 'buy milk',
    });
    expect(buildCardExcerpt(entry('todo', body), REF_ENTRY())).toBe(
      'buy milk',
    );
  });

  it('flattens markdown inside the description', () => {
    const body = JSON.stringify({
      status: 'open',
      description: '# do thing\n\n- step **bold**',
    });
    expect(buildCardExcerpt(entry('todo', body), REF_ENTRY())).toBe(
      'do thing step bold',
    );
  });

  it('returns null when the description is empty', () => {
    const body = JSON.stringify({ status: 'open', description: '' });
    expect(buildCardExcerpt(entry('todo', body), REF_ENTRY())).toBeNull();
  });
});

describe('buildCardExcerpt — FORM', () => {
  it('uses the first non-empty string field from the JSON body', () => {
    const body = JSON.stringify({
      empty: '',
      title: 'My form entry',
      detail: 'second',
    });
    expect(buildCardExcerpt(entry('form', body), REF_ENTRY())).toBe(
      'My form entry',
    );
  });

  it('returns null for malformed JSON', () => {
    expect(buildCardExcerpt(entry('form', '{bad'), REF_ENTRY())).toBeNull();
  });

  it('returns null when no string field exists', () => {
    expect(
      buildCardExcerpt(entry('form', JSON.stringify({ n: 1 })), REF_ENTRY()),
    ).toBeNull();
  });
});

describe('buildCardExcerpt — FOLDER', () => {
  it('uses the folder description body when present', () => {
    expect(
      buildCardExcerpt(entry('folder', 'project root'), REF_ENTRY()),
    ).toBe('project root');
  });

  it('returns null for an empty folder description', () => {
    expect(buildCardExcerpt(entry('folder', ''), REF_ENTRY())).toBeNull();
  });
});

describe('buildCardExcerpt — no-preview archetypes', () => {
  it.each<ArchetypeId>(['attachment', 'generic', 'opaque'])(
    '%s returns null',
    (archetype) => {
      expect(
        buildCardExcerpt(entry(archetype, 'anything'), REF_ENTRY()),
      ).toBeNull();
    },
  );
});

describe('buildCardExcerpt — XSS safety contract', () => {
  it('does not preserve <script> tags from a TEXT body', () => {
    const e = entry('text', 'hello <script>alert(1)</script> world');
    const out = buildCardExcerpt(e, REF_ENTRY())!;
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(1)');
    expect(out).toBe('hello world');
  });

  it('does not preserve a javascript: URL through link flattening', () => {
    // The link label survives but the URL is dropped — a downstream
    // consumer using textContent will not see anything actionable.
    const e = entry('text', '[click](javascript:alert(1)) here');
    const out = buildCardExcerpt(e, REF_ENTRY())!;
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('alert(1)');
    expect(out).toBe('click here');
  });

  it('does not interpret asset references — they are dropped or labelled', () => {
    const e = entry('text', '![photo](asset:abc) caption');
    const out = buildCardExcerpt(e, REF_ENTRY())!;
    expect(out).not.toContain('asset:abc');
    expect(out).toBe('caption');
  });

  it('strips ambient HTML tags from the textlog log', () => {
    const body = JSON.stringify({
      entries: [
        {
          id: 'a',
          text: '<img onerror="alert(1)" src="x"> after',
          createdAt: TS,
          flags: [],
        },
      ],
    });
    const out = buildCardExcerpt(entry('textlog', body), REF_ENTRY())!;
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror');
    expect(out).toBe('after');
  });
});
