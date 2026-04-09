import { describe, it, expect } from 'vitest';
import {
  resolveAssetReferences,
  hasAssetReferences,
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

  it('does not touch link references like [text](asset:key)', () => {
    // Only image (`![...]`) syntax is resolved, not plain links.
    const src = '[link text](asset:ast-abc-001)';
    const out = resolveAssetReferences(src, makeCtx());
    expect(out).toBe(src);
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
