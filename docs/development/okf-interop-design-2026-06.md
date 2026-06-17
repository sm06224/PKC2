# OKF (Open Knowledge Format) ⇄ PKC2 相互運用設計

> **状態: 📐 設計のみ・実装は凍結**(2026-06、プライム・ディレクティブ「機能を足さない・削る/選る/着陸」)。
> tracking issue: **#838**(`lane:arch-v3`)。本書は実装を伴わない設計記録であり、着手には user の明示 go が前提(frozen backlog #776 と同規律)。
> 正本方針: [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md)

## 0. 要旨

Google Cloud が 2026-06-12 に公開した **Open Knowledge Format (OKF) v0.1**(`GoogleCloudPlatform/knowledge-catalog`)は、AI エージェント向け知識表現のオープン標準で、実体は **YAML frontmatter 付き markdown ファイルのディレクトリ**。PKC2 の Container は **OKF バンドルとほぼ構造同型**であり、「Container ⇄ OKF バンドルの export/import」が **PKC2 を AI 対応化する最小・最高レバレッジな一手**になりうる。本書はその構造対応と seam 設計を先行記録する(実装はしない)。

## 1. OKF v0.1 仕様の核

- **concept = 1 つの `.md`**。frontmatter 必須は **`type`** のみ(自由文字列、中央レジストリなし。例 `BigQuery Table` / `API Endpoint` / `Metric` / `Playbook`)。
- 推奨 frontmatter: **`title` / `description` / `resource`(URI)/ `tags`(リスト)/ `timestamp`(ISO 8601)**。**未知キーは consumer が保持必須**(前方互換)。
- **予約ファイル**: `index.md`(ディレクトリ目次 = progressive disclosure)、`log.md`(ISO 日付見出しの履歴)。
- body は慣習的に `# Schema` / `# Examples` / `# Citations` セクション。
- **相互リンク** = 標準 markdown リンク(`/tables/customers.md` 絶対 or `./other.md` 相対)で **型なしの知識グラフ**を形成。壊れたリンクは consumer が許容必須。
- バージョン宣言は bundle root に `okf_version: "0.1"`。conformance =「非予約 .md は全て parse 可能な frontmatter + 非空 `type` を持つ」。

出典: [OKF SPEC.md](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) / [Google Cloud Blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)。

## 2. PKC2 ⇄ OKF 構造対応

| OKF | PKC2 | 備考 |
|---|---|---|
| bundle(ディレクトリ)| **Container** | container_id/title → bundle root メタ + `okf_version` |
| concept `.md` + frontmatter | **Entry**(body=markdown)| PKC2 は既に frontmatter 注入の前例あり(record-offer capture profile の kind/provider/author 等)|
| `type` | **archetype**(text/todo/attachment/folder/…)| 写像語彙は §5-2 で決定要 |
| `title` / `tags` / `timestamp` | Entry.title / Entry.tags / Entry.updated_at | ほぼ 1:1 |
| `resource`(URI)| attachment の source_url / asset 参照 | abstract concept は省略(OKF も同様)|
| サブディレクトリ + `index.md` | **folder**(structural relations)| folder ツリー → ディレクトリ階層 |
| markdown cross-link(知識グラフ)| **relations**(semantic/categorical/temporal)+ 既存 `pkc://` / `entry:<lid>` link-index | OKF は型なしリンク。PKC2 の型付き relation を縮約する際の情報損失は §5-4 |
| `log.md`(時系列履歴)| **textlog** archetype / revisions | textlog は本質的に時系列ログ = 自然な `log.md`|

**含意**: PKC2 は「OKF が標準化しようとしているもの(frontmatter 付き markdown + リンク知識グラフ)」をローカルアプリとして先行実装している。相互運用は新概念の発明ではなく **既存モデルの直列化形式の追加**で済む。

## 3. export / import seam 設計(実装しない)

### 3.1 配置

- **純変換は features 層**: `Container → OkfBundle`(= `{ path: string; content: string }[]`)/ `OkfBundle → Container` の純関数(browser API 非依存、core 型のみ参照)。既存 `selected-entry-export-and-reimport` / `selected-entry-html-clone-export` と同じく features 層に純化。
- **I/O は adapter/platform**: ZIP 梱包・ダウンロード・ファイル取込は既存 export/import 基盤(`adapter/platform`)に乗せる。OKF バンドルは「.md の集合」なので ZIP 化が自然(既存 ZIP 経路を再利用)。

### 3.2 export データフロー(設計)

```
Container
  → 各 Entry を OKF concept .md に直列化
      frontmatter: type=archetype写像 / title / tags / timestamp=updated_at / resource=出典URI
      body: Entry.body(markdown そのまま)
  → folder ツリーをディレクトリ階層 + index.md に
  → relations を cross-link(bundle-relative path)に
  → textlog/revisions を log.md(任意)に
  → assets を §5-3 の方針で resource 化 or assets/ 同梱
  → bundle root に okf_version
```

### 3.3 import データフロー(設計)

```
OKF bundle(.md 群)
  → 各 .md の frontmatter+body を Entry 候補に
  → type → archetype 逆写像(未知 type は generic/text fallback)
  → ディレクトリ階層 → folder + structural relation
  → cross-link → relation 復元(解決できないリンクは保持 or 破棄、§5-4)
  → §5-5 の同意モデルで Container に取込(silent import しない)
```

## 4. AI 対応化の位置づけ + 既存チャネルとの関係

- OKF は **オンディスク/バンドルの相互運用形式**、PKC2 既存の `pkc-ext` / `record:offer` / `propose`(spec v2 §3.8)は **ランタイムのエージェント連携チャネル**。両者は補完関係(前者=知識の可搬な束、後者=実行時の授受)。
- AI エージェントは「OKF バンドルとして export された PKC2 知識」を grounding に使え、PKC2 は外部 OKF バンドルを取込んで自分の知識グラフに統合できる。これが「AI 一級市民」vision([`pkc2-vision-modern-emacs-2026-05.md`](./pkc2-vision-modern-emacs-2026-05.md))の具体化経路の 1 つ。

## 5. 決定が要る論点(着手 go の前提)

1. **export 範囲**: Container 丸ごと / 選択 subtree / folder 単位 のどれを正本にするか(既存の subset export と整合させる)。
2. **archetype → `type` 写像語彙**: 往復可逆性(round-trip)をどこまで保証するか。PKC2 固有 archetype(textlog/form/spreadsheet 等)を OKF `type` 文字列にどうマップし、import 時に逆引きするか。
3. **attachment/asset の扱い**: `resource` URI 化(外部参照)/ バンドル内 `assets/` ディレクトリ同梱 / `data:` URI のいずれか。OKF は base64 を body に持たない設計なので、PKC2 の `assets` 分離方針と親和。
4. **relations → cross-link 写像**: OKF は型なしリンク。PKC2 の categorical/semantic/temporal relation を型なしに縮約すると種別情報が落ちる。frontmatter の custom key(未知キー保持規則を利用)で型を温存するか、損失を許容するか。
5. **import 同意モデル**: 既存 `record:offer` / `propose` 同意経路(PendingOffer banner)に乗せるか、Container 全体 import の既存 import preview/confirm に乗せるか。silent import はしない。
6. **seam 配置の最終確認**: features 純関数 + adapter/platform I/O の二層(§3.1)で確定してよいか。

## 6. プライム・ディレクティブ整合

本件は新機能(export/import 形式の追加)であり、現方針では凍結対象。CLAUDE.md 許可作業の **⑥「設計 doc(実装しない)」** として本書を残す。実装は user の明示 go と、§5 の論点解決を経てから `lane:arch-v3` で着手判断する。**新 archetype / markdown 方言 / UI mode は追加しない**(OKF 直列化は既存モデルの写像であり、新方言ではない点を着手時も死守する)。

## 参照

- [OKF SPEC.md (GoogleCloudPlatform/knowledge-catalog)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [How the Open Knowledge Format can improve data sharing (Google Cloud Blog)](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
- tracking issue: #838
- [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md) — 方針正本
- [`pkc2-vision-modern-emacs-2026-05.md`](./pkc2-vision-modern-emacs-2026-05.md) — AI 一級市民 vision
- spec [`docs/spec/pkc-message-api-v2.md`](../spec/pkc-message-api-v2.md) §3.8 — ランタイムのエージェント連携チャネル
