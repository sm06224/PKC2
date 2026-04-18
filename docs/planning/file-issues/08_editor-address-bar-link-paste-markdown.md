# FI-08 — アドレスバーからコピーした URL + タイトルを Markdown リンクに整形

## Status

proposed

## Priority

**P2**（日常作業の手数削減 / 既存機能の補強）

## Problem

- ブラウザのアドレスバーから URL をコピーすると、クリップボードには**URL テキスト**と**HTML アンカーリンク（ページタイトル + URL）**の両方が入る。
- PKC の貼付経路は現状、アドレスバー由来のこの HTML も**ラベルだけ**取り出したり**URL だけ**になったりで、「ページタイトル + URL」の情報を**Markdown リンク**として復元できていない（少なくとも一部ブラウザ / 経路で）。
- S-25（HTML paste → Markdown link 正規化）で anchor 要素の正規化は入っているが、**アドレスバー由来の text/html** 特殊形式が想定されているかは要確認。

## User value / risk

- **Value**: ブラウザから URL をコピー → PKC に貼付するだけで `[ページタイトル](URL)` が入る。頻出操作の手数が最小化。
- **Risk**: HTML paste の解釈が S-25 と互いに壊す可能性があるため、既存動作との regression 確認が必須。

## Scope boundary

### この issue に含む

- アドレスバー由来の text/html clipboard を **Markdown リンク形式で貼付**できるよう S-25 経路を補強 / 拡張
- 安全な URL scheme の継続適用（S-25 の javascript: / data: / vbscript: ブロック継承）
- TEXT 本文の textarea に限定（S-25 と同一 scope）

### この issue に含まない

- textlog / form / folder description 等への拡張
- OGP 等によるタイトル再取得
- 複数 URL 一括貼付の特殊挙動

## Expected pipeline

1. minimum scope — 主要ブラウザ（Chrome / Safari / Firefox / Edge）のアドレスバー clipboard 実挙動調査と再現手順固定
2. behavior contract — S-25 の FIND-REPLACE や paste contract との非破壊境界を明示
3. implementation — `src/adapter/ui/html-paste-to-markdown.ts` の拡張
4. audit — S-25 regression セット走らせる
5. manual — 05 日常操作（「リンクをコピーして貼り付けても URL が残らない」の既存記述整合確認）

## Dependencies

- S-25（HTML paste → Markdown link 正規化、commit d6c2d7b 近傍）
- `src/adapter/ui/html-paste-to-markdown.ts`
- `src/adapter/ui/action-binder.ts` の paste handler

## Notes

- 既存 09 トラブルシューティング §「リンクをコピーして貼り付けても URL が残らない」と矛盾しないよう manual 更新時に確認。
- 既に S-25 で吸収済み / 部分的に動作している可能性あり、minimum scope 段階で「本当に未解決か」の動作確認を**最初に**すること。
