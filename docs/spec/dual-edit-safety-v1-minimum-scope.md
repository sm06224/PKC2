# dual-edit-safety v1 — minimum scope

**Status**: minimum-scope definition (docs-only).
**Parent issue**: `docs/planning/file-issues/01_dual-window-concurrent-edit-safety.md` (**FI-01**, P0).
**Date**: 2026-04-17.
**Author**: supervisor 委任（自主運転モード）。

**原則**: *安全性を担保した上で UX を削る*。v1 の最優先は **silent overwrite の撲滅**。複雑な UI / 高度な合流機構は v1 範囲外。

---

## 0. 位置づけ

- 本文書は FI-01 を **behavior contract** に昇格させるための minimum scope。
- contract / implementation / audit / manual は後続セッションで 1 件ずつ閉じる。
- 本文書は **diff / merge / CRDT / OT / 実時間同期** を明示的に非対象とする。
- 採用する唯一の戦略は **Optimistic Version Guard at save time**（後述 §3）。

---

## 1. 問題の正確な再定義（いつデータが消えるのか）

### 1.1 構造的前提

PKC2 の主ワークスペースは単一の Container を IndexedDB に保持する。**別ウィンドウ（Entry Window）** は `window.open` による別文書で開かれるが、**同一 origin・同一 IDB** を共有する。両者は AppState / Dispatcher をそれぞれ独立に保持するため、**reducer レベルでは非同期に並行動作する**。

### 1.2 データが消える具体条件

以下のレースが起きた時点でサイレント上書きが発生する:

- **S-A**: メイン側で entry `E` を編集開始 → 並行して別ウィンドウでも `E` を編集開始 → 別ウィンドウ先行 save（container_N に反映）→ メインが自分の edit buffer を save（container_N+1 を生成し、別ウィンドウ側の変更内容を含まないまま上書き）。
- **S-B**: 上記と順序逆（メイン先行 → 別ウィンドウ後続 save）。対称。
- **S-C**: 片方が編集バッファ保持中、もう片方が **別経路**（RESTORE_ENTRY / BRANCH_RESTORE_REVISION / merge-import accept / manual MOVE_ENTRY 等）で同 entry を書き換え。編集中側は書き換え後の `updated_at` を知らないため、save で上書きされ得る。

### 1.3 今は何をチェックしていないか

- save コミット時に「自分の edit buffer が開始時点の entry 状態に基づいている」ことを検証していない。
- `entry.updated_at` / `content_hash`（H-6 で追加）を save 時に照合していない。
- 別ウィンドウ ↔ メインは IDB を覗き直す以外の即時通知経路を持たない。

---

## 2. v1 のスコープ

### 2.1 v1 が守るもの

- **entry 単位** の silent overwrite を不可能にする。
- reject 判定は **pure 関数** で下せる（外部通信不要）。
- reject 時にユーザーの編集バッファは **破棄せず**、選択肢を提示する。
- 既存 dispatch / reducer / Revision 記録経路は **非破壊**。

### 2.2 v1 が守らないもの（明示的 non-goal）

- field 単位 / 文字単位の merge・3-way merge・diff viewer
- CRDT・OT・実時間並行編集
- 強制 edit lock（他方の編集モード起動を block する hard lock）
- 自動 field-merge（双方の変更内容を意味的に合流する合流機構）
- 別 container / 別デバイス / 別ブラウザ間の同期（D-3 の領域）
- 3 ウィンドウ以上の**網羅**保証（2 ウィンドウで機能すれば自然拡張する想定）

---

## 3. 最小戦略: Optimistic Version Guard

### 3.1 採用する戦略

**save コミット時に version を照合して、古い base の編集だったら reject する**。たったこれだけ。

具体：
- **編集開始時**に、対象 entry の **snapshot version tag** を捕獲する。tag は以下のいずれかで十分（contract 段階で確定）:
  - `entry.updated_at`
  - `entry.updated_at + content_hash`（H-6 で optional 追加済み）
- **save コミット直前**に、現在の Container に存在する同 LID の entry から同じ tag を再計算し、**一致しなければ save を reject** する。
- 一致すれば通常経路で save（既存 reducer を通る）。

### 3.2 採用しない戦略と理由

- **Hard edit lock（他方の編集モード起動を block）**: クラッシュや window close 検知失敗で永続ロックが残るリスク、「使えない」体験。v1 非対象。
- **Cross-window real-time field sync**: 複雑度に対するリターンが小さい。v2 以降。
- **Auto-merge at save reject**: field 単位の意味論を要し、v1 範囲を超える。
- **BroadcastChannel で save 完了を push して自動 reload**: 編集中バッファの整合を壊す。advisory banner（§5.2）としてのみ許容。

### 3.3 「セーフ自動方向」の定義

ユーザー要望「なるべくセーフ方向で自動」に対する v1 の answer:
> **「自動で上書きしない」** = safe。  
> reject 時の **default 提示肢** を「Save as branch（両方残す）」にすることで、ユーザーが何も考えずデフォルト選択してもデータは失われない。

※ 「自動で無条件 merge」はやらない。merge を自動で正しく行うにはセマンティクスが要る。

---

## 4. 不変条件（Invariants）

| ID | 不変条件 |
|----|---------|
| **I-Dual1** | Silent overwrite はいかなる経路でも発生しない。save は **accept または reject の二値**。 |
| **I-Dual2** | reject 時、ユーザーの編集バッファは **即時破棄されない**。明示操作で初めて破棄される。 |
| **I-Dual3** | 競合判定は **pure 関数** で下せる（`isSaveSafe(baseSnapshot, currentContainer): boolean`）。外部通信 / 非決定入力に依存しない。 |
| **I-Dual4** | accept 経路は既存 dispatch / reducer / Revision 記録と**同一**。二重差し込みはしない。 |
| **I-Dual5** | reject 経路でも Revision chain / `content_hash` / `updated_at` の既存不変は維持される（失敗 save は revision を生成しない）。 |
| **I-Dual6** | reject 判定は entry **単位** で行う（Container 全体差分には依存しない）。 |

### I-Dual* の直交性

- I-Dual1 は「上書きが起きない」という結果不変。
- I-Dual2 は「ユーザー救済」という UX 不変。
- I-Dual3 は「テスト可能性」という純粋関数不変。
- I-Dual4–5 は「既存系を壊さない」という非破壊不変。

---

## 5. ユーザー体験（通知 / 自動回避）

### 5.1 reject 時の overlay（最小）

既存 overlay UI（boot-source-chooser / merge-conflict section 流儀）を再利用し、3 ボタンだけの minimal modal を出す:

| ボタン | 動作 | 危険度 |
|-------|------|-------|
| **Save as branch (default)** | 自分の edit buffer を **新 entry** として保存。元 entry は相手側の save を保持。provenance relation で紐付ける（C-1 Restore as branch と同じ枠組み流用） | 無害 — 両方残る |
| **Discard my edits** | 編集バッファを破棄し、最新の entry を表示 | 自分側のみ破棄（明示） |
| **Copy my body to clipboard** | 編集中の body を clipboard にコピー。overlay は閉じない | 救済ハッチ |

- default hi-lite は **Save as branch**（セーフ自動方向の具現化）。
- overlay は Escape では閉じない（明示選択を要求）。
- 文言は既存 merge conflict UI（H-10）に寄せる。

### 5.2 編集開始時の advisory（optional）

別ウィンドウで同 entry を編集中と検知できた場合、編集モード上部に 1 行の banner:
> 「別のウィンドウでもこのエントリを編集中です。片方の save がもう片方を reject します。」

- hard block はしない（advisory only）。
- 検知には `BroadcastChannel` または `localStorage` の key 更新 + `storage` event を使える。実装コストが低ければ v1 に含める。**contract 段階で optional / mandatory を確定**。
- advisory に失敗しても I-Dual1〜5 は維持される（reject 機構が最後の防波堤）。

### 5.3 UX 原則

- 新 UI コンポーネントを作らず、既存 overlay 流儀を再利用する。
- 文言は簡潔、選択肢 3 つ固定。
- 色分けは既存 warn tier。
- default CTA はセーフ方向（Save as branch）。
- 説明文は 1 行 + 箇条書き 3 行以内を目安。

---

## 6. 非対象（明示）

以下は v1 では**やらない**。contract / implementation / tests / manual いずれでも触れない:

- field 単位 merge / 3-way merge
- diff viewer at reject time
- 強制 edit lock（hard lock）
- 実時間 broadcast による save 反映
- 自動 field-merge
- 別 container / 別デバイス / 別ブラウザ同期
- entry 以外（Container meta / Relations / Revisions 直接編集）への拡張
- 3 ウィンドウ以上の網羅保証（動作はするが網羅保証しない）
- form archetype の formSchema 変更衝突（schema は別系、非対象）

---

## 7. 将来拡張余地

| 余地 | 想定時期 | 備考 |
|------|---------|------|
| diff viewer at reject time | v1.x | 「自分と相手の差分を見てから選ぶ」UX |
| advisory banner → BroadcastChannel 化 | v1.x | §5.2 を mandatory に昇格 |
| hard edit lock（設定で opt-in） | v1.x | 単独作業の保守性重視ユースケース向け |
| field 単位 merge | v2 | semantic merge。大工事 |
| real-time collaborative edit | v2〜 | D-3 (WebRTC) と合流 |
| 3 ウィンドウ以上の網羅 | v1.x | 基本機構は同じ、テスト整備が主 |
| Relations / Revisions 直接編集時の guard | v1.x | 同じ `isSaveSafe` 系ヘルパで展開可 |

---

## 8. 次ステップ（pipeline 上の位置）

1. **本文書（minimum scope）** — 完了（本コミット）
2. **behavior contract**（次セッション） — 13 章前後で以下を確定:
   - pure helper の署名確定: `isSaveSafe(baseSnapshot, currentContainer): boolean`、`captureBaseSnapshot(container, lid)` 等
   - save entry 時の reducer gate 位置
   - reject 時の overlay 文言・DOM 構造・data-pkc-* 選定
   - advisory banner の optional/mandatory 確定
   - provenance relation 流用時の metadata key（C-1 との整合）
3. pure slice / state slice / UI slice に分けて実装
4. audit（post-impl invariance）
5. manual 同期（05 日常操作 / 09 トラブルシューティング）

---

## 9. References

- FI-01: `docs/planning/file-issues/01_dual-window-concurrent-edit-safety.md`
- C-1 revision-branch-restore v1 contract（`docs/spec/revision-branch-restore-v1-behavior-contract.md`） — provenance relation の流儀を参考にする
- H-10 merge-conflict-ui v1 contract（`docs/spec/merge-conflict-ui-v1-behavior-contract/`） — overlay 文言 / selector 流儀を参考にする
- H-6 Revision `content_hash`（`docs/spec/data-model.md §6.2.1`） — version tag の候補
- A-2 text-split-edit-in-entry-window（completed, 2026-04-14） — 編集 UX の前提
- S-30 boot source policy revision — overlay 流儀（boot-source-chooser.ts）の参考
