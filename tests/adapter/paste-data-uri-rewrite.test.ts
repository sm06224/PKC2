/**
 * @vitest-environment happy-dom
 *
 * data: URI(inline base64 画像)paste → asset 化(2026-06-22 user direction、
 * blob: paste の data: 版)。
 *
 * `rewriteDataUriImagesToAssets`(pure)の挙動:
 * - `![alt](data:image/(png|jpeg|gif|webp);base64,...)` を asset item へ抽出 + 本文を
 *   `asset:<key>` へ置換、alt 保持
 * - 同一 data: URI の複数 occurrence を 1 asset に dedup(同 key で全置換)
 * - SVG / 非 image / 非 base64 / link 形は対象外(原文維持)
 * - **描画 parity**: asset-resolver で `asset:<key>` を戻すと元の data: URI に byte 一致
 * + paste handler 統合(paste event → BATCH_PASTE_ATTACHMENTS → container.assets + 本文置換)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  rewriteDataUriImagesToAssets,
  hasDataUriImageMarkdown,
} from '@adapter/ui/paste-data-uri-rewrite';
import { resolveAssetReferences } from '@features/markdown/asset-resolver';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

// 1x1 PNG(実体は decode されないが現実的な base64 を使う)。
const B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('rewriteDataUriImagesToAssets (pure)', () => {
  it('単一 data: 画像を asset item へ抽出 + 本文を asset: へ置換', () => {
    const text = `![my cat](data:image/png;base64,${B64})`;
    const r = rewriteDataUriImagesToAssets(text);
    expect(r.processedCount).toBe(1);
    expect(r.attachments).toHaveLength(1);
    expect(r.attachments[0]!.mime).toBe('image/png');
    expect(r.attachments[0]!.assetData).toBe(B64);
    expect(r.attachments[0]!.assetKey.startsWith('att-data-')).toBe(true);
    expect(r.rewrittenText).toBe(`![my cat](asset:${r.attachments[0]!.assetKey})`);
    expect(r.rewrittenText).not.toContain('data:');
  });

  it('描画 parity: asset-resolver で戻すと元の data: URI に byte 一致', () => {
    const original = `# doc\n\ntext ![cat](data:image/png;base64,${B64}) tail\n\nend`;
    const r = rewriteDataUriImagesToAssets(original);
    expect(r.rewrittenText).not.toContain('data:');
    const ctx = {
      assets: Object.fromEntries(r.attachments.map((a) => [a.assetKey, a.assetData])),
      mimeByKey: Object.fromEntries(r.attachments.map((a) => [a.assetKey, a.mime])),
    };
    const resolved = resolveAssetReferences(r.rewrittenText, ctx);
    expect(resolved).toBe(original); // 本文だけ軽くなり、描画は不変
  });

  it('同一 data: URI の複数 occurrence は 1 asset に dedup(同 key で全置換、alt 保持)', () => {
    const text = `![a](data:image/png;base64,${B64})\n\n![b](data:image/png;base64,${B64})`;
    const r = rewriteDataUriImagesToAssets(text);
    expect(r.processedCount).toBe(1);
    expect(r.attachments).toHaveLength(1);
    const key = r.attachments[0]!.assetKey;
    expect(r.rewrittenText).toBe(`![a](asset:${key})\n\n![b](asset:${key})`);
  });

  it('複数の異なる data: 画像を全件処理(独立 key)', () => {
    const text = `![a](data:image/png;base64,AAAA) ![b](data:image/gif;base64,BBBB)`;
    const r = rewriteDataUriImagesToAssets(text);
    expect(r.processedCount).toBe(2);
    expect(new Set(r.attachments.map((a) => a.assetKey)).size).toBe(2);
    expect(r.attachments[1]!.mime).toBe('image/gif');
    expect(r.rewrittenText).not.toContain('data:');
  });

  it('jpeg / webp も対象', () => {
    expect(rewriteDataUriImagesToAssets(`![](data:image/jpeg;base64,${B64})`).processedCount).toBe(1);
    expect(rewriteDataUriImagesToAssets(`![](data:image/webp;base64,${B64})`).processedCount).toBe(1);
  });

  it('SVG は対象外(resolver が inline 化しない MIME = 描画退化を避け原文維持)', () => {
    const text = `![](data:image/svg+xml;base64,${B64})`;
    const r = rewriteDataUriImagesToAssets(text);
    expect(r.processedCount).toBe(0);
    expect(r.rewrittenText).toBe(text);
  });

  it('非 image / 非 base64 / link 形は対象外', () => {
    const pdf = `![](data:application/pdf;base64,${B64})`;
    const rawUrl = `![](data:image/png,not-base64-raw)`;
    const link = `[label](data:image/png;base64,${B64})`;
    expect(rewriteDataUriImagesToAssets(pdf).processedCount).toBe(0);
    expect(rewriteDataUriImagesToAssets(rawUrl).processedCount).toBe(0);
    expect(rewriteDataUriImagesToAssets(link).processedCount).toBe(0);
  });

  it('data: 不在は no-op', () => {
    const text = '# heading\n\n![normal](https://example.com/x.png)\n\nplain';
    const r = rewriteDataUriImagesToAssets(text);
    expect(r.processedCount).toBe(0);
    expect(r.rewrittenText).toBe(text);
    expect(rewriteDataUriImagesToAssets('').processedCount).toBe(0);
  });
});

describe('hasDataUriImageMarkdown', () => {
  it('対応 MIME の data: 画像を true 判定', () => {
    expect(hasDataUriImageMarkdown(`![](data:image/png;base64,${B64})`)).toBe(true);
    expect(hasDataUriImageMarkdown(`x ![a](data:image/jpeg;base64,AAAA) y`)).toBe(true);
  });
  it('対象外は false 判定', () => {
    expect(hasDataUriImageMarkdown('')).toBe(false);
    expect(hasDataUriImageMarkdown('plain text')).toBe(false);
    expect(hasDataUriImageMarkdown(`![](data:image/svg+xml;base64,${B64})`)).toBe(false);
    expect(hasDataUriImageMarkdown(`[link](data:image/png;base64,${B64})`)).toBe(false);
    expect(hasDataUriImageMarkdown('![](https://x.com/a.png)')).toBe(false);
  });
  it('複数回 call で同 result(lastIndex 干渉なし)', () => {
    const t = `![](data:image/png;base64,${B64})`;
    expect(hasDataUriImageMarkdown(t)).toBe(true);
    expect(hasDataUriImageMarkdown(t)).toBe(true);
  });
});

describe('action-binder · data: 画像 paste → asset 化(統合)', () => {
  const T = '2026-06-22T00:00:00Z';
  let root: HTMLElement;
  let cleanup: (() => void) | null = null;

  function makeContainer(): Container {
    return {
      meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{ lid: 'e1', title: 'E', body: '', archetype: 'text', created_at: T, updated_at: T }],
      relations: [], revisions: [], assets: {},
    };
  }

  function firePaste(target: HTMLElement, plain: string): Event {
    const evt = new Event('paste', { bubbles: true, cancelable: true });
    const clipboardData = {
      items: [],
      getData(type: string): string {
        return type === 'text/plain' ? plain : '';
      },
    };
    Object.defineProperty(evt, 'clipboardData', { value: clipboardData });
    target.dispatchEvent(evt);
    return evt;
  }

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    return () => {
      cleanup?.();
      root.remove();
    };
  });

  it('paste で PASTE_ATTACHMENT → container.assets 登録 + 本文は asset: 参照', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]')!;
    ta.value = '';
    ta.setSelectionRange(0, 0);

    const evt = firePaste(ta, `![cat](data:image/png;base64,${B64})`);

    // paste は asset 化経路に乗る(default 貼付は抑止)。
    expect(evt.defaultPrevented).toBe(true);

    // container.assets に 1 件登録された(巨大 base64 は本文でなく asset へ)。
    const assets = dispatcher.getState().container!.assets;
    expect(Object.keys(assets)).toHaveLength(1);
    const key = Object.keys(assets)[0]!;
    expect(assets[key]).toBe(B64);

    // 本文(textarea、再 query)は data: でなく asset: 参照。
    const freshTa = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]')!;
    expect(freshTa.value).toContain(`asset:${key}`);
    expect(freshTa.value).not.toContain('data:');
  });
});
