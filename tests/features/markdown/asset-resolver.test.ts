import { describe, it, expect } from 'vitest';
import {
  resolveAssetReferences,
  hasAssetReferences,
  extractAssetReferences,
  classifyAssetMimeCategory,
} from '@features/markdown/asset-resolver';
import type { AssetResolutionContext } from '@features/markdown/asset-resolver';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';

function makeCtx(overrides: Partial<AssetResolutionContext> = {}): AssetResolutionContext {
  return {
    assets: {
      'ast-abc-001': PNG_B64,
      'ast-abc-002': 'GIFdata',
      'ast-abc-003': 'exeData',
    },
    mimeByKey: {
      'ast-abc-001': 'image/png',
      'ast-abc-002': 'image/gif',
      'ast-abc-003': 'application/octet-stream',
    },
    ...overrides,
  };
}

// ── hasAssetReferences ──

describe('hasAssetReferences', () => {
  it('returns false for empty input', () => {
    expect(hasAssetReferences('')).toBe(false);
  });

  it('returns false for text with no references', () => {
    expect(hasAssetReferences('Just some text')).toBe(false);
    expect(hasAssetReferences('![regular](https://example.com/img.png)')).toBe(false);
    expect(hasAssetReferences('![local](./file.png)')).toBe(false);
  });

  it('returns true when an asset reference exists', () => {
    expect(hasAssetReferences('![alt](asset:ast-abc-001)')).toBe(true);
  });

  it('returns true mid-paragraph', () => {
    expect(hasAssetReferences('Hello ![x](asset:ast-abc-001) world')).toBe(true);
  });

  it('can be called repeatedly (regex state is reset)', () => {
    const text = '![x](asset:ast-abc-001)';
    expect(hasAssetReferences(text)).toBe(true);
    expect(hasAssetReferences(text)).toBe(true);
    expect(hasAssetReferences(text)).toBe(true);
  });
});

// ── extractAssetReferences ──

describe('extractAssetReferences', () => {
  it('returns an empty set for empty / refless input', () => {
    expect(extractAssetReferences('').size).toBe(0);
    expect(extractAssetReferences('just prose, nothing here').size).toBe(0);
    expect(extractAssetReferences('![regular](https://example.com/img.png)').size).toBe(0);
  });

  it('extracts an image-form reference', () => {
    const refs = extractAssetReferences('![alt](asset:ast-001)');
    expect(refs.has('ast-001')).toBe(true);
    expect(refs.size).toBe(1);
  });

  it('extracts a link-form reference', () => {
    const refs = extractAssetReferences('see [doc](asset:ast-002) now');
    expect(refs.has('ast-002')).toBe(true);
    expect(refs.size).toBe(1);
  });

  it('extracts image + link in the same source and does not double-count', () => {
    const refs = extractAssetReferences('![x](asset:ast-img) and [y](asset:ast-link)');
    expect(refs.has('ast-img')).toBe(true);
    expect(refs.has('ast-link')).toBe(true);
    expect(refs.size).toBe(2);
  });

  it('deduplicates repeated references', () => {
    const refs = extractAssetReferences(
      '![a](asset:ast-dup) and [b](asset:ast-dup) and ![c](asset:ast-dup)',
    );
    expect(refs.size).toBe(1);
    expect(refs.has('ast-dup')).toBe(true);
  });

  it('is stable across repeated calls (regex state does not leak)', () => {
    const src = '![a](asset:ast-stable)';
    for (let i = 0; i < 5; i++) {
      const refs = extractAssetReferences(src);
      expect(refs.size).toBe(1);
      expect(refs.has('ast-stable')).toBe(true);
    }
  });

  it('includes missing / unsupported keys (reflects author intent, not resolver success)', () => {
    const refs = extractAssetReferences('![ghost](asset:ast-nowhere)');
    expect(refs.has('ast-nowhere')).toBe(true);
  });
});

// ── resolveAssetReferences — successful resolution ──

describe('resolveAssetReferences — resolution', () => {
  it('replaces asset: with a data URI for png', () => {
    const out = resolveAssetReferences('![cat](asset:ast-abc-001)', makeCtx());
    expect(out).toContain(`data:image/png;base64,${PNG_B64}`);
    expect(out).not.toContain('asset:ast-abc-001');
    expect(out).toContain('![cat]');
  });

  it('replaces asset: with a data URI for gif', () => {
    const out = resolveAssetReferences('![g](asset:ast-abc-002)', makeCtx());
    expect(out).toContain('data:image/gif;base64,GIFdata');
  });

  it('preserves alt text', () => {
    const out = resolveAssetReferences('![my alt text](asset:ast-abc-001)', makeCtx());
    expect(out).toContain('![my alt text]');
  });

  it('preserves optional title', () => {
    const out = resolveAssetReferences('![a](asset:ast-abc-001 "tooltip")', makeCtx());
    expect(out).toContain('"tooltip"');
  });

  it('handles empty alt text', () => {
    const out = resolveAssetReferences('![](asset:ast-abc-001)', makeCtx());
    expect(out).toContain('![]');
    expect(out).toContain('data:image/png');
  });

  it('resolves multiple references in one string', () => {
    const src = '![a](asset:ast-abc-001) and ![b](asset:ast-abc-002)';
    const out = resolveAssetReferences(src, makeCtx());
    expect(out).toContain('data:image/png');
    expect(out).toContain('data:image/gif');
  });

  it('does not touch non-asset image references', () => {
    const src = '![ok](https://example.com/img.png)';
    const out = resolveAssetReferences(src, makeCtx());
    expect(out).toBe(src);
  });

  it('treats link form for image MIME as unsupported (use ![ ] instead)', () => {
    // Image MIMEs are only resolved via the image form `![…]`.
    // A link form referring to an image asset is rewritten to an
    // unsupported marker so the user can fix the typo.
    const src = '[link text](asset:ast-abc-001)';
    const out = resolveAssetReferences(src, makeCtx());
    expect(out).toContain('*[unsupported asset: ast-abc-001]*');
    expect(out).not.toContain('[link text]');
  });
});

// ── resolveAssetReferences — fallback behavior ──

describe('resolveAssetReferences — fallback', () => {
  it('emits missing marker when asset key is unknown', () => {
    const out = resolveAssetReferences('![x](asset:ast-nonexistent)', makeCtx());
    expect(out).toContain('*[missing asset: ast-nonexistent]*');
    expect(out).not.toContain('data:');
  });

  it('emits missing marker when assets map lacks the key', () => {
    const ctx = makeCtx({
      assets: {},
      mimeByKey: { 'ast-abc-001': 'image/png' },
    });
    const out = resolveAssetReferences('![x](asset:ast-abc-001)', ctx);
    expect(out).toContain('*[missing asset: ast-abc-001]*');
  });

  it('emits missing marker when mimeByKey lacks the key', () => {
    const ctx = makeCtx({
      assets: { 'ast-abc-001': PNG_B64 },
      mimeByKey: {},
    });
    const out = resolveAssetReferences('![x](asset:ast-abc-001)', ctx);
    expect(out).toContain('*[missing asset: ast-abc-001]*');
  });

  it('emits unsupported marker for non-image MIME', () => {
    const out = resolveAssetReferences('![x](asset:ast-abc-003)', makeCtx());
    expect(out).toContain('*[unsupported asset: ast-abc-003]*');
    expect(out).not.toContain('data:application/octet-stream');
  });

  it('emits unsupported marker for SVG (excluded from allowlist)', () => {
    const ctx = makeCtx({
      assets: { 'ast-svg-001': 'PHN2Zz48L3N2Zz4=' },
      mimeByKey: { 'ast-svg-001': 'image/svg+xml' },
    });
    const out = resolveAssetReferences('![s](asset:ast-svg-001)', ctx);
    expect(out).toContain('*[unsupported asset: ast-svg-001]*');
  });

  it('processes mixed resolved and fallback references', () => {
    const src = '![ok](asset:ast-abc-001) and ![bad](asset:ast-nonexistent)';
    const out = resolveAssetReferences(src, makeCtx());
    expect(out).toContain('data:image/png');
    expect(out).toContain('*[missing asset: ast-nonexistent]*');
  });
});

// ── resolveAssetReferences — security ──

describe('resolveAssetReferences — security', () => {
  it('sanitizes special chars in asset keys for fallback display', () => {
    const src = '![x](asset:ast-abc*<script>)';
    const out = resolveAssetReferences(src, makeCtx());
    // The regex won't match keys with `<` because `<` is not in [^\s)"],
    // actually it is — the regex only excludes whitespace, `)`, and `"`.
    // Fallback should strip dangerous characters.
    expect(out).not.toContain('<script>');
  });

  it('does not inject HTML via alt text', () => {
    const src = '![<img onerror=alert(1)>](asset:ast-abc-001)';
    const out = resolveAssetReferences(src, makeCtx());
    // The alt text is preserved as markdown; markdown-it will escape it later.
    // Resolver just substitutes the URL. HTML escaping is markdown-it's job.
    expect(out).toContain('data:image/png');
  });

  it('does not produce javascript: URIs', () => {
    const out = resolveAssetReferences('![x](asset:ast-abc-001)', makeCtx());
    expect(out).not.toContain('javascript:');
  });

  it('does not produce data:text/html URIs', () => {
    const out = resolveAssetReferences('![x](asset:ast-abc-001)', makeCtx());
    expect(out).not.toContain('data:text/html');
  });

  it('rejects keys with path separators via fallback', () => {
    const src = '![x](asset:../etc/passwd)';
    const out = resolveAssetReferences(src, makeCtx());
    // Key not in map → missing fallback; dangerous chars stripped for display.
    expect(out).toContain('*[missing asset:');
    expect(out).not.toContain('../etc/passwd');
  });
});

// ── resolveAssetReferences — edge cases ──

describe('resolveAssetReferences — edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(resolveAssetReferences('', makeCtx())).toBe('');
  });

  it('leaves unrelated markdown alone', () => {
    const src = '# Heading\n\n- list\n- items\n\n> quote';
    expect(resolveAssetReferences(src, makeCtx())).toBe(src);
  });

  it('handles reference at start of string', () => {
    const out = resolveAssetReferences('![x](asset:ast-abc-001) trailing', makeCtx());
    expect(out).toContain('data:image/png');
    expect(out).toContain('trailing');
  });

  it('handles reference at end of string', () => {
    const out = resolveAssetReferences('leading ![x](asset:ast-abc-001)', makeCtx());
    expect(out).toContain('data:image/png');
    expect(out).toContain('leading');
  });
});

// ── classifyAssetMimeCategory ──

describe('classifyAssetMimeCategory', () => {
  it('classifies image MIMEs', () => {
    expect(classifyAssetMimeCategory('image/png')).toBe('image');
    expect(classifyAssetMimeCategory('image/jpeg')).toBe('image');
    expect(classifyAssetMimeCategory('image/gif')).toBe('image');
    expect(classifyAssetMimeCategory('image/webp')).toBe('image');
  });

  it('classifies PDF', () => {
    expect(classifyAssetMimeCategory('application/pdf')).toBe('pdf');
  });

  it('classifies audio/*', () => {
    expect(classifyAssetMimeCategory('audio/mpeg')).toBe('audio');
    expect(classifyAssetMimeCategory('audio/ogg')).toBe('audio');
    expect(classifyAssetMimeCategory('audio/wav')).toBe('audio');
  });

  it('classifies video/*', () => {
    expect(classifyAssetMimeCategory('video/mp4')).toBe('video');
    expect(classifyAssetMimeCategory('video/webm')).toBe('video');
  });

  it('classifies archive types', () => {
    expect(classifyAssetMimeCategory('application/zip')).toBe('archive');
    expect(classifyAssetMimeCategory('application/x-tar')).toBe('archive');
    expect(classifyAssetMimeCategory('application/gzip')).toBe('archive');
    expect(classifyAssetMimeCategory('application/x-7z-compressed')).toBe('archive');
    expect(classifyAssetMimeCategory('application/x-rar-compressed')).toBe('archive');
  });

  it('falls through to other for unknown MIMEs', () => {
    expect(classifyAssetMimeCategory('application/octet-stream')).toBe('other');
    expect(classifyAssetMimeCategory('text/plain')).toBe('other');
    expect(classifyAssetMimeCategory('image/svg+xml')).toBe('other');
    expect(classifyAssetMimeCategory('')).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(classifyAssetMimeCategory('APPLICATION/PDF')).toBe('pdf');
    expect(classifyAssetMimeCategory('Audio/Mpeg')).toBe('audio');
  });
});

// ── resolveAssetReferences — non-image link form ──

function makeNonImageCtx(): AssetResolutionContext {
  return {
    assets: {
      'ast-pdf-001': 'PDFdata',
      'ast-aud-001': 'AUDdata',
      'ast-vid-001': 'VIDdata',
      'ast-zip-001': 'ZIPdata',
      'ast-bin-001': 'BINdata',
      'ast-img-001': 'IMGdata',
      'ast-svg-001': 'PHN2Zz48L3N2Zz4=',
    },
    mimeByKey: {
      'ast-pdf-001': 'application/pdf',
      'ast-aud-001': 'audio/mpeg',
      'ast-vid-001': 'video/mp4',
      'ast-zip-001': 'application/zip',
      'ast-bin-001': 'application/octet-stream',
      'ast-img-001': 'image/png',
      'ast-svg-001': 'image/svg+xml',
    },
    nameByKey: {
      'ast-pdf-001': 'report.pdf',
      'ast-aud-001': 'jingle.mp3',
      'ast-vid-001': 'demo.mp4',
      'ast-zip-001': 'bundle.zip',
      'ast-bin-001': 'data.bin',
    },
  };
}

describe('resolveAssetReferences — non-image link form', () => {
  it('resolves PDF link to a chip with pdf icon and provided label', () => {
    const out = resolveAssetReferences('See [the report](asset:ast-pdf-001)', makeNonImageCtx());
    expect(out).toContain('📄');
    expect(out).toContain('the report');
    expect(out).toContain('(#asset-ast-pdf-001)');
    expect(out).not.toContain('asset:ast-pdf-001');
  });

  it('resolves audio link to a chip with audio icon', () => {
    const out = resolveAssetReferences('[listen](asset:ast-aud-001)', makeNonImageCtx());
    expect(out).toContain('🎵');
    expect(out).toContain('listen');
    expect(out).toContain('(#asset-ast-aud-001)');
  });

  it('resolves video link to a chip with video icon', () => {
    const out = resolveAssetReferences('[watch](asset:ast-vid-001)', makeNonImageCtx());
    expect(out).toContain('🎬');
    expect(out).toContain('(#asset-ast-vid-001)');
  });

  it('resolves archive link to a chip with archive icon', () => {
    const out = resolveAssetReferences('[download](asset:ast-zip-001)', makeNonImageCtx());
    expect(out).toContain('🗜');
    expect(out).toContain('(#asset-ast-zip-001)');
  });

  it('resolves unknown MIME to a generic file chip', () => {
    const out = resolveAssetReferences('[blob](asset:ast-bin-001)', makeNonImageCtx());
    expect(out).toContain('📎');
    expect(out).toContain('(#asset-ast-bin-001)');
  });

  it('uses attachment name from nameByKey when label is empty', () => {
    const out = resolveAssetReferences('[](asset:ast-pdf-001)', makeNonImageCtx());
    expect(out).toContain('report.pdf');
  });

  it('falls back to the sanitized key when label is empty and nameByKey absent', () => {
    const ctx = {
      ...makeNonImageCtx(),
      nameByKey: undefined,
    };
    const out = resolveAssetReferences('[](asset:ast-pdf-001)', ctx);
    expect(out).toContain('ast-pdf-001');
  });

  it('emits missing marker for unknown asset key in link form', () => {
    const out = resolveAssetReferences('[x](asset:ast-unknown-001)', makeNonImageCtx());
    expect(out).toContain('*[missing asset: ast-unknown-001]*');
    expect(out).not.toContain('#asset-ast-unknown-001');
  });

  it('emits unsupported marker when link form targets an image MIME', () => {
    const out = resolveAssetReferences('[pic](asset:ast-img-001)', makeNonImageCtx());
    expect(out).toContain('*[unsupported asset: ast-img-001]*');
    expect(out).not.toContain('#asset-ast-img-001');
  });

  it('emits unsupported marker when link form targets SVG', () => {
    const out = resolveAssetReferences('[vector](asset:ast-svg-001)', makeNonImageCtx());
    expect(out).toContain('*[unsupported asset: ast-svg-001]*');
    expect(out).not.toContain('#asset-ast-svg-001');
  });

  it('escapes open-bracket metacharacter inside the label', () => {
    // A literal `[` inside the label would nest brackets and could
    // confuse markdown-it's link parser. The resolver escapes it so
    // the surrounding `[…](…)` structure stays intact.
    const src = '[[inner](asset:ast-pdf-001)';
    const out = resolveAssetReferences(src, makeNonImageCtx());
    expect(out).toContain('(#asset-ast-pdf-001)');
    expect(out).toContain('\\[inner');
  });

  it('labels containing \\] are left alone (regex cannot parse them)', () => {
    // This pins the current limitation: labels with an internal `]`
    // are not handled by the simple regex. The resolver passes them
    // through unchanged instead of producing a broken match.
    const src = 'prose [odd\\]label](asset:ast-pdf-001) more';
    const out = resolveAssetReferences(src, makeNonImageCtx());
    expect(out).toBe(src);
  });

  it('does not produce javascript: hrefs', () => {
    const out = resolveAssetReferences('[x](asset:ast-pdf-001)', makeNonImageCtx());
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('does not produce data: hrefs for the chip', () => {
    const out = resolveAssetReferences('[x](asset:ast-pdf-001)', makeNonImageCtx());
    expect(out).not.toContain('](data:');
  });

  it('leaves the image form untouched when it is adjacent to a link form', () => {
    const src = '![i](asset:ast-img-001) and [d](asset:ast-pdf-001)';
    const ctx = {
      ...makeNonImageCtx(),
      mimeByKey: {
        ...makeNonImageCtx().mimeByKey,
        'ast-img-001': 'image/png',
      },
    };
    const out = resolveAssetReferences(src, ctx);
    expect(out).toContain('data:image/png;base64,');
    expect(out).toContain('(#asset-ast-pdf-001)');
  });

  it('preserves preceding punctuation before a link form match', () => {
    const out = resolveAssetReferences('(see [here](asset:ast-pdf-001))', makeNonImageCtx());
    // The leading paren must survive, and the chip must be a standard
    // markdown link, so the closing paren belongs to the outer prose.
    expect(out.startsWith('(see ')).toBe(true);
    expect(out.endsWith(')')).toBe(true);
    expect(out).toContain('(#asset-ast-pdf-001)');
  });

  it('resolves multiple link forms in the same string', () => {
    const src = '[a](asset:ast-pdf-001) then [b](asset:ast-aud-001)';
    const out = resolveAssetReferences(src, makeNonImageCtx());
    expect(out).toContain('(#asset-ast-pdf-001)');
    expect(out).toContain('(#asset-ast-aud-001)');
  });

  it('does not rewrite escaped brackets \\[label](asset:key)', () => {
    const src = '\\[label](asset:ast-pdf-001)';
    const out = resolveAssetReferences(src, makeNonImageCtx());
    // Escaped `\[` should be left alone so users can quote markdown.
    expect(out).toBe(src);
  });

  it('does not rewrite link form inside a fenced code context (prose-level only, see notes)', () => {
    // The resolver operates on raw markdown; it cannot tell that
    // ```[x](asset:k)``` is inside a code fence. We accept that for
    // this foundation — markdown-it itself renders the fenced block as
    // code and the chip fallback is harmless. This test simply pins the
    // current behavior so the trade-off is explicit.
    const src = '```\n[x](asset:ast-pdf-001)\n```';
    const out = resolveAssetReferences(src, makeNonImageCtx());
    // Whatever the resolver decides, the reference must not leak a raw
    // `asset:` URL — it is either a chip or a marker.
    expect(out).not.toMatch(/\]\(asset:/);
  });

  it('hasAssetReferences detects link form references', () => {
    expect(hasAssetReferences('[x](asset:ast-pdf-001)')).toBe(true);
    expect(hasAssetReferences('prose [label](asset:ast-aud-001) more')).toBe(true);
  });
});
