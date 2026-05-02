# 画像取り込み最適化 v1 — Minimum Scope

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は minimum-scope / historical design record として保持。実装の現物は `src/features/image-optimize/` / `tests/features/image-optimize/` / ユーザー向け説明は `../manual/05_日常操作.md` §画像の自動最適化。
Pipeline position: minimum scope
Sibling: `docs/spec/textlog-image-perf-v1-minimum-scope.md`（FI-03、別 issue）

---

## 0. 位置づけ

本 FI は「PKC2 に取り込まれる画像がそもそも重すぎる」問題を扱う。FI-03 rev.2.1 での supervisor 決裁（D-FI03-R2 / R4）により、FI-03 から分離された並行管理の新規 FI として起票する。

**FI-03 との明確な分離**：

| 観点 | FI-03 | **本 FI（画像取り込み最適化）** |
|------|-------|-----------------------------|
| 対象 | 既存重い画像の **表示性能** | 未来の重い画像の **流入削減** |
| タイミング | render 時 | paste / drop / attach / import 時 |
| 影響範囲 | read surface のみ | 保存データの性質（intake 時） |
| 既存データへの効果 | あり（staged render で救う） | **なし**（過去に保存された画像は対象外） |
| 相互依存 | なし | なし |

両 FI は独立かつ相補的。本 FI は **docs-only**、実装しない。

---

<!-- S1 -->
## 1. 問題の再定義

### 1-1. 現在の intake パイプライン

PKC2 は画像を **無加工** で base64 保存する。具体的な経路（`src/adapter/ui/action-binder.ts`）：

```
clipboard paste / file drop / file attach button / import
  └─ FileReader.readAsArrayBuffer(file)
       └─ Uint8Array → binary string
            └─ btoa(binary)
                 └─ container.assets[key] = base64
```

途中に **圧縮・リサイズ・フォーマット変換・メタデータ除去は一切ない**。ユーザがクリップボードやドラッグで投入した画像は、OS やアプリが出力したバイナリそのものが base64 化されるだけである。

### 1-2. 実運用サイズの現実

FI-03 rev.2.1 で確定した観測値：

| 環境 | 1 枚あたり |
|------|-----------|
| Full HD + Windows（最小構成想定） | **> 1 MB** |
| Mac + Firefox + ウルトラワイドモニタ | **~2.9 MB** |

**全環境で 1 MB を下回らないことが確定している**。これは外れ値ではなく PKC2 の標準挙動。スクリーンショット運用（TEXTLOG への貼り付け等）は PKC2 の想定ユースケースであり、「1 MB 超が常態」は設計意図と衝突する可能性が高い。

### 1-3. soft warning の形骸化

`src/adapter/ui/guardrails.ts` の既存閾値：

| 閾値 | 現状動作 | 実運用での発火頻度 |
|------|---------|-----------------|
| SIZE_WARN_SOFT = **1 MB** | ZIP 推奨メッセージを表示 | **事実上、正常系で毎回踏む** |
| SIZE_WARN_HEAVY = 5 MB | 警告強化 | 大きめスクリーンショットで時々踏む |
| SIZE_REJECT_HARD = 250 MB | paste 拒否 | 通常稀 |

soft warning は「例外的な重いファイル」を想定していたが、**実運用ではほぼ全ペーストで発火している**。警告の意味が薄れているだけでなく、ユーザが警告を無視する習慣を作る危険もある。

### 1-4. 入力品質問題としての位置づけ

本 FI は以下を確認する：

- **FI-03 との違い**：FI-03 は「既に保存された重い画像をどう表示するか」を扱う。本 FI は「重い画像をどう入れないか」を扱う。両者は独立かつ相補的
- **既存データは救えない**：paste 時最適化は未来の画像にしか効かない。過去に保存された 2.9 MB 画像は変わらず重い
- **ユーザ合意の必要性**：非可逆変換は「入力したデータがそのまま保存される」という暗黙の契約に触れる。勝手に行うべきではない

本 FI は「ユーザが納得できる入力体験」を設計するのであり、「技術的に圧縮できる範囲を探す」のではない。

<!-- S2 -->
## 2. 対象 surface

v1 が関与する「画像が PKC2 に入る経路」を以下に定義する。コード出所は `src/adapter/ui/action-binder.ts`。

| Surface | 対象 | 経路 | v1 での扱い |
|---------|------|------|------------|
| **clipboard paste**（`document.addEventListener('paste', handlePaste)`） | **対象** | `e.clipboardData.items` から image/* を FileReader で読み込み → btoa → base64 | スクリーンショット運用の本命経路。最適化の第一対象 |
| **drag & drop**（`handleFileDrop` / `handleEditorFileDrop`） | **対象** | dropped File を FileReader → btoa → base64 | ユーザが意図的に画像をドロップするケース。paste と同じ扱いが自然 |
| **file attach ボタン**（`<input type="file">` 経由、`processFileAttachment`） | **対象（条件付き）** | 隠し file input から選択されたファイルを FileReader → btoa | ユーザが明示的にファイルを選んでいる。意図が明確なため「最適化するか確認」で十分 |
| **import**（full HTML / ZIP 取り込み） | **対象外（v1 scope 外）** | 既に他の PKC2 コンテナで保存されたデータ | 「既存データは最適化しない」という本 FI の原則に合致。import 経由の画像は元コンテナの品質をそのまま引き継ぐ |
| **既存の container.assets**（既に保存済みの画像） | **対象外** | — | 本 FI は intake 時のみに作用する。過去データには触らない |
| **asset 参照のみの entry（transclusion、attachment 表示）** | **対象外** | 表示経路 | FI-03 の対象 |
| **remote image fetch** | **対象外** | — | PKC2 は offline-first。remote fetch を新設しない |

### 2-1. paste / drop / attach の差異

三者は base64 化経路が共通だが、**ユーザの意図の明示度**が異なる：

| Surface | ユーザ意図 | 想定 UX |
|---------|-----------|---------|
| paste | 「とりあえず貼る」。サイズ意識なし | 自動最適化 or 確認ダイアログの選択肢をより強く検討 |
| drop | 「このファイルを入れたい」。中程度の意識 | paste と同等 or やや緩い |
| attach | 「このファイルを添付する」。強い意図 | 確認を挟む余地あり。「最適化しますか？」に対する回答を期待できる |

v1 で三者を同一方針にするか差別化するかは §5 の重要論点で扱う。

### 2-2. 既存データへの非作用原則

I-IIO1（後述）で明記するが、本 FI は **container.assets に既に入っているデータを書き換えない**。理由：

- 既存データの再圧縮は非可逆変換を暗黙に行うことになり、原則違反
- ユーザが保存時点で「そのまま保存される」と合意した契約を破る
- FI-03（既存データの表示性能）と scope が衝突する

<!-- S3 -->
## 3. v1 scope 候補

v1 に「含める可能性がある」施策候補を以下に列挙する。採否と優先は §5（重要論点）と §8（次段）で判断する。

### 3-1. 含める候補（positive candidates）

| 施策 | 内容 | 期待効果 |
|------|------|---------|
| **client-side resize**（Canvas API） | 長辺が一定値（例: 2560px）を超える画像を Canvas で縮小。ウルトラワイドのフル解像度スクリーンショットは対象になる | 2.9 MB → 数百 KB 級への圧縮余地 |
| **フォーマット変換**（PNG → WebP / JPEG） | スクリーンショット（不透過 PNG）を WebP lossless / quality-90 lossy に変換。写真系は WebP lossy | 同画質で 30〜70% サイズ削減が一般的 |
| **しきい値ベースの適用制御** | 「小さい画像は無加工で保存」（例: 500 KB 以下）を保証 | 小さなアイコン・小画像を無駄に変換しない |
| **原画保持オプション**（dual storage） | 最適化版を `asset:key` として使い、原画を別 asset として `asset:key__original` 等で保持する選択肢 | 非可逆変換のリスクをユーザが選べる |
| **ユーザ同意 UX**（opt-in / opt-out / one-shot） | 初回に「最適化しますか？」を提示。設定で既定を切替 | 暗黙変換を避ける |
| **Warning threshold 再設計** | soft warning 1 MB を最適化後サイズに基づく閾値に変更（例: 最適化後も 1 MB 超なら警告） | 警告の形骸化を解消 |

### 3-2. 含めない候補（で、本 FI から外すもの）

| 施策 | 除外理由 |
|------|---------|
| OCR | 画像内テキストの抽出。intake 最適化と直交する機能拡張 |
| メタデータ抽出（EXIF 等） | 位置情報・撮影日時の取得。本 FI の scope 外 |
| remote image fetch（URL から画像取得） | offline-first 原則に反する。本 FI 外 |
| Image CDN / external storage 連携 | PKC2 は single-HTML。external storage は別 FI |
| 動画 / 音声ファイルの最適化 | 本 FI は画像のみ |
| WebAssembly による高性能圧縮（mozjpeg 等） | single-HTML 同梱バイナリが巨大化。v1 では採用しない |
| Web Worker 化 | paste 中のブロッキングが問題になれば v1.x で検討 |

### 3-3. 候補の組み合わせ方針

上記 6 つの positive candidates は独立ではなく、**組み合わせで一つの UX を作る**：

```
[intake]
  ├─ しきい値判定（小さい画像はスキップ）
  ├─ ユーザ同意取得（初回 / 既定に従う）
  ├─ Canvas resize（長辺超過時）
  ├─ フォーマット変換（PNG → WebP 等）
  └─ 原画保持（オプションに従って dual save）
```

v1 では全部を同時に採用するとは限らない。**最も user-complete な最小集合**を §5 / §8 で決裁する。

<!-- S4 -->
## 4. 非対象

v1 から明示的に除外する項目。理由込みで列挙する。

| 項目 | 除外理由 |
|------|---------|
| **既存保存データの再圧縮** | 過去に保存された画像を遡及的に変換すると、ユーザが保存時点で期待した可逆性を壊す。データ移行の複雑さも大きい。本 FI は intake 時のみ |
| **read 側のパフォーマンス対策** | FI-03 の scope。staged render / staged asset resolve は FI-03 側で扱う |
| **remote image fetch** | PKC2 は single-HTML / offline-first。URL 指定での画像取得は scope 逸脱 |
| **OCR（画像内テキスト認識）** | 機能拡張であり最適化ではない |
| **EXIF 等のメタデータ抽出・保存** | 位置情報・撮影日時の取得は別テーマ。ただし「変換時にメタデータが失われるか」は §5 の論点 |
| **画像以外（動画・音声・PDF）の最適化** | v1 は画像に限定。他メディアは将来 FI |
| **Web Worker / WebAssembly による高性能圧縮** | single-HTML のシェル同梱が肥大化。必要になれば v1.x で検討 |
| **クラウド / external storage 連携** | single-HTML 原則に反する |
| **ユーザ指定のカスタム圧縮パラメータ UI** | 「quality スライダー」等の詳細調整は v1 の複雑度を超える。behavior contract で既定値を固定する |
| **バッチ再最適化ツール** | 既にある asset を一括最適化するコマンド。I-IIO1 と衝突するため v1 外 |
| **動的な品質調整（画面サイズ検出）** | viewport に応じて異なる解像度で保存する等。複雑すぎて v1 外 |
| **画像比較・重複検出** | 同一画像が複数入っても統合しない。deduplication は別 FI |

<!-- S5 -->
## 5. 重要論点

v1 scope を確定させる前に supervisor 判断が必要な論点を整理する。

### 5-1. 可逆 vs 非可逆

| 選択 | 効果 | 代償 |
|------|------|------|
| 可逆のみ（例: PNG → WebP lossless） | データ復元可能、契約違反なし | 圧縮率は 10〜30% 程度に留まる。2.9 MB → 2〜2.5 MB 程度 |
| 非可逆許容（例: WebP quality-85） | 50〜80% 削減、2.9 MB → 数百 KB 到達 | 情報損失。OCR / 法的証跡 / 細部確認用途で問題 |
| **ハイブリッド**（用途で分岐） | 例: PNG スクリーンショットは可逆、JPEG 写真は非可逆の維持 | 判定ロジックの複雑化。誤判定時の挙動 |

**論点**: PKC2 は一般的なノートアプリなのか、証跡ツールなのか。スクリーンショット運用が主なら非可逆も許容余地があるが、ユーザ同意が前提。

### 5-2. 原画保持（dual storage）

| 選択 | 効果 | 代償 |
|------|------|------|
| 原画保持なし（optimized のみ） | ストレージ / export サイズが純粋に小さい | 非可逆なら復元不可。ユーザの心理的抵抗も大きい |
| 原画保持あり（dual） | ユーザが「元画像もある」と安心できる | ストレージ / export が 2 倍近くになる。目的の「サイズ削減」と矛盾する可能性 |
| オプション化（ユーザが選ぶ） | 柔軟性 | UI 複雑化、既定値の選定が別論点 |

**論点**: 原画保持オプションを既定 on / off / prompt のどれにするか。prompt は UX 摩擦が大きいが合意形成は最強。

### 5-3. 自動変換 vs ユーザー確認

| 選択 | 効果 | 代償 |
|------|------|------|
| 完全自動（しきい値超過で無確認で変換） | 摩擦ゼロ、運用が楽 | 暗黙の非可逆変換はユーザの信頼を損なう |
| 初回のみ確認 → 以降は設定値に従う | 合意 + 摩擦最小化 | 設定 UI の作成が必要 |
| 毎回確認 | 安全 | paste 運用では鬱陶しい |
| なし（警告のみで変換しない） | 既存契約完全維持 | 本 FI の効果がほぼなくなる |

**論点**: paste（頻度高）と attach（頻度中）で同じ UX を採用するか、差別化するか。§2-1 の意図明示度の差を UX に反映するかどうか。

### 5-4. clipboard / drop / attach の方針統一

| 選択 | 効果 | 代償 |
|------|------|------|
| 三者完全統一 | 実装単純、UX 一貫 | paste の頻度高い文脈で「毎回確認」は耐えられない可能性 |
| 三者差別化 | UX 最適化 | 実装・ドキュメント・テストが複雑 |

**論点**: 分岐は将来負債になりやすい。v1 は統一を基本としつつ、明示必要な箇所のみ差別化するのが妥当か。

### 5-5. Warning threshold 再設計

| 選択 | 効果 | 代償 |
|------|------|------|
| 現行閾値（1 MB）維持 | 変更なし | soft warning が常時発火する現状続く |
| 閾値引き上げ（例: 3 MB） | 警告が意味を持ち直す | 1-3 MB 帯の警告が消える。ユーザが気づく機会減 |
| 「最適化後サイズ」基準に変更 | 警告と最適化が一貫 | guardrails.ts の semantics 変更。影響箇所精査が必要 |

**論点**: 本 FI の v1 で同時着手するか、後続で分離するか。threshold 見直しは独立 task にも分離可能。

### 5-6. フォーマット選定

| 候補 | 長所 | 短所 |
|------|------|------|
| WebP | 高圧縮率、lossless / lossy 両対応、透過サポート、モダンブラウザ広範対応 | 古い環境で非対応（Safari 14 未満等）。PKC2 は single-HTML なのでブラウザ依存は現実問題 |
| JPEG | 最広範対応、写真に強い | 透過なし、スクリーンショット（文字画像）に弱い |
| PNG（lossless optimization のみ） | 既存互換 | 圧縮率が低い |

**論点**: WebP をデフォルトにしてよいか。PKC2 が動作保証するブラウザ範囲の確定が前提。

### 5-7. 変換時の metadata / transparency / animation 損失

- **metadata**: EXIF / 作成日時 / orientation 等は Canvas 経由で失われる。証跡用途では問題
- **transparency**: PNG → JPEG は透過損失。PNG → WebP なら保持可能
- **animation**: 動画 PNG / アニメ WebP / GIF の animation は Canvas で失われる

**論点**: v1 で animation 画像をどう扱うか（変換せず原形保存 / 拒否 / 変換して最初のフレームのみ）。metadata 損失をユーザに提示するか。

<!-- S6 -->
## 6. 不変条件

| # | 不変条件 | 破壊したら違反 |
|---|---------|---------------|
| **I-IIO1** | **既存保存データを書き換えない**。既に `container.assets` に入っている base64 は変換対象外 | intake 以外の経路で asset 内容が書き換わったら違反 |
| **I-IIO2** | **非可逆変換は明示的ユーザ同意を伴う**。黙って画像を劣化させない | 同意プロセスを経ずに lossy 変換を行ったら違反 |
| **I-IIO3** | **変換結果の透明性**。ユーザは「何が行われたか（resize / format 変換 / サイズ）」を事後でも確認できる | 変換内容がどこにも記録・可視化されない場合は違反 |
| **I-IIO4** | **証跡用途を損なわない手段を提供する**。原画保持オプションまたは opt-out を必ず用意する | 非可逆変換を強制した場合は違反 |
| **I-IIO5** | **export / import semantics 不変**。Light / Full / ZIP export の仕様・データ互換性を壊さない | asset key 命名や container schema の既存契約を破ったら違反 |
| **I-IIO6** | **既存 clipboard / drop / attach UX の機能を損なわない**。paste が失敗する・drop が効かなくなる等の regression を起こさない | 既存テスト / 既存手動確認手順で regression が出たら違反 |
| **I-IIO7** | **FI-03（表示性能）の scope に踏み込まない**。read 側の render を変更しない | render / presenter を変更したら違反 |
| **I-IIO8** | **asset:key 参照契約を壊さない**。`![alt](asset:key)` の markdown 参照は常に（最適化後 asset であれ原画であれ）有効な画像に解決される | 参照解決が失敗する構造を作ったら違反 |
| **I-IIO9** | **設定未変更時の挙動は「無加工」に近い既定**。ユーザが明示的に有効化しない限り、既存の運用感を大きく変えない | 同意なく default-on で変換するのは違反 |
| **I-IIO10** | **既存テスト全通過**。1 件でも regression したら違反 | — |

### 6-1. I-IIO4（証跡用途）の具体的意味

- スクリーンショットを「資料・証拠・監査ログ」として使うユースケースを想定
- 「元の 2.9 MB PNG を保持したい」というニーズは PKC2 の offline-first / single-source-of-truth 設計と一貫する
- 本 FI は **ユーザがそれを選べるようにする**ことが必須。「全員が最適化せよ」とはしない

### 6-2. I-IIO9（既定は保守的に）の含意

- ダウンロードしてすぐ使ったユーザに対して、既存の無加工挙動を勝手に変えない
- 初回 paste 時に「最適化しますか？」を確認する UX であれば default-on 扱いしない
- 設定から恒常 on にする場合は明示的な承諾ステップが必要

<!-- S7 -->
## 7. 例

### 7-1. 2.9 MB スクリーンショット（ウルトラワイド環境）

```
ユーザが Mac + Firefox + ウルトラワイドモニタで Cmd+Ctrl+Shift+4 でスクリーンショット取得
  → PKC2 を開いて Ctrl+V
```

**現状（無加工）**: 2.9 MB PNG が base64 化されて `container.assets[key]` に保存。soft warning 発火。body に `![screenshot-...](asset:...)` が挿入される。

**本 FI v1 想定挙動（選択肢の例）**:
- しきい値（例: 1 MB）超過を検出
- ユーザ同意確認（初回のみ / 設定に従う）
- Canvas で長辺 2560px に縮小、WebP quality-85 で再エンコード → 300-500 KB 程度
- （原画保持オンなら）元 2.9 MB PNG も別 asset に保持
- 「2.9 MB → 450 KB に最適化しました」のような透明性メッセージ

### 7-2. 1.2 MB スクリーンショット（Full HD 環境）

```
ユーザが Windows + Full HD でスクリーンショット → PKC2 に paste
```

**現状**: 1.2 MB PNG 無加工保存。soft warning 発火。

**本 FI v1 想定**: しきい値設定次第。1 MB しきい値なら最適化対象（~250 KB 相当）、2 MB しきい値なら無加工保存。

### 7-3. 200 KB の小さな UI 切り抜き

```
小さなアイコン / UI 部分キャプチャ
```

**現状**: 200 KB PNG 無加工保存。警告なし。

**本 FI v1 想定**: しきい値以下なので無加工スキップ。余計な変換を行わない（I-IIO9）。

### 7-4. 原画保持オン + 最適化オンで paste

```
ユーザ設定: 原画保持 = on, 最適化 = on
```

**挙動（想定）**:
- `asset:key`（最適化版 WebP 450 KB）が body の参照先
- `asset:key__original`（原画 PNG 2.9 MB）が並行保存
- attachment UI で「original を表示 / download」できるなんらかの経路を用意

**export 影響**: full export は両方を含む（合計サイズは純増）。Light export は原画を省く選択肢を検討（§8 の論点）。

### 7-5. 原画保持オフ + 最適化オンで paste

```
ユーザ設定: 原画保持 = off, 最適化 = on
```

**挙動（想定）**:
- `asset:key`（最適化版 WebP 450 KB）のみ保存
- 原画は失われる
- 同意プロセスで「原画を残しません。よろしいですか」の確認が必須（I-IIO2 / I-IIO4）

### 7-6. 最適化オフ（既定想定 = オフ）

```
ユーザが何も設定変更していない場合
```

**挙動**: 現状と同じ。無加工保存。soft warning は従来通り発火（閾値見直しが別論点）。

### 7-7. ファイル attach で JPEG 写真 5 MB

```
スマホで撮った写真を file attach ボタンから添付
```

**挙動（想定）**:
- 5 MB JPEG はしきい値超過で最適化候補
- JPEG → WebP quality-85 で ~1.5 MB 程度に縮小
- JPEG は既に lossy のため再 lossy 変換は劣化が目立つ可能性。品質選定は behavior contract で確定

### 7-8. 動画 / 音声ファイルの attach

```
動画ファイル attach
```

**挙動**: 本 FI の対象外。既存の attachment 経路（無加工保存 + size warning）のまま。

<!-- S8 -->
## 8. 次段の接続

### 8-1. behavior contract で確定すべきこと

| 項目 | minimum scope での扱い | behavior contract で確定 |
|------|---------------------|------------------------|
| しきい値（バイト数） | 「しきい値超過で最適化対象」方向のみ | 具体的な数値（例: 1 MB / 2 MB）と判定基準 |
| 対象フォーマット | 「WebP / JPEG / PNG の中から選ぶ」方向 | 出力フォーマットの固定と選定ロジック（PNG→WebP、JPEG→WebP 等） |
| 品質パラメータ | 「quality-85 等の例示のみ」 | 具体的な品質値と、用途（UI screenshot vs 写真）による切替可否 |
| 長辺 resize 上限 | 「例: 2560px」のみ | 固定値と、入力解像度ごとの挙動 |
| ユーザ同意 UX | opt-in / opt-out / one-shot の方向性 | 初回モーダル / 設定画面 / paste 毎 confirm の選択 |
| 原画保持の既定 | オプション化 | 既定値（on / off）と dual storage の asset key 命名 |
| paste / drop / attach の差別化 | 候補として残す | 実際に差別化するか、統一するか |
| soft warning 閾値の扱い | v1 同時着手の論点として記述 | 本 FI で変更するか、別 FI に分離するか |
| animation / transparency 扱い | 論点のみ | 具体的な検出 + 変換拒否 or 原画保存の分岐 |
| 最適化失敗時の fallback | 未定義 | Canvas 変換が失敗した場合の扱い（無加工保存 / 拒否 / 警告） |
| 変換結果のメタデータ格納場所 | 未定義 | どこに「変換履歴」を保持するか（attachment entry の extra field 等） |

### 8-2. supervisor 判断事項（D-series）

| ID | 判断内容 | 選択肢 |
|----|---------|-------|
| **D-IIO1** | 可逆 / 非可逆の基本方針 | 可逆のみ / 非可逆許容（同意前提）/ ハイブリッド |
| **D-IIO2** | 原画保持の既定値 | 既定 on / 既定 off / 初回 prompt |
| **D-IIO3** | ユーザ同意の取り方 | 毎回 confirm / 初回のみ / 設定値に従う（初回 prompt 後） |
| **D-IIO4** | paste / drop / attach で UX を統一するか | 完全統一 / 差別化（どこを？） |
| **D-IIO5** | soft warning 1 MB 閾値の扱い | 本 FI で同時変更 / 別 FI に分離 / 変更しない |
| **D-IIO6** | 出力フォーマット | WebP 統一 / WebP + JPEG の使い分け / PNG optimization のみ |
| **D-IIO7** | しきい値の具体値 | 例: 500 KB / 1 MB / 2 MB / 3 MB |
| **D-IIO8** | animation 画像の扱い | 変換せず原形保存 / 拒否 / 最初のフレームのみ変換 |
| **D-IIO9** | 原画保持時の export 挙動 | Light は原画除外 / Light も含める / ユーザ選択 |

### 8-3. 推奨順（叩き台）

※ supervisor の最終判断が優先。以下は現時点での Claude 側推奨。

1. **D-IIO1 = ハイブリッド**。証跡用途を保護しつつ、スクリーンショットには非可逆許容。ただし I-IIO2 に従い同意必須
2. **D-IIO2 = 初回 prompt**。既定 on は I-IIO9 違反。既定 off はコスト対効果が低い
3. **D-IIO3 = 初回のみ（設定化）**。毎回 confirm は paste 運用で耐えられない
4. **D-IIO4 = 統一（まず）**。差別化は将来負債になりやすい
5. **D-IIO5 = 別 FI に分離**。本 FI の v1 を膨らませない。guardrails.ts の semantics 変更は影響範囲精査が別論点
6. **D-IIO6 = WebP 統一**。モダンブラウザは広範対応、lossless / lossy 両対応、透過保持
7. **D-IIO7 = 1 MB**。現行 soft warning と同じ水準。「警告が出るサイズは最適化対象」の一貫性
8. **D-IIO8 = 変換せず原形保存**。animation 画像は稀、特別扱いは複雑度に見合わない
9. **D-IIO9 = ユーザ選択（Light 時のみ prompt）**。原画保持を選んだユーザが Light で何を期待するか曖昧

### 8-4. v1 で**やらない**ことの再確認

- 既存 asset の再圧縮（I-IIO1）
- remote fetch / OCR / EXIF
- 動画 / 音声の最適化
- Web Worker / WebAssembly 圧縮
- deduplication
- カスタム quality スライダー UI

### 8-5. FI-03 との連携点

本 FI が動き始めたあとも、**既存の重い画像（2.9 MB × 50 枚）は残る**。FI-03 の staged render はそれを救う。両 FI が揃うことで：

- 新規 intake: 本 FI で最適化（サイズ縮小）
- 既存データ: FI-03 で表示最適化（staged processing）

この二段構えが PKC2 のスクリーンショット運用を初めて現実的なものにする。どちらかだけでは不十分。

---

## References

- Sibling FI spec: `docs/spec/textlog-image-perf-v1-minimum-scope.md`（FI-03 rev.2.1 §8-6 で本 FI の分離根拠を記述）
- Spike result note: `docs/development/archived/fi-audits/fi-03-spike-native-lazy-result.md`（2.9 MB / 1 MB+ 観測の出所）
- `src/adapter/ui/action-binder.ts` — paste / drop / attach / import の intake 経路
- `src/adapter/ui/guardrails.ts` — 現行のサイズ警告閾値（SIZE_WARN_SOFT=1MB 等）
- `docs/spec/attachment-foundation-fi04-v1-minimum-scope.md` — attachment 基盤仕様（intake 経路の上位仕様）
