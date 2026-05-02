# Asset Autocomplete — Modifier-Enter policy mirror

**Status**: implementation — 2026-04-20.
**Scope**: asset-autocomplete popup が開いている間の **Ctrl+Enter / Cmd+Enter** を、entry-ref autocomplete v1.5 と同一の policy（popup を閉じて event を pass through）に合わせる極小 mirror PR。

## 1. Canonical decision

policy の決定・根拠・A/B/C 比較は以下の canonical doc にある:

- `docs/development/archived/entry-autocomplete/entry-autocomplete-v1.5-modifier-enter.md`

本 doc は **機械的な mirror 適用の記録** であり、policy 自体の再議論ではない。

## 2. 現状挙動（修正前）

`src/adapter/ui/asset-autocomplete.ts:243` の popup keyboard handler:

```ts
case 'Enter':
case 'Tab':
  e.preventDefault();
  insertCandidate(visibleCandidates[selectedIndex]!);
  return true;
```

`e.key === 'Enter'` は plain / Ctrl / Cmd / Shift / Alt すべてで真 → **Ctrl+Enter でも candidate を accept** していた。entry-ref autocomplete の v1.5 以前と同じミスマッチ: textlog append (`Ctrl+Enter`) の muscle memory と衝突。

## 3. 適用した mirror

`handleAssetAutocompleteKeydown` 内、Escape 直後 / count 0 早期 return の **前** に:

```ts
if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
  closeAssetAutocomplete();
  return false;
}
```

entry-ref v1.5 と行ごとに同じ構造。`return false` で popup が consume せず、action-binder 側の textlog append handler に event が届く。

## 4. スコープ

- 対象: asset autocomplete **のみ**
- entry-ref autocomplete は既に v1.5 で対応済、触らない
- slash-menu は trigger 経路が異なるため本 PR 対象外（canonical doc §8 で言及）
- 新機能なし、既存 API / schema / trigger / 挿入セマンティクス不変

## 5. テスト

`tests/adapter/asset-autocomplete.test.ts` に **7 tests** を追加。観点は entry-ref v1.5 の mirror:

- Ctrl+Enter / Cmd+Enter: popup 閉じる + 値不変 + return false
- plain Enter: 引き続き accept（regression check）
- Shift+Enter / Alt+Enter: accept のまま（Ctrl/Cmd 限定の policy 確認）
- 空リスト + Ctrl+Enter: close + return false（一貫性）
- Ctrl+Tab: スコープ外、accept のまま

既存 asset autocomplete テスト 32 は無変更。

## 6. 関連文書

- `docs/development/archived/entry-autocomplete/entry-autocomplete-v1.5-modifier-enter.md` — canonical policy 決定
- `src/adapter/ui/asset-autocomplete.ts` — 本 PR の修正対象
- `src/adapter/ui/entry-ref-autocomplete.ts` — 先行実装の参考

## 7. Rollback

- 変更は popup handler 内 5 行 + doc 1 件のみ
- `git revert` で前状態（v1.5 後・本 PR 前）に戻せる
- 既存挙動への影響は **Ctrl+Enter / Cmd+Enter のみ**、他キーは不変
