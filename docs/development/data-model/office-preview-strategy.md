# Office File Preview Strategy

Status: CANDIDATE
Created: 2026-04-12
Category: C. Data Model Extensions

---

## 1. 短い結論

attachment として保存された office file（.xlsx / .docx / .pptx / .pdf）を
PKC2 内で preview できるようにする方針を定める。
external viewer なしで中身を確認できる最低限の経路を用意する。

---

## 2. 背景 / 問題

PKC2 は attachment を base64 で保存するが、
office 系ファイルは preview 不可で「存在することしか分からない」。
業務メモに実ファイルを添付する用途では、これは大きな制約になる。

---

## 3. ユーザ価値

- 添付された office file の内容を開かず確認できる
- external viewer の依存を減らせる
- offline / embedded 配布環境でも preview が成立する
- attachment が「実用的な情報容器」として機能する

---

## 4. 最小スコープ

- .pdf: PDF.js 相当の軽量 viewer を bundle（既にある場合は再利用）
- .xlsx: 1 sheet 目を表形式で表示（読み取り専用）
- .docx: 本文 text を markdown に変換して表示
- .pptx: スライド順にテキスト抽出して表示
- 複雑レイアウト / 数式 / 画像埋め込みは非対応でよい

---

## 5. やらないこと

- office file の編集
- 高忠実度な視覚再現（レイアウト / font）
- 動画 / embed 要素の再生
- cloud-based viewer 呼び出し（ネットワーク依存）
- マクロ実行

---

## 6. 設計の方向性

- features 層に `extractOfficePreview(blob, kind)` pure 相当関数を配置
- 軽量 library を dynamic import（attachment を開いたときのみ load）
- 変換結果は markdown or `string[][]` で presenter に渡す
- attachment presenter を拡張、他 archetype は触らない
- 失敗時は既存 fallback（ファイル名のみ表示）

---

## 7. リスク / 未確定事項

- bundle size 増加（dynamic import 前提でも impact あり）
- ライブラリのライセンス（MIT / Apache 優先）
- 文字化け / 日本語対応
- 大容量ファイルのメモリ消費
- single-HTML build policy との整合（relaxed sandbox が必須か）

---

## 8. 将来拡張の余地

- .odt / .ods / .rtf 対応
- 画像抽出
- 全文 index への統合（A-4 検索）
- C-4 spreadsheet entry への変換 import
- PDF の text layer 抽出 → 検索対象化
