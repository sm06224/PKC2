/**
 * @vitest-environment happy-dom
 *
 * user bug 報告 2026-05-28「マルチウィンドウ時にスクショ貼付がメインウィンドウと
 * 同じようにアセット埋め込みにならないバグありです」 fix verify。
 *
 * `exposePasteApi(dispatcher)` で `window.PKC.pasteAttachment(payload)` を namespace に
 * 設置、child window から `window.opener.PKC.pasteAttachment(...)` で呼ぶ動線。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exposePasteApi, type PastePayload } from '@adapter/ui/expose-paste-api';
import type { Dispatcher } from '@adapter/state/dispatcher';

function makeFakeDispatcher() {
  const dispatched: { type: string; [k: string]: unknown }[] = [];
  return {
    dispatched,
    dispatch(a: { type: string; [k: string]: unknown }) {
      dispatched.push(a);
    },
    getState() { return null; },
    onState() { return () => {}; },
    onEvent() { return () => {}; },
  };
}

describe('exposePasteApi', () => {
  beforeEach(() => {
    const w = window as unknown as { PKC?: unknown };
    delete w.PKC;
  });

  afterEach(() => {
    const w = window as unknown as { PKC?: unknown };
    delete w.PKC;
  });

  it('case 1: window.PKC.pasteAttachment を namespace に設置', () => {
    const disp = makeFakeDispatcher();
    exposePasteApi(disp as unknown as Dispatcher);
    const w = window as unknown as { PKC?: { pasteAttachment?: (p: PastePayload) => void } };
    expect(typeof w.PKC?.pasteAttachment).toBe('function');
  });

  it('case 2: pasteAttachment(payload) で PASTE_ATTACHMENT dispatch', () => {
    const disp = makeFakeDispatcher();
    exposePasteApi(disp as unknown as Dispatcher);
    const w = window as unknown as { PKC: { pasteAttachment: (p: PastePayload) => void } };
    w.PKC.pasteAttachment({
      name: 'screenshot.png',
      mime: 'image/png',
      size: 1024,
      assetKey: 'att-mw-test',
      assetData: 'base64data',
      contextLid: 'lid-x',
    });
    expect(disp.dispatched).toHaveLength(1);
    expect(disp.dispatched[0]).toMatchObject({
      type: 'PASTE_ATTACHMENT',
      name: 'screenshot.png',
      mime: 'image/png',
      size: 1024,
      assetKey: 'att-mw-test',
      assetData: 'base64data',
      contextLid: 'lid-x',
    });
  });

  it('case 3: 既存 window.PKC を保持(idempotent + 非破壊)', () => {
    const w = window as unknown as { PKC?: { ast?: unknown; pasteAttachment?: unknown } };
    w.PKC = { ast: 'existing-ast-api' };
    const disp = makeFakeDispatcher();
    exposePasteApi(disp as unknown as Dispatcher);
    expect(w.PKC.ast).toBe('existing-ast-api'); // 既存 namespace 保持
    expect(typeof w.PKC.pasteAttachment).toBe('function'); // 追加
  });

  it('case 4: 再呼出しでも既存 function を上書きしない(idempotent)', () => {
    const disp1 = makeFakeDispatcher();
    exposePasteApi(disp1 as unknown as Dispatcher);
    const w = window as unknown as { PKC: { pasteAttachment: (p: PastePayload) => void } };
    const first = w.PKC.pasteAttachment;
    const disp2 = makeFakeDispatcher();
    exposePasteApi(disp2 as unknown as Dispatcher);
    expect(w.PKC.pasteAttachment).toBe(first); // 同 reference 保持
  });

  it('case 5: optional fields(originalAssetData / optimizationMeta)対応', () => {
    const disp = makeFakeDispatcher();
    exposePasteApi(disp as unknown as Dispatcher);
    const w = window as unknown as { PKC: { pasteAttachment: (p: PastePayload) => void } };
    w.PKC.pasteAttachment({
      name: 'x.png', mime: 'image/png', size: 100,
      assetKey: 'k', assetData: 'd', contextLid: 'l',
      originalAssetData: 'orig',
      optimizationMeta: { method: 'webp', quality: 0.8 },
    });
    expect(disp.dispatched[0]).toMatchObject({
      originalAssetData: 'orig',
      optimizationMeta: { method: 'webp', quality: 0.8 },
    });
  });
});
