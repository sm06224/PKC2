# PKC Application Scope Vision

Status: VISION
Created: 2026-04-12
Category: D. Long-Term Vision

---

## 1. 短い結論

PKC2 の application scope を「単なる個人 KB」から
「個人 / 協調作業 / messaging / 軽量 application platform」へと拡張する長期構想をまとめる。
個別機能でなく、「PKC2 とは何か」の輪郭を定義する。

---

## 2. 背景 / 問題

現状の PKC2 は個人 markdown KB として成立しているが、
日常運用すると以下の欲求が自然に生まれる：

- 他者との情報共有（D-1）
- 複数 window での並列作業（D-2）
- 即時共同作業（D-3）
- 表計算 / 文書 / 混合 entry（C-4 / C-5 / C-6）
- 長期保存 / 検索 / 俯瞰（A-3 / A-4）

これらは個別機能だが、合計すると「個人 KB の域を超える」方向性になる。
scope を言語化しないと、機能追加の判断基準がブレる。

---

## 3. ユーザ価値

- PKC2 が何でできて何ができないかが予測可能になる
- 機能追加の優先順位が判断しやすくなる
- 長期運用 / データ投資の安心感が生まれる
- 他ツールとの住み分けが明確になる

---

## 4. 最小スコープ（vision 段階）

この文書 自体が scope 定義であり、実装 scope は持たない。
ただし以下の原則を明示する：

- **single HTML product** は不変（配布容易性を保つ）
- **container is source of truth** は不変（UI state は runtime-only）
- **core is pure** は不変（browser API は adapter に閉じる）
- **backward compatibility** は不変（既存 container を壊さない）

拡張は常にこの 4 原則の下で行う。

---

## 5. やらないこと

- 汎用 SaaS 化 / 中央 server 化
- enterprise 認証 / RBAC の組み込み
- plugin architecture（一時的には拒否、将来再検討）
- 独自 runtime / engine 化（browser native を維持）
- mobile-native app 化

---

## 6. 設計の方向性

- 機能追加は 4 層分離（A / B / C / D）カテゴリのいずれかに属させる
  - A: Immediate UX Improvements（表層）
  - B: Markdown / Rendering Extensions（記法）
  - C: Data Model Extensions（構造）
  - D: Long-Term Vision（基盤）
- 各カテゴリは独立に進化でき、互いに副作用を最小化
- 新機能は「既存 invariant を壊さないか」を審査基準とする
- 不明瞭な追加提案は VISION に寄せて時間で試す

---

## 7. リスク / 未確定事項

- scope 拡大が single HTML の限界を超える可能性
- bundle size が現実的な browser 制約を超えるリスク
- 複数 vision（D-1 / D-2 / D-3）の相互依存が発散する
- 抽象化を入れすぎると single HTML の単純さが失われる
- user の mental model が「KB」から「platform」に移る過程の混乱

---

## 8. 将来拡張の余地

- PKC2 protocol の標準化（message / transport / container schema）
- サードパーティ tool からの PKC2 container 操作
- 教育 / research 向けの「自己完結 research notebook」としての運用
- 長期 archive format としての位置づけ
- A / B / C / D 各カテゴリから優先度高いものを slice 化する周期的 roadmap レビュー
