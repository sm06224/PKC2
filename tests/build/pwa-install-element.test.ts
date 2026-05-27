/**
 * @vitest-environment happy-dom
 *
 * 窓の杜 2026-05-26 記事 / Chrome 148+ origin trial:`<install>` HTML 要素 +
 * PWA manifest の inline 構造を verify。
 *
 * v1 では `<install>` 要素を body に常駐させる方針だったが、視認上邪魔だった
 * ため(user feedback 2026-05-27)撤去。manifest のみ inline、browser の
 * アドレスバー / メニュー native UI から install してもらう運用に切替。
 *
 * release-builder.ts が `dist/pkc2.html` に正しく埋め込んだか dist file を
 * 読んで assert する(build artifact 検証)。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST_PATH = resolve(process.cwd(), 'dist/pkc2.html');

describe('PWA manifest inline(窓の杜 2026-05-26)', () => {
  if (!existsSync(DIST_PATH)) {
    it.skip('dist/pkc2.html が存在しないため skip(npm run build:release で生成必要)', () => {});
    return;
  }

  const html = readFileSync(DIST_PATH, 'utf8');

  it('case 1: <link rel="manifest"> が inline data URL で埋め込まれる', () => {
    expect(html).toMatch(/<link rel="manifest" href="data:application\/manifest\+json;base64,[A-Za-z0-9+/=]+"/);
  });

  it('case 2: manifest JSON が valid + 必須 field を含む(id / name / start_url / display / icons)', () => {
    const match = /<link rel="manifest" href="data:application\/manifest\+json;base64,([A-Za-z0-9+/=]+)"/.exec(html);
    expect(match).not.toBeNull();
    const b64 = match![1]!;
    const manifest = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    expect(manifest.id).toBe('pkc2-personal-knowledge-container');
    expect(manifest.name).toContain('PKC2');
    expect(manifest.short_name).toBe('PKC2');
    expect(manifest.start_url).toBe('.');
    expect(manifest.display).toBe('standalone');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('case 3: manifest.id field が `<install>` element 動作に必須(Chrome 148+)', () => {
    const match = /<link rel="manifest" href="data:application\/manifest\+json;base64,([A-Za-z0-9+/=]+)"/.exec(html);
    const manifest = JSON.parse(Buffer.from(match![1]!, 'base64').toString('utf8'));
    expect(manifest.id).toBeTruthy();
    expect(typeof manifest.id).toBe('string');
  });

  it('case 4: manifest 内の icons は src を持つ(favicon を data URL で参照)', () => {
    const match = /<link rel="manifest" href="data:application\/manifest\+json;base64,([A-Za-z0-9+/=]+)"/.exec(html);
    const manifest = JSON.parse(Buffer.from(match![1]!, 'base64').toString('utf8'));
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(/^data:image\//);
      expect(icon.sizes).toBeTruthy();
      expect(icon.type).toBeTruthy();
    }
  });

  it('case 5: manifest に theme_color / background_color が含まれる', () => {
    const match = /<link rel="manifest" href="data:application\/manifest\+json;base64,([A-Za-z0-9+/=]+)"/.exec(html);
    const manifest = JSON.parse(Buffer.from(match![1]!, 'base64').toString('utf8'));
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('case 6: `<install>` 常駐 element は撤去済(user feedback 2026-05-27、視認上邪魔)', () => {
    expect(html).not.toMatch(/<install\s+id="pkc-pwa-install"/);
    expect(html).not.toContain('pkc-pwa-install-fallback');
  });

  it('case 7: manifest に display=standalone(PWA install 時に独立 window)', () => {
    const match = /<link rel="manifest" href="data:application\/manifest\+json;base64,([A-Za-z0-9+/=]+)"/.exec(html);
    const manifest = JSON.parse(Buffer.from(match![1]!, 'base64').toString('utf8'));
    expect(manifest.display).toBe('standalone');
  });

  it('case 8: manifest に lang/dir/categories が含まれる(検索性 / accessibility)', () => {
    const match = /<link rel="manifest" href="data:application\/manifest\+json;base64,([A-Za-z0-9+/=]+)"/.exec(html);
    const manifest = JSON.parse(Buffer.from(match![1]!, 'base64').toString('utf8'));
    expect(manifest.lang).toBe('ja');
    expect(manifest.dir).toBe('ltr');
    expect(Array.isArray(manifest.categories)).toBe(true);
  });
});
