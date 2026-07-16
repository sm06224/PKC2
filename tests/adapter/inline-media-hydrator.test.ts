/**
 * @vitest-environment happy-dom
 *
 * #921 — inline-media-hydrator(共有化した asset 参照 chip → 埋め込み
 * プレーヤー hydration)の unit test。S2 Viewer / S4 entry-window との
 * 共有前提の container 引数 API を検証する。実描画の parity は
 * tests/smoke/inline-media-embed-parity.spec.ts(実 Chromium)が担う。
 */
import { describe, it, expect } from 'vitest';
import { hydrateInlineAssetPreviews, buildInlineAssetIndex } from '@adapter/ui/inline-media-hydrator';
import type { Container } from '@core/model/container';

const T = '2026-07-16T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-921', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      {
        lid: 'a1', title: 'rec.webm', archetype: 'attachment',
        body: JSON.stringify({ name: 'rec.webm', mime: 'audio/webm', size: 10, asset_key: 'kaud' }),
        created_at: T, updated_at: T,
      },
      {
        lid: 'a2', title: 'cap.webm', archetype: 'attachment',
        body: JSON.stringify({ name: 'cap.webm', mime: 'video/webm', size: 10, asset_key: 'kvid' }),
        created_at: T, updated_at: T,
      },
      {
        lid: 'a3', title: 'doc.pdf', archetype: 'attachment',
        body: JSON.stringify({ name: 'doc.pdf', mime: 'application/pdf', size: 10, asset_key: 'kpdf' }),
        created_at: T, updated_at: T,
      },
      {
        lid: 'a4', title: 'data.zip', archetype: 'attachment',
        body: JSON.stringify({ name: 'data.zip', mime: 'application/zip', size: 10, asset_key: 'kzip' }),
        created_at: T, updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: { kaud: 'QUJD', kvid: 'QUJD', kpdf: 'QUJD', kzip: 'QUJD' },
  };
}

function makeRoot(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('hydrateInlineAssetPreviews(#921)', () => {
  it('audio chip → <audio controls> 挿入 + chip 非表示 + blob URL 記録', () => {
    const root = makeRoot('<p><a href="#asset-kaud">🎵 rec.webm</a></p>');
    hydrateInlineAssetPreviews(root, makeContainer());
    const audio = root.querySelector<HTMLAudioElement>('.pkc-inline-audio-preview')!;
    expect(audio).not.toBeNull();
    expect(audio.controls).toBe(true);
    expect(audio.getAttribute('data-pkc-blob-url')).toMatch(/^blob:/);
    expect(root.querySelector('source')!.getAttribute('type')).toBe('audio/webm');
    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-kaud"]')!;
    expect(chip.style.display).toBe('none');
    expect(chip.nextElementSibling!.getAttribute('data-pkc-inline-preview')).toBe('audio');
  });

  it('video chip → <video controls>、pdf は chip を残す、非対象 MIME は無変換', () => {
    const root = makeRoot(
      '<p><a href="#asset-kvid">🎬 cap</a></p>'
      + '<p><a href="#asset-kpdf">📄 doc</a></p>'
      + '<p><a href="#asset-kzip">🗜 zip</a></p>',
    );
    hydrateInlineAssetPreviews(root, makeContainer());
    expect(root.querySelector('.pkc-inline-video-preview')).not.toBeNull();
    expect(root.querySelector('.pkc-inline-pdf-preview')).not.toBeNull();
    // pdf chip は可視のまま(fallback 判定が不確実)
    expect(root.querySelector<HTMLAnchorElement>('a[href="#asset-kpdf"]')!.style.display).not.toBe('none');
    // zip はプレビュー対象外
    expect(root.querySelector<HTMLAnchorElement>('a[href="#asset-kzip"]')!.nextElementSibling).toBeNull();
  });

  it('冪等: 2 回呼んでもプレビューは重複しない', () => {
    const root = makeRoot('<p><a href="#asset-kaud">🎵 rec</a></p>');
    const c = makeContainer();
    hydrateInlineAssetPreviews(root, c);
    hydrateInlineAssetPreviews(root, c);
    expect(root.querySelectorAll('[data-pkc-inline-preview]')).toHaveLength(1);
  });

  it('excludeClosest 配下の chip は skip(edit preview 除外)', () => {
    const root = makeRoot(
      '<div class="pkc-text-edit-preview"><a href="#asset-kaud">🎵 rec</a></div>'
      + '<div class="normal"><a href="#asset-kvid">🎬 cap</a></div>',
    );
    hydrateInlineAssetPreviews(root, makeContainer(), { excludeClosest: '.pkc-text-edit-preview' });
    expect(root.querySelector('.pkc-inline-audio-preview')).toBeNull();
    expect(root.querySelector('.pkc-inline-video-preview')).not.toBeNull();
  });

  it('未知 asset key / データ欠落は安全に no-op(chip 温存 = download は生きる)', () => {
    const root = makeRoot('<p><a href="#asset-nope">🎵 gone</a></p>');
    hydrateInlineAssetPreviews(root, makeContainer());
    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
    expect(root.querySelector<HTMLAnchorElement>('a')!.style.display).not.toBe('none');
  });

  it('buildInlineAssetIndex は assets 本体と legacy inline data の両方を引ける', () => {
    const c = makeContainer();
    // legacy: assets に無く attachment body の data に持つ
    c.entries.push({
      lid: 'a5', title: 'legacy.mp3', archetype: 'attachment',
      body: JSON.stringify({ name: 'legacy.mp3', mime: 'audio/mpeg', data: 'QUJD', asset_key: 'kleg' }),
      created_at: T, updated_at: T,
    });
    const idx = buildInlineAssetIndex(c);
    expect(idx.get('kaud')).toEqual({ mime: 'audio/webm', base64: 'QUJD' });
    expect(idx.get('kleg')).toEqual({ mime: 'audio/mpeg', base64: 'QUJD' });
  });
});
