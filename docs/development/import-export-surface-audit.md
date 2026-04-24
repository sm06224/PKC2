# Import / Export Surface Audit — 2026-04-24

## 1. Purpose / Status

**docs-only、実装ゼロ**。PR #126 で Link migration tool v1 が閉じ(v2.1.1 bump 完了)、次の wave に進む前に **PKC2 の Data surface 全体を棚卸し** するための audit。

目的:

1. 現在 user / dev が見ている import / export / backup / restore / rehydrate / bundle / ZIP / batch / folder-scoped 系の導線を **全て列挙** する
2. それらを harbor 視点の **4 つの surface**(Import / Export / Backup ZIP / Interchange ZIP)に分類する
3. 重複・用語ブレ・UX 問題を洗い出す
4. 次 wave 以降の **user-facing 再編案** と **File Tree Interchange future** の最小スコープを docs で固定する
5. v2.2+ の実装順序を見える化する

やらないこと:

- src / UI / reducer / spec の実装変更
- 既存 UI 文言の書き換え
- 新ユーザー向け manual の書き換え(既存 manual への pointer 追加のみ可)
- version bump
- bundle / release rebuild
- 新しい用語の強制導入(提案レベルで止める)

本 audit の提案は **採否未確定**。user レビューを受けてから個別 PR で実装に落とす。Harbor 原則(入港 / 定泊 / 出港 / 座礁回避)は Link 系 audit と同じく本 audit にも適用される。

参照:

- Link migration audit(先例): `./clickable-image-renderer-audit.md`, `./link-system-audit-2026-04-24.md`
- v2.1.1 changelog: `../release/CHANGELOG_v2.1.1.md`
- manual 運用ガイド: `../manual/07_保存と持ち出し.md`, `../manual/08_運用ガイド_export_import_rehydrate.md`

---

## 2. Harbor 4 surface(入港 / 出港 / 退避 / 交換)

PKC = Portable Knowledge Container。ユーザー視点の Data surface を 4 つに割る:

| 日本語 | 英語 | 目的 | 対応形式(将来案) |
|---|---|---|---|
| **入港** | Import | 外から PKC に入れる | HTML / ZIP / 単体バンドル / file tree(future) |
| **出港** | Export | PKC から外に出す(読み / 共有) | HTML(full / light / readonly / editable)、selected HTML、folder-scoped HTML |
| **退避** | Backup ZIP | 完全復元優先の full-fidelity バックアップ | `.pkc2.zip`(revisions / relations / entries / assets / meta を全部載せる) |
| **交換** | Interchange ZIP / File Tree | 通常フォルダ / SharePoint / OneDrive / Teams と往復 | `.pkc2-tree.zip`(future、`_pkc_manifest.json` + 可読 file tree) |

**4 surface 設計指針**:

- **入港 は default = merge**(§7) / Preview 必須 / 置換は明示 opt-in
- **出港 は "見る / 配る" 用途**(readonly / editable の 2 モード)
- **退避 は "戻す" 用途**(形式は機械可読優先、人間編集は主目的ではない)
- **交換 は "外の世界と文字で会話する" 用途**(human-visible filename 優先、merge-first)

Harbor 4 層の **入港 / 定泊 / 出港 / 座礁回避** と本節の 4 surface は視点が違う:

- **入港 / 定泊 / 出港 / 座礁回避** = PKC 内の **ひとつのリンク・ひとつの形式** が harbor のどの段階で安全に成立するかを評価する視点(Link 系 audit でこの用語を確定)
- **Import / Export / Backup ZIP / Interchange ZIP** = **Data 全体の行き来** を 4 導線に分類する視点(本 audit で確定)

両者は直交する。前者は粒度 = リンク 1 本、後者は粒度 = container 全体 or そのサブセット。

---

## 3. 現在の user-facing surface 一覧

2026-04-24 時点で実装済みの surface を列挙。`data-pkc-action` / menu label / 担当モジュール / 備考 の 4 列。

### 3.1 Export 系(Data panel 内)

| label / action | 担当 | 出力 |
|---|---|---|
| `begin-export`(Full HTML export) | `adapter/platform/exporter.ts` + export dialog | `.pkc2.html`、4 モード(full/light × editable/readonly) |
| `export-selected-entry` | `adapter/platform/text-bundle.ts` / `textlog-bundle.ts` | 選択中 1 件を `.text.zip` / `.textlog.zip` |
| `export-selected-entry-html` | `adapter/platform/exporter.ts`(selected-entry subset) | 選択した TEXT/TEXTLOG 群を subset `.pkc2.html` に包む |
| `export-texts-container` | `adapter/platform/mixed-bundle.ts`(TEXT のみ mode)| container 全 TEXT を nested `.texts.zip` |
| `export-textlogs-container` | `adapter/platform/mixed-bundle.ts`(TEXTLOG のみ mode) | container 全 TEXTLOG を nested `.textlogs.zip` |
| `export-mixed-container` | `adapter/platform/mixed-bundle.ts` | container 全 TEXT + TEXTLOG を `.mixed.zip` |
| `export-folder`(context menu、folder 上のみ) | `adapter/platform/folder-export.ts` | 指定 folder 配下の TEXT/TEXTLOG を `.folder-export.zip` |
| `export-text-zip`(TEXT entry 詳細パネル) | `adapter/platform/text-bundle.ts` | 該当 TEXT 1 件 `.text.zip`、compact checkbox あり |
| `export-textlog-csv-zip`(TEXTLOG entry 詳細パネル) | `adapter/platform/textlog-bundle.ts` | 該当 TEXTLOG 1 件 `.textlog.zip`、compact checkbox あり |

**計 9 導線**。

### 3.2 Import 系(Data panel 内 / drag-drop)

| label / action | 担当 | 入力 |
|---|---|---|
| `begin-import` | `adapter/platform/importer.ts` + import preview dialog | `.pkc2.html` / `.pkc2.zip`、Replace / Merge 選択可 |
| `import-text-bundle` | `adapter/platform/text-bundle.ts` | `.text.zip`、additive |
| `import-textlog-bundle` | `adapter/platform/textlog-bundle.ts` | `.textlog.zip`、additive |
| `import-entry-package` | 上 2 つへ auto-route | `.text.zip` / `.textlog.zip` 自動判定、additive |
| `import-batch-bundle` | `adapter/platform/batch-import.ts` | container / folder export bundle、additive、folder restore あり、preview あり |
| Drag-and-drop | `adapter/ui/file-drop-zone` + route to HTML / batch | 検出して HTML import or batch import に route |
| `confirm-import` | reducer 内 `CONFIRM_IMPORT` | preview → replace apply |
| `confirm-merge-import` | reducer 内 `CONFIRM_MERGE_IMPORT` | preview → merge apply(conflict 解決 UI と連動) |
| `set-import-mode` | preview 内 radio | Replace ↔ Merge 切替 |
| `set-conflict-resolution` | conflict UI 内 | 1 行ごとに keep-current / duplicate-as-branch / skip |
| `bulk-resolution` | conflict UI 一括 | 全 conflict 行に同じ resolution を適用 |

**計 11 導線(重複含む)**。

### 3.3 Rehydrate / Restore 系

| label / action | 担当 | 用途 |
|---|---|---|
| `rehydrate` | view-only chooser overlay | view-only HTML を IDB に取り込んで編集可能に昇格 |
| Revision restore(既存 UI) | adapter `RESTORE_ENTRY` / `BRANCH_RESTORE_REVISION` | エントリの過去 revision を復元 / branch 復元 |

### 3.4 内部 / 起動経路(user-facing ではない)

| module | 用途 |
|---|---|
| `adapter/platform/idb-store.ts` | IDB への workspace 保存 / 読込(自動保存) |
| `adapter/ui/export-handler.ts` | Export dialog の orchestration |
| `adapter/ui/zip-import-warnings.ts` | ZIP import 時の警告 toast |
| `features/import/conflict-detect.ts` | Merge conflict 検出(C1 / C2 / C2-multi 分類) |
| `features/import/merge-planner.ts` | Merge resolution → container plan |
| `features/import/import-planner.ts` | 単一 entry import planning |
| `features/batch-import/import-planner.ts` | Batch import の folder 構造復元 |

現行は上記計 **9 export + 11 import 経路 + 2 rehydrate 経路 = 合計 22 surface** がコード / UI に存在する。

---

## 4. 4 導線への分類(Import / Export / Backup ZIP / Interchange ZIP)

§3 の 22 surface を §2 の 4 導線 + Internal / Advanced / Legacy に振り分ける。

### 4.1 Import(入港)

**User-facing:**

- `begin-import`(HTML / ZIP、Replace / Merge)
- `import-batch-bundle`(container / folder batch、folder restore 付き)
- Drag-and-drop(HTML / batch を自動振分)
- `rehydrate`(view-only HTML を IDB に取り込む)

**Advanced / Internal:**

- `import-text-bundle` / `import-textlog-bundle` / `import-entry-package`(単体エントリ bundle)— 通常のフローは `import-batch-bundle` で扱えるので、**実質 legacy**(ただし画面上は Data panel 内で user に見えている)

### 4.2 Export(出港)

**User-facing(全体 共有):**

- `begin-export`(Full HTML、4 モード)

**User-facing(部分 共有):**

- `export-selected-entry-html`(選択エントリ群の subset HTML)
- `export-folder`(folder 配下を folder-export.zip)
- `export-selected-entry`(単一エントリ bundle)
- `export-text-zip` / `export-textlog-csv-zip`(詳細パネル内の単体 bundle)

**Advanced / 少し被り:**

- `export-texts-container` / `export-textlogs-container` / `export-mixed-container` — archetype-filtered container-wide ZIP。実質 "Interchange に近いもの" を目指した旧導線だが、人間可読な folder tree は出さず **PKC 方言の nested ZIP** なので、現在の位置づけは Export の advanced(本 audit の提案では 8.1 Backup ZIP 側へ寄せるべきか、Interchange ZIP へ統合する判断が必要)

### 4.3 Backup ZIP(退避)

**現状一致するもの:**

- `begin-export` の **Full + editable** モード → HTML 1 ファイルなので実質 "完全バックアップ" として使える
- `.pkc2.zip`(`zip-export-contract.md` 準拠)→ container + assets 保存、revisions 含める設計 **だが現状 user 向けに "Backup ZIP" という呼び名では露出していない**

**不足:**

- UI メニュー上「Backup ZIP」と呼ばれる項目がない(現状は "ZIP Package" 等の曖昧な呼び名で `export-*-container` の群に散らばる)
- Full HTML と ZIP Package の **用途の違い** がユーザーから見て分かりにくい

### 4.4 Interchange ZIP / File Tree Interchange

**現状一致するもの:**

- **なし**(実装されていない)
- `export-folder`(`.folder-export.zip`)は folder 配下を再帰展開するが、中身は **PKC 方言 nested ZIP**(`*.text.zip` / `*.textlog.zip`)。普通のフォルダ / ファイルサーバーで human-editable にはならない

**未実装で future 候補(§9 で詳述):**

- ZIP 直下に `*.md` / `*.bin` を人間可読で配置した `.pkc2-tree.zip`
- SharePoint / OneDrive / Teams files に展開 → 編集 → ZIP に固めて Import、の round-trip
- `_pkc_manifest.json` による meta 保持

### 4.5 Internal / Advanced / Legacy

- `idb-store.ts`(自動保存、起動時 IDB 復元): **Internal**、user 導線外
- `export-handler.ts` / `zip-import-warnings.ts`: **Internal**、UI orchestration
- `conflict-detect.ts` / `merge-planner.ts` / `import-planner.ts`: **Internal**、feature layer
- `import-text-bundle` / `import-textlog-bundle` / `import-entry-package`: **Legacy 候補**、`import-batch-bundle` + content-type 自動判定に統合する案(§5.1 / §6.3)
- View-only rehydrate: **Internal path に寄せる余地あり**(user には "この HTML を取り込む" の 1 ボタンで見せ、chooser overlay の rehydrate 名は内部用語でよい)

**サマリ**:

- **Import 側の user-facing は 3 つ**(標準 Import / Batch Import / Rehydrate)に集約できる
- **Export 側の user-facing は 4-5 つ**(Full HTML / Selected / Folder / Single-entry bundle / archetype-scoped)に散らばっていて UX として重い
- **Backup ZIP は名前すら確立していない**
- **Interchange ZIP は存在しない**

---

## 5. 重複 / 用語ブレ / UX 問題

### 5.1 同じ意味で名前が違う

- **"Bundle" = "ZIP" = "Package"** が混在:`.text.zip` / `.textlog.zip` を「単体バンドル」とも「ZIP Package」とも「single-entry bundle」とも呼んでいる(manual / spec / UI で揺れ)
- **`import-text-bundle` / `import-textlog-bundle` / `import-entry-package`** — この 3 つは実質 **同じ機能**(auto-detect があるなら他 2 つは冗長)
- **"Replace" = "全置換" = "Overwrite"** — UI label は "Replace"、manual では「全置換」、spec ドラフトでは "Overwrite" がたまに混じる

### 5.2 違う意味で同じ "export" と呼んでいる

- **Full HTML export** = **container 全部を HTML 1 枚にする**(配布・閲覧向け)
- **`.pkc2.zip` export** = **container 全部を ZIP に固める**(復元向け)
- **`.folder-export.zip`** = **folder 配下を nested ZIP に固める**(Interchange 志向ではあるが人間可読ではない)
- **Selected-entry HTML export** = **subset の HTML**(配布向けサブセット)
- **Selected-entry `.text.zip` export** = **単一エントリ移植向け ZIP**(再 import 前提)

**全部 "export" と呼ばれているが、ユーザーの目的は 4 通り(配布 / 復元 / 交換 / 移植)に分かれる**。

### 5.3 Backup と Export の混在

- manual 07 §220 "バックアップの推奨" で「ZIP Package として書き出し」と書いてあり、ZIP export を **backup 目的** として扱っている。しかし UI 上は `begin-export` の下層 or `export-*-container` の群にあるだけで、「これが backup 用」とは示されていない
- **Full HTML + editable も実質 backup として使える** が、"Backup" という呼び名は付いていない
- ユーザーから見て「どれを押せばバックアップなのか」がぶれる

### 5.4 Import の replace / merge / restore 揺れ

- Import preview で **default = Replace**(破壊的)→ Merge(非破壊)
- Batch Import は **常に additive**(Merge 固定 + folder restore)
- Rehydrate は **view-only → editable 昇格**(実質的には "新規 workspace 化")、Merge / Replace の軸外
- Revision restore は **同じ entry の過去版に戻す**(import とは別軸)

「既存データを保持して追加する」という操作が **Merge(Import 内)/ Batch additive / Rehydrate / Revision restore** の 4 経路に分散、ユーザーには「どれを押せば安全に取り込めるか」の判断が難しい。

### 5.5 Light / readonly / editable の関係が不透明

2 軸(**範囲**:full / light) × (**モード**:editable / readonly)で 4 モードあるが、組合せの意味がユーザーに伝わりにくい:

- **Light + editable** = 本文だけ編集可能(assets なし、稀な使用)
- **Light + readonly** = 本文のみ閲覧(共有用軽量)
- **Full + editable** = 完全バックアップとしても使える(実質 self-backup)
- **Full + readonly** = 完全な閲覧専用(配布向け)

現状は Export dialog で 2 axis の radio を選ばせる UI。**典型ユース(3-4 用途)にプリセットを用意** したほうが user-friendly。

### 5.6 folder-scoped / bundle / ZIP の関係

- `export-folder`(`.folder-export.zip`)は folder 配下を nested ZIP に、中身は `.text.zip` / `.textlog.zip` の集合
- `export-texts-container` / `export-textlogs-container` / `export-mixed-container` も nested ZIP
- 両者の違いはスコープだけ(folder 単位 vs container 全体 + archetype filter)
- **中身の形式は同じ nested ZIP**

UX としては **「スコープを選ぶ」→「形式は自動」** にまとめられる。

### 5.7 user-facing 過剰

Data パネル内の Export / Import / Share / Archive の **3 グループ × 各 3-5 項目 = 9-15 ボタン**。ユーザーが初見で全部の意味を把握するのは困難。

**提案**(§6 で詳述): **トップレベル 4 導線**(Import / Export / Backup ZIP / File Tree ZIP)に畳み、各導線内で advanced option を展開する方が明快。

---

## 6. 推奨 user-facing surface(案)

### 6.1 トップレベル 4 導線

Data パネルを 4 つに畳む(提案、user 判断待ち):

```text
Data
  Import... / 取り込む...
  Export... / 書き出す...
  Backup ZIP... / バックアップ ZIP...
  File Tree ZIP... / ファイルツリー ZIP...  (future、v2.2+)
```

各ボタンを押すと **モーダル** が開き、内部で Range / Format / Mode などの advanced option を選ばせる。トップレベルは **目的語**(動詞 + ...)に揃えて「何をする導線か」がラベルから分かる状態にする。

### 6.2 各導線の advanced option

#### Import...

- **モード** radio:Merge(default、非破壊)/ Replace(確認を挟む)
- **Target folder** selector(Merge 時のみ、default = root or manifest 復元)
- **Structural relation 復元** toggle(default = on、folder tree を源から復元)
- **conflict 解決 UI**(Merge 時に同名衝突があれば)
- **Batch mode 自動判定**:アップロードされたファイル内容で「通常 Import vs Batch Import」を振り分ける → user から見ると Import は 1 ボタンだけで済む
- **Drag-and-drop 対応**(既存維持)

#### Export...

- **Range** radio:Full workspace / Selected / Folder scope
- **Mode** radio:Editable(自己バックアップ寄り)/ Readonly(配布寄り)
- **Format** radio:HTML Full / HTML Light(assets 無し)
- `export-text-zip` / `export-textlog-csv-zip` のような **単体 entry bundle は Backup ZIP / Interchange ZIP 側** か **詳細パネルの quick action** に降ろす(Data panel top には出さない)

#### Backup ZIP...

- **Full 一択**(範囲選択なし、全 container)
- **Include revisions** toggle(default = on)
- 出力:`.pkc2.zip`
- "いつか戻したい、その時に一番確実な形" というラベル文案

#### File Tree ZIP... (future)

- `.pkc2-tree.zip`、SharePoint / OneDrive / Teams 連携向け
- §9 で詳述、v2.2+ 候補
- 初版は **Export のみ**、Import round-trip は段階実装でよい

### 6.3 非推奨化 / 隠す候補

Data パネルの top から **外して **OK:

- `import-text-bundle` / `import-textlog-bundle` / `import-entry-package` → Import の auto-detect に統合
- `export-texts-container` / `export-textlogs-container` / `export-mixed-container` → **Backup ZIP 側**(archetype filter は advanced option)または entry 詳細パネル quick action
- `export-folder`(context menu) → 詳細パネル / context menu には残す、Data panel top には出さない
- `export-text-zip` / `export-textlog-csv-zip`(詳細パネル内) → そのまま詳細パネル quick action として残す(Data panel top からは外す)
- view-only chooser の Rehydrate → ラベルを「取り込む(Import ボタンと同じ behavior)」に統合するか検討(chooser overlay 用語 "rehydrate" は internal のみで良い)

**migration tool v1** と同じく、ユーザーが **"シンプルな Copy / Paste / Import / Export" で済むように内部で全部裁く** 方向を続ける。

---

## 7. Default import = merge 原則

### 7.1 なぜ merge を default にするか

**現状**: Import dialog の radio は **Replace が default**(manual 07 §Import 確認ダイアログ)。

**問題**:

- Import は **破壊的操作**(Replace が走れば手元の container が丸ごと置換される)
- 初見ユーザーが Preview を飛ばして Enter を押すと、手元のデータが消える
- 一方 Merge は **非破壊**(追加取り込み、衝突は conflict UI で確認)
- ユーザーの **期待値** は「ファイルを import したら内容が増える」であって「全消しして置き換わる」ではない(他の一般的アプリの振る舞いとも整合)

**harbor 視点**:

- 入港は「知識・添付・リンク・文脈が雲散霧消しないように」受け入れる操作。replace default は「入港の際に港ごと入れ替える」挙動で、harbor 原則に反する
- replace はあくまで **完全置換してリフレッシュしたい熟練ユーザー** の advanced 操作

**提案**:

- Import dialog の default radio を **Merge にする**
- **Replace に切り替えるときは明示確認**(radio 切替で警告色のインライン注意書きを出す、確認ダイアログを挟むなど Slice で決める)
- Apply 後の結果 toast / summary に「N entries added」「M entries skipped / branched」などを出す

### 7.2 Preview 必須

- **現状 既に preview 必須**(manual 07 §120、`IMPORT_PREVIEWED` / `BATCH_IMPORT_PREVIEWED` domain event が存在)
- 本提案でも preview 必須は維持 / 強化(Import の default を Merge にしても preview はスキップしない)
- preview 中に **Replace / Merge を切り替えられる** 既存 UX を維持
- **v2.2+ で検討**: folder scope 指定時の preview に「どの folder 配下に入るか」を明示表示する

### 7.3 Conflict handling

既存仕様は `docs/spec/merge-import-conflict-resolution.md` + `docs/spec/merge-import-conflict-ui-minimum-scope.md` で確定。本 audit は **不変**:

- C1(content identical)→ 既定 Keep current
- C2(title match, content differs)→ Duplicate as branch / Keep current / Skip のいずれか
- C2-multi(N host candidates)→ 必ず明示的に Duplicate / Skip を選ばせる(Keep current 不可)
- provenance relation が自動付与されて「どの host から派生した」を追跡可能

Slice 単位で変えるべき点はなし。

### 7.4 Target folder

- **現状**: Batch import 時は target folder 選択可(`docs/development/batch-import-target-folder-selection.md`)
- **提案**: 通常の Import でも Merge mode のときに **target folder の指定オプション** を追加(未指定なら root、または imported 側の structural relation をそのまま復元)
- これで「プロジェクト単位で取り込みたい」ケースが明示的に表現できる

### 7.5 Structural relation restore

- **現状**: `docs/development/container-wide-batch-import.md` + `docs/development/folder-scoped-import.md` で folder 復元は既にある
- **提案**: import preview に "structural relation を復元する / flat に展開する" の明示 toggle を追加
- default は **復元する**(source の folder tree を維持)

### 7.6 Flat fallback

- **現状**: folder metadata が無い / 壊れている場合は flat fallback
- **提案**: fallback が起きた時に preview の result 欄でユーザーに通知する(既に warning を toast している path もあるが、preview 時点で見えると意思決定しやすい)

### 7.7 Import provenance

- **現状**: merge の Duplicate as branch / Restore as branch / Dual-edit branched で provenance relation が自動付与
- **提案**: Import source URL / filename / timestamp を **meta field** としてエントリに埋める案は **見送り**(plain entry body を import source 情報で汚染しない、metadata は relation 側に寄せる現方針を維持)

## 8. Backup ZIP と Interchange ZIP の違い

### 8.1 Backup ZIP の定義

- **目的**: **PKC を完全復元できる機械可読バックアップ**
- **構造**:
  - `manifest.json` + `container.json`(現行 `zip-export-contract.md` の形、container shape JSON そのまま)
  - `assets/<asset_key>.<ext>` にバイナリを展開
  - `revisions/` を **含める**(完全性優先)
  - entries / relations / revisions / assets / meta を全て載せる
- **使い方の主題**: マシン移行 / 完全バックアップ / Git 管理 / 別 PKC 環境への復元
- **human 編集は想定外**: 人が ZIP を開いて `.json` を書き換えることは API 契約外(壊れたらその時はやむなし)
- **Import**: Replace / Merge どちらも OK、conflict UI もそのまま使える
- **現状**: `docs/spec/zip-export-contract.md` + `docs/development/batch-import-transaction-hardening.md` で実装済みに近いが、"Backup ZIP" という呼び名は正本化されていない

### 8.2 Interchange ZIP の定義

- **目的**: **外の世界と human-visible なファイル単位で往復する**
- **構造**(future、提案):
  - ZIP 直下に PKC2 container tree を **人が読めるフォルダ構造** で展開
  - TEXT/Markdown は `*.md` として置く、attachment は生バイナリで置く
  - TEXTLOG は `*.log.md`(各ログを heading / horizontal rule で区切った人間可読形)+ side-by-side に `*.log.json` sidecar(id / createdAt / flags 再構成用)
  - `_pkc_manifest.json`(hidden、PKC 側の構造復元に必要な最低限の meta:archetype 分類、relation、source_url、import 元 path 等)
  - original path metadata:`*.md` / `*.bin` の各ファイルに対して、manifest に source relative path を記録
- **使い方の主題**: SharePoint / OneDrive / Teams / 普通のファイルサーバーから送られる / に戻す / を別 reader で読む
- **human 編集が前提**: ZIP を解いて 1 ファイルずつ触り、また ZIP にして import しても round-trip が成立する
- **Import**: **Merge-first**(human が編集したファイルを PKC に取り込む想定、Replace は稀)
- **現状**: **未実装**。`docs/manual/07_保存と持ち出し.md` §226 で "ZIP Package" と呼んでいる形式は実質 **Backup ZIP**。Interchange ZIP はまだ存在しない

### 8.3 サイド・バイ・サイド比較表

| 項目 | Backup ZIP | Interchange ZIP |
|---|---|---|
| 一次目的 | 復元 | 交換 |
| 編集想定 | ❌ 人は触らない | ✅ 人が触る前提 |
| ファイル構造 | `container.json` + `assets/` フラット | 人が読めるフォルダ tree + manifest |
| revisions | ✅ 含める | ❌ 含めない(人が触る対象外) |
| relations | ✅ 完全保存 | ⚠️ structural のみ folder に反映、他は manifest |
| manifest | minimal | 詳細(archetype / source path / relation) |
| Default import mode | Replace 可、Merge 可 | **Merge 強制**(full replace だと外の folder tree が壊れる) |
| 拡張子 | `.pkc2.zip` | `.pkc2-tree.zip`(提案) |
| future reader | PKC2 のみ | PKC2 + 普通の ZIP reader + git + SharePoint |
| round-trip | OK(ただし内部形式を外で編集すべきでない) | OK が主題(外で編集して戻せる) |

### 8.4 同じ ZIP で済ませられないか

**結論: 分けたほうが良い**。

- 「完全復元優先」と「人間可読で往復」は **互換しない最適化**。同じ ZIP に同居させると
  - human filename(`Project Plan.md`)と asset_key(`ast-0123-abcdef`)の両方を保持する必要があり、どちらかが "正本" でない状態になる
  - revisions を含めるとファイル数が数倍に膨らむので外の folder ツールが重い
  - manifest の解釈が Backup 向け / Interchange 向けで分岐し、reader 側の実装が複雑化
- 分けた場合のコスト:
  - ユーザー向け選択肢が 1 つ増える(Export メニューの選択肢が増える)
  - doc が 2 系統必要
- それでも「復元 vs 交換」は **意味が直交** しているので、UI で 2 つ用意するのが ambiguity の削減になる

---

## 9. File Tree Interchange future(v2.2+ 候補)

### 9.1 最小スコープ

**docs-only の "方向確認" であって、仕様の最終化ではない**。v2.2+ で個別 spec を切るときに本節を起点に詳細を決める。

最小スコープ(v1):

1. **Export** のみ(Import round-trip は v2 以降)
2. 対象 archetype: **TEXT / TEXTLOG / folder / attachment** の 4 種
3. `.pkc2-tree.zip` を出力、ZIP 直下は **人間可読な folder tree + assets/ + `_pkc_manifest.json`**
4. 普通の ZIP reader / SharePoint / OneDrive / Teams で **展開して読める / 編集できる**
5. `_pkc_manifest.json` の schema で minimum round-trip 情報を保持
6. future の Import round-trip でこの manifest を読み戻す

### 9.2 Folder / file / md / attachment の扱い

| PKC 側 | File Tree 側 | 備考 |
|---|---|---|
| `folder` entry | ディレクトリ | description は `<folder-name>/_folder.md`(optional) |
| `text` entry | `*.md` | front-matter は使わない(meta は manifest へ) |
| `textlog` entry | `*.log.md` + `*.log.json` | md は人間可読な segmented 表現、json は id / createdAt / flags を保つ sidecar |
| `attachment` entry | 生バイナリ | 元の filename があればそれで、無ければ `<asset_key>.<mime-derived ext>` |
| `todo` / `form` / `system-*` / `generic` / `opaque` | **v1 対象外** | 次 wave で個別設計 |

### 9.3 relative link → asset: / entry: 変換

**Export 側**:

- body 内の `![alt](asset:<key>)` → `![alt](./assets/<filename>)` に rewrite
- body 内の `[label](entry:<lid>)` → `[label](./<relative-path-to-target>.md)` に rewrite
- rewrite が成立しない(target が tree 外)場合は **`asset:<key>` / `entry:<lid>` のまま残し、manifest に記録**
- 逆変換は Import 時に manifest + relative path を頼りに `asset:` / `entry:` に戻す

**未解決(未来の spec で決める)**:

- Portable PKC Reference(`pkc://<other>/...`)を file tree 側でどう表現するか(そのまま残す案が妥当)
- External Permalink を file tree 側でどう表現するか(`<base>#pkc?...` はそのままで可)
- clickable-image が canonical 化された後、それを file tree に落とすか(rewrite 対象に含めるか)

### 9.4 `_pkc_manifest.json`

最小 schema(提案):

```json
{
  "schema_version": 1,
  "tool": "pkc2",
  "pkc2_version": "2.2.x",
  "exported_at": "2026-MM-DDTHH:MM:SSZ",
  "container": {
    "container_id": "...",
    "title": "...",
    "schema_version": 1
  },
  "entries": [
    {
      "lid": "...",
      "archetype": "text",
      "title": "...",
      "relative_path": "project-a/note.md",
      "created_at": "...",
      "updated_at": "...",
      "tags": [...]
    }
  ],
  "relations": [
    { "id": "...", "from": "...", "to": "...", "kind": "structural" }
  ],
  "assets": [
    {
      "asset_key": "ast-0123-abcdef",
      "filename": "assets/photo.png",
      "mime": "image/png",
      "size": 12345
    }
  ]
}
```

- `revisions` は **含めない**(交換用、復元用は Backup ZIP)
- source path は relative で持つ(ZIP 再展開時に portable)
- SharePoint 等で一部ファイルが削除された場合、manifest が無ければ **flat import**(§5.6)に fallback

### 9.5 SharePoint / OneDrive / Teams files 復元シナリオ

想定ユーザーストーリー:

1. 大企業で PKC2 を使い始めたが、業務データは SharePoint や Teams files にある
2. PKC2 から `.pkc2-tree.zip` を Export → SharePoint の該当 folder に展開(普通のフォルダ tree になる)
3. SharePoint / Teams で他メンバーが `.md` や attachment を編集(`_pkc_manifest.json` は触らないか、最低限 filename 列だけ更新する)
4. 改訂 folder を再度 ZIP で固めて PKC2 に Import
5. PKC2 は manifest + relative path を頼りに `asset:` / `entry:` link を再 resolve、Merge 動作で取り込む

この経路により、**PKC は外の世界と "共通のファイル言語" で交換できる**。PKC 内の legacy identifier(asset_key / lid)を外に漏らさず、外からは普通のフォルダに見える。

### 9.6 ZIP slip / zip bomb guard

Import 時の必須ガード(実装 slice で詳細):

- **ZIP slip**(相対パス `../` で sandbox を escape):path normalize + `../` / 絶対 path / drive letter 検知で reject、警告 toast 表示
- **zip bomb**(圧縮展開比が極端に大きい):展開前に **圧縮率上限** / **展開サイズ上限** を設定、超えたら interrupt
- **symlink 同梱**(一部 ZIP は symlink エントリを持ち得る):**常に reject**
- **filename 異常**(NUL 文字 / control char / Windows 予約語 / 空文字):reject or sanitize
- **manifest 不整合**(entry が `assets/` に存在しない、relation が未知 lid を指す):Import は成功、warning toast

既存 `.pkc2.zip` import でも類似ガードが入っている(`docs/manual/07_保存と持ち出し.md` §199 "ZIP Import の警告")ので、**同じガードを File Tree Interchange でも踏襲**。

### 9.7 今回実装しない理由

- 本 audit は docs-only、実装に踏み込まない
- File Tree Interchange の **用途の明文化** + **最小スコープの合意** が先
- 実装には ZIP writer / reader の整備 + relative link rewrite engine + manifest schema 固定 + round-trip test matrix が必要 → 個別 spec を経て v2.2+ の 1 wave として切る価値がある
- v2.1.1 の時点では **内部に既存の "Backup ZIP 相当"** がある状態で十分実用可能、Interchange ZIP は新たな harbor opening として設計を固めてから着手

---

## 10. Proposed roadmap(非拘束)

順序と粒度は user レビュー後に決める。推奨順:

### 10.1 Slice α — UI vocabulary cleanup(docs-only + UI label 変更のみ)

**粒度**: docs-first で spec + UI label を揃える、コードは最小限の文字列変更に留める。

- Data パネルのボタン名を **Import / Export / Backup ZIP / File Tree ZIP**(または日本語)に統一
- manual 07 の節タイトル / 説明を新 vocabulary に同期
- `.text.zip` / `.textlog.zip` の呼び方を **Single-entry bundle** に統一
- `Rehydrate` は UX 的に "Import の別動線" として見せ、内部実装用語で残す

**リスク**: UI label 変更は軽度、既存 test / spec は label 文字列に依存していないので影響小。

### 10.2 Slice β — Default import = merge(§7)

**粒度**: preview dialog の default radio 変更 + Replace 切替時の警告追加。

- `docs/spec/merge-import-conflict-resolution.md` v2 相当を作成 or 追記
- UI 変更 + 既存テスト更新
- バックワード互換:import を Replace で走らせる既存シナリオは preview の radio 切替で同じ結果に至る(1 クリック増えるだけ)

**リスク**: Replace に慣れた既存ユーザーに多少の confusion、preview + radio 切替で緩和。

### 10.3 Slice γ — Backup ZIP 名称の正本化(docs + UI)

**粒度**: 既存 `zip-export-contract.md` 準拠の `.pkc2.zip` を **"Backup ZIP"** として UI で命名、Export 画面から独立した導線として露出。

- spec: `docs/spec/backup-zip-v1.md` 新規 or 既存 contract doc を昇格
- UI: Data panel top に **Backup ZIP...** ボタン追加、既存 `export-*-container` 群を **advanced モーダル内** に集約

**リスク**: 新規 spec 1 本 + モーダル実装、中規模。

### 10.4 Slice δ — File Tree Interchange Protocol v1 spec(docs-only)

**粒度**: §9 を基に `docs/spec/file-tree-interchange-v1.md` を新規作成、Export / manifest / relative link rewrite / ZIP slip / zip bomb guard を spec-first で固定。

**リスク**: docs-only なので実装ゼロ、ここで合意を取ってから Slice ε で Export 実装に入る。

### 10.5 Slice ε — File Tree Interchange Export 実装

**粒度**: `.pkc2-tree.zip` の Export のみ(Import round-trip は v2)。

- `src/adapter/platform/file-tree-export.ts` 新規
- relative link rewrite engine を features 層で pure function に
- unit tests + integration tests

**リスク**: 新規 adapter module、中規模。Import round-trip を後回しにすることで初版を小さく収める。

### 10.6 Slice ζ — File Tree Interchange Import round-trip

**粒度**: `.pkc2-tree.zip` の Import 対応(manifest parse + relative link reverse rewrite)。

**リスク**: Export 側の deploy 後、実運用のフィードバックを見てから着手。

### 10.7 Slice η — Export profile consolidation(UI)

**粒度**: Export モーダルを 3 プリセット(Share / Archive / Interchange)+ advanced option に畳む、既存 4 モード × range × format 選択 UI を整理。

### 10.8 Slice θ — Import preview unification(UI)

**粒度**: 通常 Import と Batch Import の preview 画面を統一(content-type auto-detect で UI 分岐をなくす)。

---

## 11. Non-goals / 今回触らない

本 audit(docs-only)は以下を **一切** 扱わない:

- src / UI / reducer / spec の実装変更
- 既存 UI button label / manual 文言の書き換え(本 doc 内の提案のみ)
- version bump
- bundle / release rebuild
- 新ユーザー向け manual の書き換え
- 新しい用語の強制導入(本 doc 内で "Backup ZIP" / "File Tree ZIP" と呼んでいるのは **提案**、採用は個別 PR で)
- 既存 `zip-export-contract.md` / `batch-import-*.md` / `folder-scoped-*.md` など個別 spec の内容書き換え
- `@[card]` / clickable-image / color tag / card / embed(Link audit の別 surface)
- cross-container resolver / P2P(v2.2+ の別 wave)
- OS protocol handler for `pkc://`(別 wave)

本 audit の提案は **採否未確定**。user レビューを受けてから個別 PR で実装に落とす。

---

## 12. References

- **manual**:
  - `../manual/07_保存と持ち出し.md`
  - `../manual/05_日常操作.md`
  - `../manual/08_運用ガイド_export_import_rehydrate.md`
- **spec**(既存):
  - `../spec/merge-import-conflict-resolution.md`
  - `../spec/merge-import-conflict-ui-minimum-scope.md`
- **development**(既存):
  - `./zip-export-contract.md`
  - `./text-markdown-zip-export.md` / `./textlog-csv-zip-export.md`
  - `./text-container-wide-export.md` / `./textlog-container-wide-export.md` / `./mixed-container-export.md`
  - `./folder-scoped-export.md` / `./folder-scoped-import.md`
  - `./container-wide-batch-import.md`
  - `./batch-import-result-feedback.md` / `./batch-import-target-folder-selection.md` / `./batch-import-transaction-hardening.md`
  - `./import-preview-ui.md`
  - `./light-mode-badge-ui.md`
  - `./selected-entry-export-and-reimport.md` / `./selected-entry-html-clone-export.md`
  - `./merge-import-implementation.md` / `./selective-import.md`
  - `./provenance-metadata-copy-export-v1.md`
- **Link 系 audit**(先例):
  - `./clickable-image-renderer-audit.md`
  - `./link-system-audit-2026-04-24.md`
  - `../spec/link-migration-tool-v1.md`
  - `../spec/pkc-link-unification-v0.md`
- **release**:
  - `../release/CHANGELOG_v2.1.0.md`
  - `../release/CHANGELOG_v2.1.1.md`
- **src**(inventory の根拠):
  - `../../src/adapter/platform/exporter.ts`
  - `../../src/adapter/platform/importer.ts`
  - `../../src/adapter/platform/folder-export.ts`
  - `../../src/adapter/platform/batch-import.ts`
  - `../../src/adapter/platform/text-bundle.ts` / `textlog-bundle.ts` / `mixed-bundle.ts`
  - `../../src/adapter/platform/idb-store.ts`
  - `../../src/features/import/*`
  - `../../src/features/batch-import/import-planner.ts`
  - `../../src/adapter/ui/export-handler.ts`
  - `../../src/adapter/ui/zip-import-warnings.ts`

---

**Status**: docs-only audit draft、2026-04-24。本 doc は提案集であり、採否は個別 user レビュー + PR で確定する。user が提案に合意したら §10 の順序で Slice α → η / θ に進む。合意が取れない提案は本 doc の後継で改訂する。
