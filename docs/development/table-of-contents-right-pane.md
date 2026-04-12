# Table of Contents Right Pane

Status: CANDIDATE
Created: 2026-04-12
Category: A. Immediate UX Improvements

---

## 1. 短い結論

TEXT / TEXTLOG の rendered body から日付・見出しを抽出し、
右ペインに Table of Contents（目次）として表示。クリックで該当位置へスクロール。
Markdown 解釈レイヤで TOC データを生成し、UI 層で配置する。

---

## 2. 背景 / 問題

長文 TEXT / 長期 TEXTLOG では body 内を目視スクロールするしかなく、俯瞰性が低い。
rendered view に anchor はあるが、全体構造を一覧できる UI が無い。

TEXTLOG は特に「日付」と「その日の見出し」で二階層の構造を持つため、
日付を第一階層・見出しを第二階層とする TOC が自然に機能する。

---

## 3. ユーザ価値

- 長い TEXT entry で見出しを一覧できる
- TEXTLOG の「いつ何を書いたか」を日付 TOC で一望できる
- クリックで body の該当位置に即ジャンプ
- A-1（TEXTLOG readability）と相補的に俯瞰性を上げる

---

## 4. 最小スコープ

- markdown 解釈層に TOC 抽出関数を追加（純関数、features 層）
- TEXT: `h1` / `h2` / `h3` を順に抽出
- TEXTLOG: 各 log entry の timestamp を第一階層、log entry 内 heading を第二階層
- adapter 層で右ペインに表示（detail view / entry window 双方）
- クリックで body 内の該当要素にスクロール（`scrollIntoView`）
- TOC 0 件時は非表示

---

## 5. やらないこと

- markdown renderer の AST 変更（既存の string → HTML 経路を壊さない）
- 目次の手動編集 UI
- deep-link URL 化 / share URL
- h4 以下の深い階層（最小スコープでは h1–h3 まで）
- 他 archetype（todo / form / attachment / folder）の TOC
- sidebar の tree UI との統合

---

## 6. 設計の方向性

- 抽出関数は pure（入力 = body string、出力 = `{ level, text, anchor }[]`）
- features 層に配置し、core は触らない
- anchor は rendered DOM の `id` 属性と対応（markdown renderer 側で heading に slug id を付与）
- 右ペインは既存 pane resize 機構に乗せる
- TEXTLOG は log entry 単位で抽出した後 flatten して 2 階層で表示

---

## 7. リスク / 未確定事項

- heading slug 衝突（同名 heading が複数ある場合）
- pane 幅の分配（sidebar / center / right 3 column での運用）
- entry window に右ペインを置くかの判断（幅が不足する可能性）
- live edit 中の TOC 同期（preview 側と editor 側の一貫性）
- search（A-4）との UI 重複（両方右ペインに置くと混む）

---

## 8. 将来拡張の余地

- 可視範囲のスクロール位置 highlight
- TOC 項目のピン留め / 並び替え
- 全 entry を横断する「container TOC」
- B-1（CSV → table）の表見出しも TOC に含める
- entry window 3-column 化（A-2 split edit と共存）
