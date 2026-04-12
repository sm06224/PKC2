# Document Set Archetype

Status: CANDIDATE
Created: 2026-04-12
Category: C. Data Model Extensions

---

## 1. 短い結論

複数 entry を「1 つの document」として束ねる `document-set` archetype を導入する。
章立てされた文書・書籍・マニュアル・プロジェクト報告書を entry 群として構成する。

---

## 2. 背景 / 問題

長い文書を 1 entry に詰め込むと：

- 編集しづらい
- 検索が粗い
- revision の粒度が粗い

一方、複数 entry に分割すると、
「1 つの document として通読 / export / 共有」する手段が無い。

---

## 3. ユーザ価値

- 章ごとに entry を分けつつ、全体として 1 document として扱える
- 通読 view / 一括 export ができる
- 各章を独立して編集・revision 管理できる
- マニュアル / 論文 / 書籍 のような長期コンテンツに適する

---

## 4. 最小スコープ

- 新 archetype `document-set` を登録
- body は JSON: `{ childLids: string[], title, order }` 形式（child は通常 entry）
- presenter view = 子 entry を順に連結して 1 document として表示
- edit = 子 entry の追加 / 削除 / 並び替えのみ（各章自体は個別 entry として編集）
- export 時は 1 つの統合ファイル（markdown / HTML）として出力

---

## 5. やらないこと

- child entry の内容を set 側で直接編集
- nest された document-set
- cross-container の document-set
- 自動 TOC 生成（A-3 と連携する形で将来）
- コラボ編集 / 承認フロー

---

## 6. 設計の方向性

- core に `DocumentSetBody` 型と relation type `member_of_document` を追加
- features 層に `assembleDocument(set, entries)` pure function
- presenter view は子 entry を relation 順で並べて連結
- export は既存 text-markdown-zip 経路を拡張し、document-set を 1 ファイルに統合
- C-2 entry ordering と近いが、こちらは explicit membership

---

## 7. リスク / 未確定事項

- child entry が他 set に属する場合の挙動
- child entry 削除時の整合性
- set 側と child 側のどちらが source of truth か
- revision（C-1）の粒度
- export ファイル名 / 構造の設計

---

## 8. 将来拡張の余地

- A-3 TOC と自動連携
- 読者向け公開 view / share URL
- PDF export
- 翻訳版の link
- C-5 complex archetype の section と統合
