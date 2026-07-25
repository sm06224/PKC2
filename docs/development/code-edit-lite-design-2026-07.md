# 簡易コード編集機構(CodeEditLite)— flags の VSCode 的 settings 体験 / fence その場編集 / テキスト添付編集 — 設計

**Status**: 📐 設計(user 裁定待ち・実装未着手)
**Date**: 2026-07-25
**起源**: user 指示(2026-07-25)
**凍結との関係**: user 発意の明示要望 = プライム・ディレクティブの例外手続き(#911 / #921 前例)。なお凍結台帳 #776 の「領域 4 編集支援(indent / brackets)」は調査の結果**大部分実装済み**(PR #198 key helpers + PR #201 iPhone snippet toolbar)と判明 — 本件はその**適用面の拡大**(コードブロック / 添付 / flags)として位置づける

---

## §0 user 指示と裁定(2026-07-25)

> アセットとコードブロック両方を対象とした簡易的な編集機能をつけます。これは実態としては、flags を vscode 的な settings 編集体験を可能にしたい欲求からきています。yaml, json, xml, javascript, html などのタグ囲み系とインデント、ブラウザネイティブの javascript は欲しい

> 参考として、microsoft の loop のようなコンポーネントを今後実装したい要望もある。そして microsoft が提供しない、onenote と loop の仲介、両方にコンテンツをある程度入出力できるようにします

裁定済みの解釈(user 確認 2026-07-25「あなたの理解でいいですよ」):

1. **「ブラウザネイティブの javascript」= 実装制約**。Monaco / CodeMirror 等の依存を入れず素のブラウザ JS で作る(JS 実行機能の意ではない)
2. **「アセット」= テキスト系添付**(json / yaml / js / html / css / svg / txt 等)の編集・保存(画像等バイナリは対象外)
3. エディタは**値の出し入れ契約が明確な再利用コンポーネント**として切る — 将来の Loop 的コンポーネントの編集基盤になる。OneNote ⇄ Loop 仲介は **PKC-Extensions レーン**(OneNote 脚は設計済 = `onenote-export-extension-design-2026-07.md` #924)で、コアに入れるのは汎用編集基盤まで

## §1 現状調査の要点(2026-07-25、詳細は調査ログ)

**好材料(土台はかなり揃っている)**:

- **S1 の textarea には Tab / Enter / bracket 補完が既に完備**(`editor-key-helpers.ts`、action-binder.ts:5568-5590 から 6 フィールドに配線済み)。純関数として再利用可能
- **syntax highlight は 10 言語**(js / ts / json / html / css / bash / yaml / diff / sql / powershell、`code-highlight.ts`)。**xml だけ未対応**
- **fence の source-line は原文 body の行番号と一致**(preprocessor が LineMap を thread。colon-block 挿入・同一内容 fence 複数でも正確なことを probe で実測検証済み)。S1 通常表示でも `sourceLineAnchors: true`(detail-presenter.ts:117)。frontmatter offset の換算前例あり(action-binder.ts:1396-1406)
- **flags のメタ情報は registry に完備**(`getRegisteredFlags()`: description / category / tier / range / enum / default / current / source)。`__flags__` body は key sort + 2-space の **diff-friendly な pretty JSON**(system-flags-payload.ts)。live getter のため反映に reload 不要
- 行範囲 splice の前例 = 章フォーカス編集の `replaceSectionText`(body-sections.ts:96)/ 書き戻し action = `QUICK_UPDATE_ENTRY`(body のみ・revision snapshot 付き)
- 添付の書き戻し面 = `COMMIT_EDIT`(assets 同梱可)+ `patchAttachmentBody`(attachment-presenter.ts:212)

**制約(設計が守るべき不変条件)**:

- **asset_key → bytes は immutable**。既存 key の上書きは「R1 dirty-tracking が書込を skip + ObjectURL cache が旧 blob を表示し続ける」二重事故になる — 編集保存は必ず**新 key mint + 参照差し替え**(旧 key は orphan として既存の PURGE_ORPHAN_ASSETS 運用へ)
- **contenteditable は不採用**(PKC1 で「irrecoverable layout issues」により放棄した記録あり)。textarea + highlight overlay 方式が invariant(pure renderer / IME isComposing ガード)と整合
- S2 Viewer popup / S4 entry-window は action-binder の無い独立 document — **編集 UI は S1 限定**とし、features 層 wrapper にボタンを足さない(S2 死にボタン問題の再生産回避)
- 編集シードは **DOM からではなく原文 body の行 slice から**取る(rendered source は preprocessor で原文と乖離しうる)

**調査で見つかった既存の乖離(本件スコープ外、別途扱う)**:

- flag Tier の runtime gate が spec と違い reducer 未実装(caller 責務のまま)/ readonly 時 SET_FLAG 拒否のコメントと実装の乖離 / S4 entry-window に editor-key-helpers 未移植 / `requiresReload` オプション定義のみで未消費

## §2 コア部品: CodeEditLite(依存ゼロ・再利用)

**素の textarea + 既存 highlight の overlay** で構成する軽量エディタ部品。

- `src/adapter/ui/code-edit-lite.ts`: `<textarea>`(透明文字色 + caret のみ)+ 背面 `<pre>`(code-highlight.ts で色付け)を重ね、入力ごとに overlay を再描画・scroll を同期(mirror-div 実測 = editor-line-metrics.ts / echo 抑止付き同期 = source-preview-sync.ts の既存部品を流用)。IME は `isComposing` ガード(既存慣行)
- **編集支援(features 層純関数、新設 + 再利用)**:
  - Tab / Shift+Tab(複数行 indent / outdent)・Enter の indent 継承 + ブロック開始(`{` `[` `(` / タグ開き / yaml の `:` 末尾)で +1 段 — **既存 `editor-key-helpers.ts` を最大限再利用**し、不足分(言語別 indent 規則)だけ `code-edit-helpers.ts` に足す
  - bracket / quote auto-close(既存 helpers)
  - **タグ囲み系**(html / xml): `>` 入力時の閉じタグ自動補完(`<div>` → `</div>` を挿入し caret を間に)+ **選択範囲をタグで wrap**(`Ctrl+Shift+W` 等 → タグ名入力)
- **言語**: json / yaml / js / html / css(+ **xml rule を code-highlight.ts に追加** — 唯一の highlight 欠落)
- **Host 契約**(Loop 的コンポーネントへの布石):

```ts
interface CodeEditHost {
  value: string;                 // シード(呼び出し元が原文から用意)
  lang: string;                  // highlight / 編集支援の言語
  validate?: (value: string) => EditError[];  // 行番号つきエラー(なければ常に valid)
  onCommit: (value: string) => void;          // 保存(書き戻しは host 責務)
  onCancel: () => void;
}
```

  fence / 添付 / flags / 将来のコンポーネントブロックが**同じ契約**で刺さる。部品はエラー表示枠(行 + message、valid になるまで commit 不可)を内蔵

## §3 適用 ①: flags の VSCode 的 settings 体験(本丸)

VSCode の settings が「GUI 一覧」と「settings.json 生編集」の 2 面であるのに倣い、既存 Flags Inspector(GUI 面は既にかなり充実)に **「{} JSON」編集面**を追加する。

- Inspector 上部に表示切替(一覧 ⇄ JSON)。JSON 面は `__flags__` values の pretty JSON(既存 serialize がそのまま使える)を CodeEditLite(lang=json)で編集
- **validation**(部品の validate 契約で実装): JSON parse エラー(行付き)→ envelope 検査 → **registry 照合**(未知 key は警告表示・保存は可 = 残骸 key と同じ扱い / 型・range・enum 違反はエラーで保存不可 / tier 2 key の変更はエラー)。現状 console.warn に沈んでいた violation がユーザーに見えるようになる
- **書き戻しは既存 action の連発で行う(新 action を作らない)**: 適用時に現 values との diff を取り、変更 key を `SET_FLAG`、削除 key を `RESET_FLAG` で dispatch。event 粒度・永続化・FLAGS_CHANGED 連鎖が既存とまったく同じになり、reducer 変更ゼロ
- 既定値と異なる key は JSON 面でも視覚表示(行 gutter マーク。最低限 footer の Active 件数連携)。URL override 中の key は readonly 注記(既存 GUI 面と同じ)

## §4 適用 ②: コードブロックのその場編集(S1 限定)

- S1 の post-render enhance(hydrator と同じ adapter 層 DOM 注入)で、code block(標準規約 wrapper + 通常 fence)に**「✎ 編集」ボタン**を追加(copy ⧉ の隣、hover reveal)。features 層 markup には足さない
- ✎ → ブロック位置に CodeEditLite を開く。**シードは data-pkc-source-line / source-end + frontmatter offset で原文 body から行 slice**
- 保存 = fence 内容の行範囲 splice(`replaceFenceText` 純関数を `body-sections.ts` の `replaceSectionText` と同型で新設)→ `QUICK_UPDATE_ENTRY`(revision が 1 つ積まれる = undo 可能)
- `phase === 'editing'` 中と readonly では ✎ を出さない(全文編集と競合させない)。ESC / cancel で破棄。編集状態は ephemeral
- S2 / S4 は閲覧のみ(調査どおり。将来要望が立ったら別設計)

## §5 適用 ③: テキスト添付の編集

- テキスト判定の拡張: 現状 md / txt 系のみの `isTextConvertibleAttachment` を mime `text/*` + 拡張子(json / yaml / yml / js / mjs / css / html / xml / svg / csv 等)へ拡張
- attachment-presenter に「✎ 編集」: `decodeAttachmentText` → CodeEditLite(拡張子から lang 推定)→ 保存 = **新 asset_key を mint**(`generateAssetKey`)+ `patchAttachmentBody` で参照差し替え + 既存 commit 経路
- 旧 key は orphan として残す(自動 purge しない)。「revision 復元で旧 asset が要る」既存トレードオフをそのまま踏襲し、掃除は既存の PURGE_ORPHAN_ASSETS 運用に乗せる
- text → base64 の共有ユーティリティを新設し、散在するインラインパターンを集約(自己免疫)

## §6 スコープ外(明記)

- JS の実行機能(裁定: 実装制約の意)/ 外部エディタ依存 / S2・S4 での編集 / `requiresReload` の実装 / collaborative 編集
- **Loop 的コンポーネント本体と OneNote ⇄ Loop 仲介の実装** — 拡張レーンで別設計(OneNote 脚 = #924 設計済み。Loop 脚は Graph API / .loop ファイルの制約整理から)。本設計はその編集基盤(Host 契約)を先に置くところまで
- §1 で見つかった既存乖離 4 件は本件に混ぜない(別 Issue 化を提案: tier gate / readonly ガード / S4 key-helpers 移植 / requiresReload)

## §7 実装プラン(裁定後、4 PR)

| PR | 内容 | 規模 |
|---|---|---|
| **PR-1 部品** | features 純関数(言語別 indent / タグ補完・wrap)+ xml highlight rule + CodeEditLite 部品 + unit | S〜M |
| **PR-2 flags(本丸)** | Inspector の JSON 編集面 + registry validation + SET_FLAG/RESET_FLAG diff 書き戻し + parity | M |
| **PR-3 fence 編集** | S1 enhance ✎ + 原文行 slice シード + replaceFenceText + QUICK_UPDATE_ENTRY + parity | M |
| **PR-4 添付編集** | テキスト判定拡張 + ✎ 編集 + 新 key mint 保存 + text⇄base64 集約 + parity | M |

各 PR: お知らせ掲載 + マニュアル反映(flags = 13 章 / コードブロック = 12 章 / 添付 = 該当章、実装時に確認)。視覚機能につき parity test 必須。

## §8 裁定をお願いしたい点(推奨付き)

1. **flags の書き戻し** = SET_FLAG / RESET_FLAG の diff 連発(新 action なし・reducer 変更ゼロ)で良いか — 推奨: yes
2. **fence 編集は S1 限定**(S2/S4 は閲覧のみ)で良いか — 推奨: yes(独立 document への編集配線は別次元の工事)
3. **添付編集の旧 key** = orphan 放置 + 既存 purge 運用で良いか — 推奨: yes(自動 purge は revision 復元を壊す)
4. **着手順** = PR-1 部品 → PR-2 flags(本丸)→ PR-3 fence → PR-4 添付 — 推奨: この順
5. **タグ囲みの具体挙動** = 閉じタグ自動補完 + 選択範囲のタグ wrap の両方 — 推奨: 両方
