/**
 * @vitest-environment happy-dom
 *
 * asset の bytes 不在が確定した添付を「⏳ 読み込み中」で固まらせない。
 *
 * 背景(視覚監査 2026-07-25、docs/development/visual-audit-2026-07-25.md §2 A4):
 * 添付の presenter は「asset_key はあるが bytes が手元に無い」を
 * `trulyStripped`(Light export で意図的に除去)と `pendingHydration`
 * (まだ読み込んでいないだけ)の 2 状態にしか分解していなかった。
 * 「**store にも実体が無い**」第 3 の状態が無いので、asset_key が実在しない
 * 添付は永久に「⏳ ファイル読み込み中…」のまま。user には重いのか壊れたのか
 * 区別できず、リポジトリの「silent fail 禁止」ドクトリンにも反していた。
 *
 * 判定源は **store が clean な null を返したという事実だけ**。時間ベースの
 * 諦め(タイムアウト)は誤検知で Light export の説明を消してしまうので入れない。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { attachmentPresenter, setAttachmentLightSourceHint } from '@adapter/ui/attachment-presenter';
import {
  markAssetAbsent,
  markAssetPresent,
  isAssetConfirmedAbsent,
  resetAssetAbsence,
  assetAbsenceRevision,
} from '@features/asset/asset-absence';
import type { Entry } from '@core/model/record';

const TS = '2026-01-01T00:00:00Z';
const KEY = 'ast-ghost';

function mkEntry(assetKey = KEY): Entry {
  return {
    lid: 'a1',
    title: '添付',
    body: JSON.stringify({ name: 'x.bin', mime: 'application/octet-stream', asset_key: assetKey, size: 10 }),
    archetype: 'attachment',
    created_at: TS,
    updated_at: TS,
  };
}

function render(entry: Entry, assets: Record<string, string> = {}): HTMLElement {
  const el = attachmentPresenter.renderBody(entry, assets);
  document.body.appendChild(el);
  return el;
}

describe('A4 asset の不在確定を「読み込み中」で固まらせない', () => {
  beforeEach(() => {
    resetAssetAbsence();
    setAttachmentLightSourceHint(false);
    document.body.innerHTML = '';
  });
  afterEach(() => {
    resetAssetAbsence();
    setAttachmentLightSourceHint(false);
  });

  it('不在が未確定なら従来どおり「読み込み中」(まだ諦めない)', () => {
    const el = render(mkEntry());
    expect(el.querySelector('[data-pkc-region="attachment-loading"]')).not.toBeNull();
    expect(el.querySelector('[data-pkc-region="attachment-missing"]')).toBeNull();
  });

  it('不在が確定したら「見つかりません」に切り替わる', () => {
    markAssetAbsent(KEY);
    const el = render(mkEntry());
    expect(
      el.querySelector('[data-pkc-region="attachment-missing"]'),
      '不在確定後も ⏳ のままになっている',
    ).not.toBeNull();
    expect(el.querySelector('[data-pkc-region="attachment-loading"]')).toBeNull();
  });

  it('真の Light export は「見つかりません」に降格させない(事故と混同しない)', () => {
    // Light export は「意図的にデータを外した」状態。事故と同じ文言にすると
    // user に不要な不安を与える。
    setAttachmentLightSourceHint(true);
    markAssetAbsent(KEY);
    const el = render(mkEntry());
    expect(el.querySelector('.pkc-attachment-stripped')).not.toBeNull();
    expect(el.querySelector('[data-pkc-region="attachment-missing"]')).toBeNull();
  });

  it('不在確定でもダウンロード導線は残す(保存領域の直読みという逃げ道)', () => {
    markAssetAbsent(KEY);
    const el = render(mkEntry());
    expect(
      el.querySelector('[data-pkc-action="download-attachment"]'),
      '復旧の逃げ道まで消してはいけない',
    ).not.toBeNull();
  });

  it('bytes が見つかれば不在判定は取り消される', () => {
    markAssetAbsent(KEY);
    expect(isAssetConfirmedAbsent(KEY)).toBe(true);
    markAssetPresent(KEY);
    expect(isAssetConfirmedAbsent(KEY)).toBe(false);
    const el = render(mkEntry());
    expect(el.querySelector('[data-pkc-region="attachment-missing"]')).toBeNull();
  });

  it('container 差し替え(reset)で古い不在判定が残らない', () => {
    markAssetAbsent(KEY);
    resetAssetAbsence();
    expect(isAssetConfirmedAbsent(KEY)).toBe(false);
  });

  it('revision は状態が実際に変わったときだけ進む(publish ループを作らない)', () => {
    const r0 = assetAbsenceRevision();
    markAssetAbsent(KEY);
    const r1 = assetAbsenceRevision();
    expect(r1).toBeGreaterThan(r0);
    markAssetAbsent(KEY); // 同じ key を再度
    expect(assetAbsenceRevision(), '同一 key の再記録で revision が動いている').toBe(r1);
  });
});
