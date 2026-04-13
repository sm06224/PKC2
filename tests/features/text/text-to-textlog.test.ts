/**
 * Slice 5: TEXT → TEXTLOG pure-function tests.
 */

import { describe, it, expect } from 'vitest';
import { textToTextlog } from '@features/text/text-to-textlog';
import { parseTextlogBody } from '@features/textlog/textlog-body';
import type { Entry } from '@core/model/record';

function mkText(body: string, title = 'Doc'): Entry {
  return {
    lid: 'src-lid',
    title,
    body,
    archetype: 'text',
    created_at: '2026-04-13T10:00:00Z',
    updated_at: '2026-04-13T10:00:00Z',
  };
}

const FIXED_NOW = new Date('2026-04-13T10:00:00Z');

let seq = 0;
function seqId(): string {
  seq += 1;
  return `id-${seq.toString().padStart(3, '0')}`;
}
function resetSeq(): void {
  seq = 0;
}

describe('textToTextlog — heading split', () => {
  it('splits on top-level ATX headings, keeps heading line at head of segment', () => {
    resetSeq();
    const src = mkText(
      [
        'intro paragraph',
        '',
        '# Chapter 1',
        'para 1',
        '',
        '## Sub',
        'detail',
        '',
        '# Chapter 2',
        'para 2',
      ].join('\n'),
    );
    const r = textToTextlog(src, {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(4);
    expect(r.logs.map((l) => l.text)).toEqual([
      'intro paragraph',
      '# Chapter 1\npara 1',
      '## Sub\ndetail',
      '# Chapter 2\npara 2',
    ]);
  });

  it('treats `####` or deeper as body content (only #, ##, ### split)', () => {
    resetSeq();
    const src = mkText(
      ['# A', 'text a', '#### deep', 'still a', '# B', 'text b'].join('\n'),
    );
    const r = textToTextlog(src, {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(2);
    expect(r.logs[0]!.text).toContain('#### deep');
    expect(r.logs[1]!.text).toBe('# B\ntext b');
  });

  it('ignores `#` inside fenced code blocks', () => {
    resetSeq();
    const src = mkText(
      ['intro', '```', '# not a heading', '```', 'tail'].join('\n'),
    );
    const r = textToTextlog(src, {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(1);
    expect(r.logs[0]!.text).toContain('# not a heading');
  });

  it('body with no headings → 1 log containing the whole body', () => {
    resetSeq();
    const src = mkText('just a paragraph\n\nand another one');
    const r = textToTextlog(src, {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(1);
    expect(r.logs[0]!.text).toBe('just a paragraph\n\nand another one');
  });

  it('empty body → 0 segments', () => {
    resetSeq();
    const r = textToTextlog(mkText(''), {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(0);
    expect(r.logs).toHaveLength(0);
  });

  it('leading content before the first heading survives as its own segment', () => {
    resetSeq();
    const r = textToTextlog(
      mkText('prelude\n\n# First\nbody'),
      { splitMode: 'heading', now: FIXED_NOW, generateLogId: seqId, includeMetaLog: false },
    );
    expect(r.segmentCount).toBe(2);
    expect(r.logs[0]!.text).toBe('prelude');
    expect(r.logs[1]!.text).toBe('# First\nbody');
  });
});

describe('textToTextlog — hr split', () => {
  it('splits on `---` and drops the separator line', () => {
    resetSeq();
    const src = mkText(['one', '', '---', '', 'two', '', '---', 'three'].join('\n'));
    const r = textToTextlog(src, {
      splitMode: 'hr',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(3);
    for (const log of r.logs) {
      expect(log.text).not.toContain('---');
    }
    expect(r.logs.map((l) => l.text)).toEqual(['one', 'two', 'three']);
  });

  it('ignores `---` inside fenced code blocks', () => {
    resetSeq();
    const src = mkText(['alpha', '```', '---', '```', 'beta'].join('\n'));
    const r = textToTextlog(src, {
      splitMode: 'hr',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(1);
    expect(r.logs[0]!.text).toContain('---');
  });

  it('skips whitespace-only segments between consecutive `---`', () => {
    resetSeq();
    const src = mkText(['a', '---', '', '   ', '---', 'b'].join('\n'));
    const r = textToTextlog(src, {
      splitMode: 'hr',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(2);
    expect(r.logs.map((l) => l.text)).toEqual(['a', 'b']);
  });
});

describe('textToTextlog — title + meta log + invariants', () => {
  it('title follows `<src> — log import <yyyy-mm-dd>` format', () => {
    const r = textToTextlog(mkText('x', 'Journal'), {
      now: new Date('2026-04-13T10:00:00Z'),
    });
    expect(r.title).toMatch(/^Journal — log import \d{4}-\d{2}-\d{2}$/);
  });

  it('includeMetaLog=true prepends a source backlink log', () => {
    resetSeq();
    const r = textToTextlog(mkText('# A\nx', 'Journal'), {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: true,
    });
    expect(r.logs).toHaveLength(2);
    expect(r.logs[0]!.isMeta).toBe(true);
    expect(r.logs[0]!.text).toContain('Source TEXT: [Journal](entry:src-lid)');
    expect(r.logs[0]!.text).toContain('Converted:');
    expect(r.logs[1]!.isMeta).toBe(false);
    expect(r.segmentCount).toBe(1); // meta not counted
  });

  it('body is a valid serialized TEXTLOG body (round-trip via parseTextlogBody)', () => {
    resetSeq();
    const r = textToTextlog(mkText('# A\nx\n\n# B\ny'), {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    const parsed = parseTextlogBody(r.body);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]!.text).toBe('# A\nx');
    expect(parsed.entries[1]!.text).toBe('# B\ny');
    expect(parsed.entries.every((e) => e.flags.length === 0)).toBe(true);
  });

  it('log createdAt is strictly monotonic within a result', () => {
    resetSeq();
    const r = textToTextlog(mkText('# A\nx\n# B\ny\n# C\nz'), {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    const ts = r.logs.map((l) => new Date(l.createdAt).getTime());
    for (let i = 1; i < ts.length; i += 1) {
      expect(ts[i]!).toBeGreaterThan(ts[i - 1]!);
    }
  });

  it('non-text source yields 0 content segments (only meta log if enabled)', () => {
    resetSeq();
    const notText: Entry = {
      lid: 'x', title: 'TL', body: '[]', archetype: 'textlog',
      created_at: 'x', updated_at: 'x',
    };
    const r = textToTextlog(notText, { includeMetaLog: false });
    expect(r.segmentCount).toBe(0);
    expect(r.logs).toHaveLength(0);
  });

  it('heading-only body still emits one log with just the heading line', () => {
    resetSeq();
    const r = textToTextlog(mkText('# Only heading'), {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.segmentCount).toBe(1);
    expect(r.logs[0]!.text).toBe('# Only heading');
  });

  it('headline is the first non-empty line, capped at 80 chars', () => {
    resetSeq();
    const longLine = 'x'.repeat(200);
    const r = textToTextlog(mkText(`${longLine}\n\ntail`), {
      splitMode: 'heading',
      now: FIXED_NOW,
      generateLogId: seqId,
      includeMetaLog: false,
    });
    expect(r.logs[0]!.headline.length).toBe(80);
    expect(r.logs[0]!.headline.endsWith('…')).toBe(true);
  });

  it('splitMode is echoed in the result', () => {
    const r1 = textToTextlog(mkText('x'), { splitMode: 'heading' });
    const r2 = textToTextlog(mkText('x'), { splitMode: 'hr' });
    expect(r1.splitMode).toBe('heading');
    expect(r2.splitMode).toBe('hr');
  });
});
