# TEXTLOG ↔ TEXT 変換 (補助 spec 1)

親 spec: `entry-transformation-and-embedded-preview.md` の Slice 4 / Slice 5 の詳細。

**本 doc の責任**: 変換規則 / 分割単位 / backlink / 選択 UI / 非可逆部分の
扱い / 可逆性の境界を確定させる。実装コードは含まない。

**実装状況**:
- §2 TEXTLOG → TEXT は **Slice 4 で実装済み**
  (`src/features/textlog/textlog-to-text.ts` 純粋関数 +
  `src/adapter/ui/textlog-selection.ts` / `textlog-preview-modal.ts` /
  `textlog-presenter.ts` / `action-binder.ts`)。
- §3 TEXT → TEXTLOG は未実装 (Slice 5 で扱う)。

## 1. 概要

TEXTLOG と TEXT を双方向に変換する。両方向とも以下を守る:

- **新規 entry を生成する** (非破壊)。元 entry は変更しない。
- **非可逆**。flags / 個別 log id / heading 構造は単純に往復しない。
- **backlink を自動挿入**して由来を保持。
- **dispatcher の既存 action を使う** (`CREATE_ENTRY`, `APPEND_LOG` など)。
  新規 action は追加しない。
- 変換 pipeline は **純粋関数**として `features/` layer に置く
  (`features/textlog-to-text.ts`, `features/text-to-textlog.ts`)。

## 2. TEXTLOG → TEXT

### 2.1 選択 UI

TEXTLOG viewer に「選択モード」を導入する。モード中は各 log 行に checkbox が
表示され、複数 log を選択できる。

- 選択状態は viewer component の **local state**。reducer / AppState は
  触らない。
- 選択モードの開始は明示 action (`Begin log selection` ボタン)。終了は
  `Esc` または明示 `Cancel`。
- モード中はログ行の通常クリック挙動 (edit 起動など) を停止し、click が
  checkbox toggle になる。
- viewer の sort 状態 (desc / asc) は保つ。選択はログ id ベースなので順序
  非依存。
- 0 件選択時は「Convert to TEXT」ボタンが無効。
- 範囲選択 (Shift+Click) は v1 では非対応。単クリック toggle のみ。

### 2.2 出力 markdown の形

選択された log を **時系列 asc** (古い順) で並べ直し、以下の構造で 1 つの
markdown body を生成する:

```markdown
# <元 TEXTLOG title> (log extract)

> Source: [<元 title>](entry:<源 lid>)
> Extracted: 2026-04-13T10:00:00Z
> Logs: 12 entries from 2026-04-01 to 2026-04-13

## 2026-04-01

### 10:00:00 — <log1 先頭行から生成した短縮 slug>

<log1.text>

[↩ source log](entry:<源 lid>#log/<log1.id>)

### 10:05:00 — <log2 slug>

<log2.text>

[↩ source log](entry:<源 lid>#log/<log2.id>)

## 2026-04-02

### 09:00:00 — ...
```

- **doc 冒頭 `#` heading**: 元 TEXTLOG title + ` (log extract)` suffix。
- **front matter 相当の blockquote**: source lid / extracted at / logs 件数 /
  期間。機械可読ではないが、viewer で一目で由来が分かる。
- **日付 heading (`##`)**: local TZ の YYYY-MM-DD。
- **log heading (`###`)**: `HH:mm:ss — <slug>`。slug は log text の先頭
  非空行から最大 40 文字で作る (既存 TOC の slug helper を流用)。
- **各 log 末尾の backlink**: `[↩ source log](entry:<源 lid>#log/<id>)`。
  元 fragment 形式をそのまま使うので、embed モデルと整合。
- **空 log** (text が空白のみ) はスキップ。heading も出さない。

### 2.3 新 TEXT エントリ metadata

- `archetype`: `text`
- `title`: `<元 title> — log extract <YYYY-MM-DD>` (commit 日、local TZ)
- `body`: 2.2 の markdown 文字列
- `lid`: 新規発行
- `created_at` / `updated_at`: commit 時刻。元 log の createdAt は本文内
  heading に残す。

### 2.4 元 TEXTLOG 側への変更

原則ゼロ。変換は read-only。

**例外 (opt-in、v2 以降)**: 「元 log 行の末尾に `entry:<新 TEXT lid>` の
backlink を追記する」オプション。v1 では対象外。

### 2.5 非可逆な情報

変換で失われる:

- log の `flags` (`important`) — viewer 表示専用、markdown 表現に落とさない。
- log の正確な `id` (backlink で復元可能だが、新 TEXT を再度 TEXTLOG に
  変換しても同じ id には戻らない)。
- 複数 log の順序に関する viewer 側メタ (表示順 desc / asc) — 出力は常に
  asc。

失われない:

- text / createdAt / 連続性 / source lid。

### 2.6 backlink 位置の決定

2 案あった:

- (A) 各 log heading 直後 (末尾) に 1 行ずつ
- (B) doc 末尾に「Source logs」セクションとしてまとめて箇条書き

**採用は (A)**。理由:

- 各段落と元 log の対応が視覚的に明らか
- 長い extract でも backlink が流れに沿って読める
- (B) は backlink が多くなるとスクロール距離で対応が取れなくなる

## 3. TEXT → TEXTLOG

### 3.1 分割単位 (最小スコープ)

以下のみサポート:

- **ATX heading 単位** (`#` または `##` のいずれかを user が選ぶ)
- **手動分割** (`---` 水平線を user が事前に挿入、変換時の区切りとして使用)

対象外 (v1):

- 段落自動分割 (空行区切り) — 雑すぎて事故るため禁止
- heading と manual の併用
- `---` 以外の分割マーカー

### 3.2 出力 TEXTLOG entry 1 件あたりの形

分割後の各チャンクが 1 log 行になる。

- `text`: 分割チャンク本文 (heading 行も含めたまま)
- `createdAt`: 元 TEXT の `updated_at` を継承。同一時刻が並ぶが id は別々。
- `flags`: 空配列
- `id`: 新規 ULID

### 3.3 投入先 TEXTLOG

変換時に user が 2 択:

1. **新規 TEXTLOG 作成**: title の初期値は `<元 TEXT title> (textlog)`。
2. **既存 TEXTLOG に append**: dropdown で選択。既存 `APPEND_LOG` 相当の
   dispatcher action を繰り返し発火。

append の原子性: v1 では「部分 append を許容する」。途中失敗時は既に
append した log はそのまま残す。失敗率が低く、UI で差分確認できるため。

### 3.4 元 TEXT 側への変更

原則ゼロ。

### 3.5 非可逆な情報

- 元 TEXT の title (TEXTLOG の log にタイトル概念がない、meta log で復元)
- heading の親子関係 (平坦化される)
- asset / entry ref の文脈 (ref 自体は保持されるが、前後の段落境界で切れる)

### 3.6 meta log (新規 TEXTLOG 時のみ)

新規 TEXTLOG を作る場合、1 件目の log として以下を自動投入:

```
Source TEXT: [<title>](entry:<元 TEXT lid>)
Converted: 2026-04-13T10:00:00Z
```

既存 TEXTLOG に append する場合は投入しない (既存データのセマンティクスを
汚染しないため)。

## 4. 選択 UI の共通設計

TEXTLOG → TEXT の multi-select と、TEXT → TEXTLOG の split-mode を同じ UI
語彙にそろえる:

- モード開始は明示 action (Begin...) でモード入り
- モード中は viewer のクリック・アクションが別挙動
- モード終了は `Esc` または明示 `Cancel`
- モード中のみ「Convert...」アクションが有効化
- reducer は変更しない。モード状態は viewer component の local state。

これにより「選択モード」という概念が TEXTLOG / TEXT 両方に共通化され、
user の学習コストが最小化される。

## 5. dry-run プレビュー

変換 commit 前に preview modal を必ず挟む。

- 変換結果の markdown body (TEXTLOG→TEXT) または log 行リスト
  (TEXT→TEXTLOG) を表示
- 「OK / Cancel」の二択
- preview 時点で lid は未発行。cancel で破棄。OK で commit して初めて
  `CREATE_ENTRY` が発火
- preview は純粋関数で生成 (`features/textlog-to-text.ts`,
  `features/text-to-textlog.ts`)。reducer / dispatcher に触らない

preview modal のサイズ / style は既存 `docs/development/markdown-phase2.md`
等で確立したものを再利用。新規 modal pattern は作らない。

## 6. tests

### features layer (純粋関数)

- `tests/features/textlog/textlog-to-text.test.ts`
  - 単一 log → TEXT
  - 複数 log / 複数日 → TEXT (日付 heading 複数)
  - 空 log skip
  - backlink の正確性 (fragment 形式)
  - flag が落ちることの明示
  - createdAt の local TZ 反映 (`2026-04-01T00:30:00Z` → `2026-03-31`
    or `2026-04-01` を TZ で切る)
  - slug 生成: 40 文字制限 / 空行 skip / 多言語文字
- `tests/features/textlog/text-to-textlog.test.ts`
  - heading `#` 単位
  - heading `##` 単位
  - heading 0 の TEXT → 単一 log
  - 手動分割 (`---` 区切り)
  - heading と manual の混在指定は拒否
  - asset / entry ref が章境界をまたぐケースの ref 保持
  - meta log 生成 (新規 TEXTLOG 時のみ / append 時は無し)

### adapter layer (action-binder / renderer 結線)

- `tests/adapter/textlog-to-text-action.test.ts`
  - 選択モード開始 → log checkbox 選択 → preview → commit → 新 TEXT が
    container に入る
  - preview で cancel → commit されない
  - 0 件選択時 action 無効
  - 選択モード中の通常クリックは edit 起動しない
- `tests/adapter/text-to-textlog-action.test.ts`
  - heading `#` 選択 → preview → 新規 TEXTLOG commit
  - 既存 TEXTLOG append → 既存 log 行数が増える
  - 分割なし (heading 0 / manual なし) → 単一 log
  - meta log が新規時のみ投入される

## 7. 互換性

- 既存 data format 変更なし
- 既存 reducer action 変更なし (新規 `CREATE_ENTRY` / `APPEND_LOG` を使うだけ)
- 既存 AppState 変更なし
- 既存 TEXTLOG viewer の DOM 追加: 選択モード中のみ checkbox 可視
- 既存 TEXT viewer の DOM 追加: toolbar に action 1 件追加

## 8. 未確定事項

- 選択モードを modal で隔離するか、inline toggle にするか (初期案は inline)
- heading `#` / `##` の選択 UI: radio / toggle / auto-detect (初期案は
  radio で user 明示)
- append 時の失敗時ロールバック (v1 では無し)
- backlink を semantic relation として永続化 (将来)
- slug helper が既存 TOC 実装と同じものを流用できるかの確認
  (`docs/development/table-of-contents-right-pane.md` 側の heading ID 生成と
  共通化する想定)

## 9. 参照 docs

- `docs/development/entry-transformation-and-embedded-preview.md` (親 spec)
- `docs/development/embedded-preview-and-cycle-guard.md` (補助 spec 2、
  変換結果に embed が含まれる場合の意味論)
- `docs/development/textlog-viewer-and-linkability-redesign.md` (TEXTLOG
  fragment 形式 `#log/<id>` の出典)
- `docs/development/selected-entry-html-clone-export.md` (subset closure が
  TEXTLOG fragment を解決する既存経路)

