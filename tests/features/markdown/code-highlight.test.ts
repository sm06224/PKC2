/**
 * Tests for the fenced-code syntax highlighter. See
 * `src/features/markdown/code-highlight.ts` and
 * `docs/development/markdown-code-block-highlighting.md`.
 *
 * Two axes are covered:
 *   1. Per-language token coverage — every supported language must
 *      emit at least the "obvious" token classes so the user sees a
 *      real visual difference between prose and code.
 *   2. Safety / fallback — HTML escapes, alias canonicalisation,
 *      unknown-language plain fallback.
 */
import { describe, it, expect } from 'vitest';
import {
  highlightCode,
  isHighlightable,
  listSupportedLanguages,
} from '../../../src/features/markdown/code-highlight';

describe('highlightCode — general behaviour', () => {
  it('returns plain escaped text for unknown languages', () => {
    const out = highlightCode('<script>alert(1)</script>', 'brainfuck');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<span');
  });

  it('returns plain escaped text when the language is empty / null / undefined', () => {
    for (const lang of [null, undefined, '', '   ']) {
      const out = highlightCode('foo & <bar>', lang);
      expect(out).toContain('&amp;');
      expect(out).toContain('&lt;bar&gt;');
      expect(out).not.toContain('<span');
    }
  });

  it('canonicalises aliases (js -> javascript, ts -> typescript, sh -> bash, yml -> yaml, ps1 -> powershell)', () => {
    expect(isHighlightable('js')).toBe(true);
    expect(isHighlightable('ts')).toBe(true);
    expect(isHighlightable('sh')).toBe(true);
    expect(isHighlightable('shell')).toBe(true);
    expect(isHighlightable('yml')).toBe(true);
    expect(isHighlightable('ps1')).toBe(true);
    expect(isHighlightable('JS')).toBe(true); // case-insensitive

    // Each alias must produce the same non-empty span markup as the
    // canonical form for a sample program containing its comment
    // syntax.
    expect(highlightCode('const x = 1;', 'js')).toContain('pkc-tok-keyword');
    expect(highlightCode('const x = 1;', 'javascript')).toContain('pkc-tok-keyword');
  });

  it('reports the canonical language list', () => {
    const langs = listSupportedLanguages();
    expect(langs).toContain('javascript');
    expect(langs).toContain('typescript');
    expect(langs).toContain('json');
    expect(langs).toContain('html');
    expect(langs).toContain('css');
    expect(langs).toContain('bash');
    expect(langs).toContain('yaml');
    expect(langs).toContain('diff');
    expect(langs).toContain('sql');
    expect(langs).toContain('powershell');
  });

  it('escapes HTML inside token content — no raw `<` or `>` can leak', () => {
    // A JS string containing "<script>" must remain escaped INSIDE
    // the string token so it can never break out of the surrounding
    // <code> element.
    const out = highlightCode('const s = "<script>";', 'js');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toMatch(/<script>/);
  });

  it('does not produce zero-width spans', () => {
    const out = highlightCode('const x = 1;', 'js');
    expect(out).not.toContain('<span class="pkc-tok-keyword"></span>');
  });

  it('preserves source order and whitespace (incl. newlines)', () => {
    const src = 'const a = 1;\nconst b = 2;\n';
    const out = highlightCode(src, 'js');
    // Newlines survive.
    expect(out.split('\n').length).toBe(src.split('\n').length);
    // Token ordering matches source.
    const firstA = out.indexOf('a =');
    const firstB = out.indexOf('b =');
    expect(firstA).toBeGreaterThan(-1);
    expect(firstB).toBeGreaterThan(firstA);
  });

  it('handles an empty body without errors', () => {
    expect(highlightCode('', 'js')).toBe('');
    expect(highlightCode('', null)).toBe('');
  });
});

describe('highlightCode — per-language coverage', () => {
  it('javascript: keywords, strings, comments, numbers, builtins', () => {
    const out = highlightCode(
      '// hi\nconst x = 1; console.log("ok");',
      'javascript',
    );
    expect(out).toContain('pkc-tok-comment');
    expect(out).toContain('pkc-tok-keyword');
    expect(out).toContain('pkc-tok-number');
    expect(out).toContain('pkc-tok-string');
    expect(out).toContain('pkc-tok-builtin');
  });

  it('typescript: interface + primitive types + js keywords', () => {
    const out = highlightCode(
      'interface Foo { bar: string; baz: number; }',
      'typescript',
    );
    expect(out).toContain('pkc-tok-keyword'); // interface
    expect(out).toContain('pkc-tok-type');    // string / number
  });

  it('json: strings, numbers, keywords (true/false/null)', () => {
    const out = highlightCode('{"a": 1, "b": true, "c": null}', 'json');
    expect(out).toContain('pkc-tok-string');
    expect(out).toContain('pkc-tok-number');
    expect(out).toContain('pkc-tok-keyword');
  });

  it('html: tag brackets, attribute names, string values, comments', () => {
    const out = highlightCode(
      '<!-- hello --><div class="foo" id=\'bar\'>x</div>',
      'html',
    );
    expect(out).toContain('pkc-tok-comment');
    expect(out).toContain('pkc-tok-tag');
    expect(out).toContain('pkc-tok-attr');
    expect(out).toContain('pkc-tok-string');
  });

  it('css: properties, at-rules, hex colour, unit number', () => {
    const out = highlightCode(
      '@media (max-width: 600px) { .foo { color: #ff0000; padding: 10px; } }',
      'css',
    );
    expect(out).toContain('pkc-tok-meta');   // @media
    expect(out).toContain('pkc-tok-attr');   // color / padding
    expect(out).toContain('pkc-tok-number'); // #ff0000 or 10px
  });

  it('bash: comments, keywords, builtins, variables, strings', () => {
    // `$x` outside a string — the string-first tokenizer intentionally
    // treats the inside of `"..."` as opaque, so we exercise the
    // variable token on a bare expansion.
    const out = highlightCode(
      '# comment\nx=1\nif [ $x = "y" ]; then echo hi; fi',
      'bash',
    );
    expect(out).toContain('pkc-tok-comment');
    expect(out).toContain('pkc-tok-keyword'); // if / then / fi
    expect(out).toContain('pkc-tok-builtin'); // echo
    expect(out).toContain('pkc-tok-variable'); // $x
    expect(out).toContain('pkc-tok-string');
  });

  it('yaml: comments, keys, booleans, numbers', () => {
    const out = highlightCode(
      '# config\nname: alice\nage: 30\nactive: true',
      'yaml',
    );
    expect(out).toContain('pkc-tok-comment');
    expect(out).toContain('pkc-tok-attr');    // keys
    expect(out).toContain('pkc-tok-keyword'); // true
    expect(out).toContain('pkc-tok-number');  // 30
  });

  it('diff: hunk / file / ins / del markers, line-anchored', () => {
    const src =
      'diff --git a/x b/x\n' +
      '--- a/x\n' +
      '+++ b/x\n' +
      '@@ -1,3 +1,3 @@\n' +
      '-old\n' +
      '+new\n' +
      ' ctx';
    const out = highlightCode(src, 'diff');
    expect(out).toContain('pkc-tok-meta');  // diff / --- / +++
    expect(out).toContain('pkc-tok-hunk');  // @@ header
    expect(out).toContain('pkc-tok-ins');   // +new
    expect(out).toContain('pkc-tok-del');   // -old
    // A `+` inside prose (not line-anchored) should NOT be marked ins
    // — diff tokens are per-line.
    const mid = highlightCode('a + b', 'diff');
    expect(mid).not.toContain('pkc-tok-ins');
  });

  it('sql: keywords (case-insensitive), strings, comments, numbers', () => {
    const out = highlightCode(
      "-- comment\nselect id from users where name = 'alice' limit 10",
      'sql',
    );
    expect(out).toContain('pkc-tok-comment');
    expect(out).toContain('pkc-tok-keyword'); // select / from / where / limit
    expect(out).toContain('pkc-tok-string');  // 'alice'
    expect(out).toContain('pkc-tok-number');  // 10
  });

  it('powershell: comments, strings, variables, cmdlets, flags', () => {
    const out = highlightCode(
      '# list files\nGet-ChildItem -Path /tmp | ForEach-Object { $_.Name }',
      'powershell',
    );
    expect(out).toContain('pkc-tok-comment');
    expect(out).toContain('pkc-tok-builtin'); // Get-ChildItem / ForEach-Object
    expect(out).toContain('pkc-tok-variable'); // $_
    expect(out).toContain('pkc-tok-attr');    // -Path
  });
});
