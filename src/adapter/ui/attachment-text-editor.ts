/**
 * テキスト添付のその場編集 — code-edit-lite-design-2026-07 §5
 * (user 裁定 2026-07-25)。
 *
 * **不変条件(調査で特定、設計 §1)**: asset_key → bytes は immutable。
 * 既存 key の上書きは「R1 dirty-tracking が書込を skip + ObjectURL cache が
 * 旧 blob を表示し続ける」二重事故になる。よって編集保存は必ず
 *   ① 新 asset_key を mint（generateAssetKey）
 *   ② 新 base64 を assets へ追加（COMMIT_EDIT の assets 同梱）
 *   ③ body の asset_key を差し替え（patchAttachmentBody）
 * で行う。旧 key は自動 purge せず orphan として残す（revision 復元で
 * 旧 asset が要る既存トレードオフを踏襲、掃除は既存 PURGE_ORPHAN_ASSETS）。
 */

import type { Dispatcher } from '../state/dispatcher';
import type { Entry } from '../../core/model/record';
import { mountCodeEditLite } from './code-edit-lite';
import { showToast } from './toast';
import {
  parseAttachmentBody,
  patchAttachmentBody,
  decodeAttachmentText,
  isEditableTextAttachment,
  langForAttachment,
  generateAssetKey,
} from './attachment-presenter';
import { textToBase64, utf8ByteLength } from '../../features/asset/text-codec';
import { ensureAssetResident } from './action-binder';

const REGION = 'attachment-text-editor';

/**
 * テキスト添付の編集ダイアログを開く。text として復号できない・編集不能
 * 種別・readonly などの場合は toast で中止(黙って壊さない)。
 *
 * async: 添付 bytes が非常駐(lazy loading)なら working-set.ensure を await
 * してから開く(初回クリックで結果を出すため。render cycle を待たない)。
 */
export async function openAttachmentTextEditor(dispatcher: Dispatcher, lid: string): Promise<void> {
  const st = dispatcher.getState();
  if (st.phase !== 'ready') {
    showToast({ message: '編集モード中は添付編集を使えません', kind: 'warn' });
    return;
  }
  const entry = st.container?.entries.find((e) => e.lid === lid);
  if (!entry || entry.archetype !== 'attachment') {
    showToast({ message: 'この添付は編集できません', kind: 'warn' });
    return;
  }
  const att = parseAttachmentBody(entry.body);
  if (!isEditableTextAttachment(att)) {
    showToast({ message: 'このファイル種別はテキスト編集に対応していません', kind: 'warn' });
    return;
  }
  // 非常駐なら bytes をロードしてから再取得(lazy loading 対策)。
  let text = decodeAttachmentText(att, dispatcher.getState().container?.assets);
  if (text === null && att.asset_key) {
    await ensureAssetResident(att.asset_key);
    text = decodeAttachmentText(att, dispatcher.getState().container?.assets);
  }
  if (text === null) {
    showToast({ message: 'ファイル内容を読み込めませんでした(まだ読み込み中か、データが見つかりません)', kind: 'warn' });
    return;
  }

  document.querySelector(`[data-pkc-region="${REGION}"]`)?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'pkc-flags-json-overlay pkc-attachment-edit-overlay';
  overlay.setAttribute('data-pkc-region', REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'テキスト添付編集');

  const card = document.createElement('div');
  card.className = 'pkc-flags-json-card';
  const heading = document.createElement('div');
  heading.className = 'pkc-flags-json-heading';
  heading.textContent = `✎ ${att.name} を編集`;
  card.appendChild(heading);

  const close = (): void => overlay.remove();

  mountCodeEditLite(card, {
    value: text,
    lang: langForAttachment(att),
    commitLabel: '保存',
    onCommit: (next) => {
      commitAttachmentEdit(dispatcher, lid, text, next);
      close();
    },
    onCancel: close,
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  overlay.querySelector<HTMLTextAreaElement>('.pkc-code-edit-input')?.focus();
}

function commitAttachmentEdit(
  dispatcher: Dispatcher,
  lid: string,
  openedText: string,
  nextText: string,
): void {
  const st = dispatcher.getState();
  const entry = st.container?.entries.find((e) => e.lid === lid) as Entry | undefined;
  if (!entry || st.phase !== 'ready') {
    showToast({ message: '保存できませんでした(対象が見つからないか、編集モード中です)', kind: 'error' });
    return;
  }
  // stale guard: 開いた時点の内容とストア現在値が一致するか。
  const att = parseAttachmentBody(entry.body);
  const cur = decodeAttachmentText(att, st.container?.assets);
  if (cur !== openedText) {
    showToast({ message: 'ファイルが変更されていたため保存を中止しました(開き直してください)', kind: 'error' });
    return;
  }
  if (nextText === openedText) {
    showToast({ message: '変更はありませんでした', kind: 'info' });
    return;
  }

  // 不変条件: 新 key を mint(既存 key の bytes は書き換えない)。
  const newKey = generateAssetKey();
  const newB64 = textToBase64(nextText);
  const newBody = patchAttachmentBody(entry.body, {
    asset_key: newKey,
    size: utf8ByteLength(nextText),
    // legacy `data` 直埋めがあれば剥がす(new format = asset_key 参照へ寄せる)。
    data: undefined,
  });
  // COMMIT_EDIT は editing phase でしか通らないため、entry-window save と
  // 同じ transient begin(windowSave = 過渡 UI / viewMode / 選択を変えない)
  // → COMMIT_EDIT の定型で書き戻す(assets 同梱 + revision snapshot)。
  dispatcher.dispatch({ type: 'BEGIN_EDIT', lid, windowSave: true });
  dispatcher.dispatch({
    type: 'COMMIT_EDIT',
    lid,
    title: entry.title,
    body: newBody,
    assets: { [newKey]: newB64 },
  });
  showToast({ message: 'ファイルを保存しました(履歴に 1 版追加)', kind: 'info' });
}
