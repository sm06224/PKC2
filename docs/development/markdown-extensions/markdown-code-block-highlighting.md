# Markdown Extension — Code Block Syntax Highlighting

Status: **COMPLETED 2026-04-13** (commit `92921ec`)
Created: 2026-04-12
Category: B. Markdown / Rendering Extensions
Ledger: USER_REQUEST_LEDGER §2 P-13

---

## 0. 実装サマリ（2026-04-13 完了）

§4 の最小スコープに沿って実装され、commit `92921ec` で landing 済み。
本ドキュメントの §1〜§8 は当時の設計判断記録として保持。

- **highlighter**: `src/features/markdown/code-highlight.ts`（pure
  features 関数。sticky-regex token walker、~3 KB gzipped）
- **対応言語**: javascript / typescript / json / html / css / bash /
  yaml / diff / sql / powershell（aliases: js / jsx / ts / tsx /
  sh / zsh / yml / ps1 / pwsh）
- **markdown-it 統合**: `src/features/markdown/markdown-render.ts`
  L42-45 の `highlight:` hook
- **CSS**: `src/styles/base.css` の `--c-tok-*` カラー変数
  （dark / light 両対応）+ `.pkc-md-rendered pre code .pkc-tok-*`
  selector
- **entry window 同期**: `src/adapter/ui/entry-window.ts` L592-596 で
  `--c-tok-*` 変数を child window に forward、L1012-1024 付近で
  inline CSS にも同じ selector を emit
- **rendered viewer（export HTML）**: `src/adapter/ui/rendered-viewer.ts`
  に print-safe な hardcoded 色を埋め込み
- **テスト**: `tests/features/markdown/code-highlight.test.ts`（18
  件、per-language token coverage + safety / fallback）+
  `tests/features/markdown/markdown-render.test.ts` の追加 case
- **A-2 split editor 経路**: A-2（commit `7d717de`、2026-04-14）で
  追加された entry window split editor preview も同じ markdown-it
  pipeline を通るため自動的に highlight が乗る。回帰テスト pin は
  `tests/adapter/entry-window-syntax-highlight.test.ts` に追加
  （2026-04-14、ledger 整合修正のフォロースルー）

§5「やらないこと」も全項目守られている（任意言語自動判定なし、
theme 切替 UI なし、line number / code 折り畳みなし、live edit 中の
追加処理なし、diff/patch 表示は `diff` 言語の token としてのみ）。

---

---

## 1. 短い結論

fenced code block に言語指定（例: ```` ```ts ````）がある場合、rendered view で syntax highlighting を適用する。
source は fenced block のまま保持、描画時にのみ token 化して色付け。

---

## 2. 背景 / 問題

現状の fenced code block は等幅プレーンテキスト表示のみで、
コード片を貼り付けても構造が目で追いづらい。
技術メモ用途の TEXT / TEXTLOG で価値が大きい。

---

## 3. ユーザ価値

- コード片のキーワード / 文字列 / コメントが色分けされ可読性が上がる
- 技術ログ（TEXTLOG）で「何を書いたか」が一目で分かる
- 言語指定が視覚的な self-documenting になる
- export HTML でも同じ見た目が保たれる

---

## 4. 最小スコープ

- 主要言語（ts / js / json / html / css / md / sh / py）だけ対応
- highlighter は features 層 pure function（string → tokenized HTML）
- markdown renderer の fenced block 処理に hook
- highlighter 依存ライブラリはインライン化可能な軽量実装を優先
- 未対応言語は従来通りプレーン表示にフォールバック

---

## 5. やらないこと

- 任意言語の自動判定
- theme 切替 UI（light / dark は既存 `data-pkc-theme` に追従するだけ）
- コード折り畳み / line number gutter
- live edit 中の highlighting（preview 側のみ）
- diff / patch 表示

---

## 6. 設計の方向性

- features 層に `highlight(lang, src): string` pure function を追加
- markdown renderer から呼び出し、HTML をエスケープ済み span 列で返す
- CSS 変数（`--c-syntax-keyword` 等）で色定義、theme 側で override
- bundle size を監視し、重くなる場合は dynamic import 検討
- 失敗時は元の `<pre><code>` に fallback

---

## 7. リスク / 未確定事項

- highlighter ライブラリのライセンス / サイズ
- 正規表現ベース実装の精度限界（ネストした template string など）
- theme 色の定義数が増えすぎないか
- entry window の inline CSS に color 定義を同期する手間

---

## 8. 将来拡張の余地

- 言語拡張（go / rust / sql / yaml 等）
- copy-to-clipboard ボタン
- line number 表示 toggle
- diff highlight（`diff` 言語指定時）
- B-1（CSV table）との info string 規約統一
