import { describe, it, expect } from 'vitest';
import {
  findThumbnailHttpUrl,
  rewriteThumbnailToAssetKey,
} from '@features/auto-fill/thumbnail-frontmatter';

describe('findThumbnailHttpUrl', () => {
  it('returns the URL when frontmatter has thumbnail: <http URL>', () => {
    const body = `---
title: Foo
thumbnail: https://i.ytimg.com/vi/abc/maxresdefault.jpg
---

body content`;
    expect(findThumbnailHttpUrl(body)).toBe('https://i.ytimg.com/vi/abc/maxresdefault.jpg');
  });

  it('returns the URL when value is double-quoted', () => {
    const body = `---
thumbnail: "https://example.com/cover.png"
---
`;
    expect(findThumbnailHttpUrl(body)).toBe('https://example.com/cover.png');
  });

  it('returns null when no frontmatter present', () => {
    expect(findThumbnailHttpUrl('# Just a heading\n\nNo frontmatter here.')).toBeNull();
  });

  it('returns null when frontmatter has no thumbnail line', () => {
    const body = `---
title: Foo
provider: youtube
---
`;
    expect(findThumbnailHttpUrl(body)).toBeNull();
  });

  it('returns null when value is already an asset:KEY reference', () => {
    const body = `---
thumbnail: asset:thumb-123
---
`;
    expect(findThumbnailHttpUrl(body)).toBeNull();
  });

  it('returns null when value is a data URL', () => {
    const body = `---
thumbnail: data:image/png;base64,iVBORw0K
---
`;
    expect(findThumbnailHttpUrl(body)).toBeNull();
  });

  it('returns null on empty body', () => {
    expect(findThumbnailHttpUrl('')).toBeNull();
  });
});

describe('rewriteThumbnailToAssetKey', () => {
  it('replaces the http URL line with asset:KEY', () => {
    const body = `---
title: Foo
thumbnail: https://i.ytimg.com/vi/abc/maxresdefault.jpg
provider: youtube
---

content`;
    const result = rewriteThumbnailToAssetKey(body, 'thumb-xyz');
    expect(result).toBe(`---
title: Foo
thumbnail: asset:thumb-xyz
provider: youtube
---

content`);
  });

  it('preserves quote-stripped form even when input was quoted', () => {
    const body = `---
thumbnail: "https://example.com/cover.png"
---
`;
    const result = rewriteThumbnailToAssetKey(body, 'k1');
    expect(result).toBe(`---
thumbnail: asset:k1
---
`);
  });

  it('returns body unchanged when no http URL in frontmatter (already materialized)', () => {
    const body = `---
thumbnail: asset:already-stored
---
content`;
    expect(rewriteThumbnailToAssetKey(body, 'new-key')).toBe(body);
  });

  it('returns body unchanged when no frontmatter at all', () => {
    const body = '# Heading\n\nplain markdown';
    expect(rewriteThumbnailToAssetKey(body, 'x')).toBe(body);
  });

  it('returns empty string unchanged', () => {
    expect(rewriteThumbnailToAssetKey('', 'x')).toBe('');
  });

  it('preserves non-thumbnail lines byte-for-byte', () => {
    const body = `---
title: Foo
description: |
  multiline
  description text
thumbnail: https://example.com/x.jpg
isbn: 978-4-04-104268-3
---

# body heading

paragraph`;
    const result = rewriteThumbnailToAssetKey(body, 'k');
    expect(result).toContain('description: |\n  multiline\n  description text');
    expect(result).toContain('isbn: 978-4-04-104268-3');
    expect(result).toContain('# body heading');
    expect(result).toContain('paragraph');
    expect(result).toContain('thumbnail: asset:k');
    expect(result).not.toContain('https://example.com/x.jpg');
  });
});
