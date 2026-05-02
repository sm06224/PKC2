# PKC2 v2.1.0 — Release notes

**Release date**: 2026-04-24
**Schema**: 1(変更なし — additive-only)
**Previous release**: v2.0.0

本リリースは、v2.0.0 以降に積み上がった **ユーザー可視機能 / UX 修正 / データ正当性修正 / 安全性修正** をまとめて user-visible minor bump として切り出したものです。schema breaking はなく、既存 container / export は無改変で読み込めます。

---

## Highlights

- **Link system foundation** — 外部アプリに貼れる共有リンク(External Permalink)と PKC 内部動作の統合
- **Tags and search** — エントリタグ、Tag filter、Saved Search への永続化、`tag:` 検索構文
- **Storage Profile** — asset と body の使用バイト数を切り分けて可視化
- **UI continuity** — 再描画でスクロール位置・フォーカス・キャレット位置・フォルダ畳み込み状態が壊れない
- **Data correctness** — orphan asset cleanup の永続化、IDB asset 削除差分の修正
- **Relation / tree safety** — structural relation の循環を表示段と reducer 段の二重で防御
- **UX polish** — Export / Saved Search / child window / keyboard shortcut / recent pane など細部の改善

詳細カテゴリは以下:

---

## Link system(最大の変化点)

v2.1.0 の中心は、リンク基盤を **3 層に整理** したことです。

### 用語(正本)

- **External Permalink** = `file:///.../pkc2.html#pkc?container=<cid>&entry=<lid>` または `https://.../#pkc?...`
  - **外部アプリ**(Loop / Office / mail / メモアプリ)に貼って **クリックで PKC に戻れる** 共有 URL
- **Portable PKC Reference** = `pkc://<cid>/entry/<lid>`
  - PKC 内部 / 間の identifier(外部ブラウザからは直接開けない)
- **Internal Reference** = `entry:<lid>` / `asset:<key>`
  - 同一 container の markdown 本文用

> ⚠️ 旧版で `pkc://...` を「permalink」と呼んでいたのは誤りでした。v2.1.0 で 3 層に分離し、用語を正しました。

### 追加された機能

- **🔗 Copy link ボタン** — entry meta pane / attachment action row / TEXTLOG 各ログ行で External Permalink をワンクリックコピー
- **Paste conversion** — PKC 内 editor に External Permalink / Portable Reference を貼ると、同 container なら `[Entry Title](entry:<lid>)` 形に自動変換
- **Label synthesis on paste** — 空ラベル `[](entry:...)` は paste 時に entry title / attachment name から label を合成(空ラベルの不可視アンカー問題を解消)
- **TEXTLOG log link** — ログ単位のリンクコピー + 貼付で `[<title> › <snippet>](entry:<lid>#log/<logId>)` を生成
- **External Permalink receive** — 外部アプリから External Permalink をクリックして PKC を開いた瞬間に該当 entry へ自動ジャンプ
- **Same-container Portable fallback** — body に残った `[](pkc://<self>/...)` は `entry:` / 所有 attachment entry として動的にナビゲート
- **Cross-container placeholder** — 別 container の `pkc://<other>/...` は 🌐 外部 PKC 参照 badge で可視化
- **URI scheme non-interference** — `https:` / `mailto:` / `ms-word:` / `onenote:` / `obsidian:` / `vscode:` など PKC 非対象 URI は **一切干渉しない** ことを 12 scheme 分テストで固定

### 設計済み・未実装

- **Link migration tool(Normalize PKC links)** — 既存 body の legacy 形式を preview + opt-in で正本化するツールの **仕様は固定**(`docs/spec/link-migration-tool-v1.md`)、実装は Phase 2 以降

---

## Tags and search

- `entry.tags?: string[]` の additive 追加
- 左ペインでの Tag filter(AND 合成)
- Saved Search の Tag filter round-trip 永続化
- 検索欄で `tag:urgent` 構文が使える(同軸複数で AND、FullText と組合せ可能)
- Tag chip UI / CSS 整備(entry meta pane / sidebar / Saved Search 行)
- 手動で Tag を付与・削除する最小 UI

---

## Storage Profile

- Asset bytes(`container.assets` の内訳)と body bytes(entry body 合計)を分離計測
- "asset-only" と "full container footprint" の概念を spec で分離し、現実装は asset-only であることを明示
- 全容量合計の視覚フィードバック

---

## UI continuity

- 再描画まわりの shaky UX を根本対策:
  - sidebar / center / meta の scroll 位置復元
  - 編集中 textarea のフォーカス・キャレット位置復元
  - TEXTLOG ログ行フォーカスの維持
- folder 畳み込み状態を **localStorage に container_id 単位で永続化**、container 切替でも状態を保持

---

## Data correctness

- **Orphan asset cleanup persistence fix** — orphan asset を削除した状態が再起動後も維持されるよう persistence 経路を修正
- **IDB asset delete diff** — IndexedDB で削除された asset が正しく差分適用される
- **Import / Merge** 経路の競合検出精度向上

---

## Relation / tree safety

- **Structural cycle display rescue** — 不正な親子循環が contained でも描画段で検出・安全表示
- **Reducer cycle guard** — 構造 relation の新規作成時点で循環を reducer 段で拒否し、state に入れない

---

## UX polish(雑多)

- Saved Search の保存 / 呼出 UX
- child window のショートカット互換性 `mod+S` / Escape / 日付系ショートカット
- Markdown 内の `[label](url)` paste で anchor → Markdown link 正規化
- recent entries pane の折り畳み状態永続化
- その他、render-continuity 由来のサイドバー / 編集中 UI の振る舞い安定化

---

## Known limitations(v2.1.0)

**誠実に書いておきます**:

- **Link migration tool は設計済み・未実装**。既存 body に残った legacy 形式(空 label / `#<logId>` / 同 container `pkc://` 等)は renderer / parser の互換処理で壊れずに読めるが、正本への書き換えは **user が手動で行うか、次 release の migration tool 実装を待つ必要あり**
- **Card / embed presentation 未実装**。`@[card](entry:<lid>)` / transclusion 強化は spec 予約のみ
- **Color tag は spec 止まり**。data model は正本化済みだが UI / palette 実装は未着手
- **Cross-container resolver / P2P 未実装**。`pkc://<other>/...` や cross-container External Permalink をクリックしたときに別 container を自動ロードする機構はない(手動で該当 container の PKC を開き直す必要あり)
- **OS protocol handler 未実装**。`pkc://` を OS に登録してクリックだけで PKC を起動する機構は外部ツール連携になるため v2.1 には含まない
- **Full container footprint 未実装**。Storage Profile は asset bytes のみを扱い、body / relations / revisions を含めた total 計測は未対応

---

## Migration 注意

- **container schema は変更なし**(`schema: 1` のまま)
- v2.0.0 で作成した container / export は **そのまま v2.1.0 で開ける**
- v2.1.0 で作成した container は将来の v2.0.x へは戻さないことを推奨(Tag や新 link 形式は旧版でも表示破壊しないが、Saved Search / Tag filter UI が v2.0 では表示されない)

---

## 参照 docs

- **Link system audit**: `docs/development/archived/audits-2026-04/link-system-audit-2026-04-24.md`
- **Link spec**: `docs/spec/pkc-link-unification-v0.md`
- **Link migration tool spec**: `docs/spec/link-migration-tool-v1.md`
- **Tag data model**: `docs/spec/tag-data-model-v1-minimum-scope.md`
- **Color tag spec**(未実装): `docs/spec/color-tag-data-model-v1-minimum-scope.md`
- **Versioning policy**: `docs/development/versioning-policy.md`
- **Dev INDEX**: `docs/development/INDEX.md` (#120-#154 あたりが本 release の対象範囲)

---

## 次 release に向けて(non-binding)

- **v2.1.x(patch)**: Link migration tool Slice 1-4 が着地したら
- **v2.2.0(minor)**: Card / Embed 本体、Color tag UI、Cross-container resolver 初期設計 のうちまとまった wave が着地したら
- **v3.0.0(major)**: Container schema breaking change が必要になった場合のみ

Versioning policy は `docs/development/versioning-policy.md` を参照。
