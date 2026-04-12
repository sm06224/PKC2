# Link Index Entry

Status: CANDIDATE
Created: 2026-04-12
Category: C. Data Model Extensions

---

## 1. 短い結論

entry 間 link を一覧できる「link index」専用 entry archetype（または view）を導入する。
container 内の cross-reference を俯瞰する手段を提供する。

---

## 2. 背景 / 問題

PKC2 は entry 間に relation / inline link を張れるが、
「何がどこから参照されているか」を一覧する手段が無い。
壊れた link（存在しない entry への参照）も発見できない。

---

## 3. ユーザ価値

- container 全体の link 網を俯瞰できる
- 壊れた link / orphan entry を発見できる
- 参照の多い entry / 孤立 entry を特定できる
- wiki 的 navigation のハブになる

---

## 4. 最小スコープ

- link index を **entry の body として生成**（archetype: `link-index`）
- 生成時に container をスキャンし、link / relation 一覧を markdown table として保存
- 手動 refresh で再生成（自動 sync は将来）
- orphan entry / broken link を分かりやすく表示
- index 自体は他 entry と同じく relation で参照可能

---

## 5. やらないこと

- リアルタイム link graph の自動更新
- graph visualization UI（ノード・エッジの図形表示）
- 外部 URL link の検証
- link の自動作成 / 推薦
- 全文検索との統合

---

## 6. 設計の方向性

- features 層に `buildLinkIndex(container)` pure function
- 出力 = markdown 文字列（table / list）
- adapter 層で「link index 生成 / 更新」action を提供
- archetype は既存 text presenter を流用（body が markdown のため）
- broken link 検出は body 内 `[[...]]` / relation の target entry 存在確認

---

## 7. リスク / 未確定事項

- link 抽出の正規表現精度（markdown link / wiki link / relation 全て必要か）
- container が大きい場合の生成時間
- 自動 refresh vs 手動 refresh の mental model
- index entry 自身を index に含めるか（自己参照）
- multiple index entry を許すか（view 別 index）

---

## 8. 将来拡張の余地

- 変更検知による差分 refresh
- link graph の視覚化
- orphan entry の自動検出レポート
- 検索結果との統合（A-4）
- document-set（C-6）の自動 TOC 生成に活用
