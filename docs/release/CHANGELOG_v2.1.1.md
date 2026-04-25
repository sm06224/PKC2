# PKC2 v2.1.1 — Release notes

**Release date**: 2026-04-24
**Schema**: 1(変更なし — additive-only)
**Previous release**: v2.1.0

v2.1.1 の主題は **Link migration tool v1 の完成** です。v2.1.0 Known limitations に `Link migration tool is designed (spec v1) but not implemented` と書かれていた箇所が、**実装・UI・Apply・Manual** まで閉じた状態で解消されました。schema breaking はなく、既存 container / export は v2.1.0 と同じ形で読み込めます。

---

## Highlights

- **Normalize PKC links ツール** — Shell menu → Tools → `🔧 Normalize PKC links` から preview + Apply all safe が使えます
- **Revision-backed migration** — Apply した migration は全て revision として記録され、revision restore から元に戻せます。同じ Apply 操作は `bulk_id` で束ねられているので、将来の bulk undo UI で group 単位の restore も可能です
- **Stale-candidate safety** — Preview と Apply の間に本文が変わった場合、当該候補は自動で skip され、隣接候補のみが適用されます("source text changed" bar で件数が見えます)
- **Harbor-safe dialect gate** — 標準 Markdown の clickable-image `[![alt](url)](url)` を誤って書き換えないよう、Candidate D を scanner v1 から撤去し、clickable-image を future dialect として reservation に降ろしました(詳細は `docs/development/clickable-image-renderer-audit.md`)
- **Manual sync** — 日常操作 / トラブルシューティング / 用語集 が Link migration tool v1 に同期
- **External Permalink receive fragment scroll(2.1.1 patch)** — `fragment=log/<logId>` を含む External Permalink を外部からクリックして開いたとき、対象エントリを選択した直後に該当 TEXTLOG log row まで自動スクロールします(v2.1.0 Known limitations の G4、本リリース内の consistency patch で解消)

詳細は以下のセクション:

---

## Normalize PKC links(Link migration tool v1)

Phase 2 の 4 slice を経て、Link system に残っていた最後の "未実装" ピースが完成しました。

### 導線

- **Shell menu**(`⚙ Menu`) → **Tools** セクション → **`🔧 Normalize PKC links`**
- container が起動していないとボタンは disabled(`data-pkc-disabled-reason="no-container"`)

### 対象候補(3 種、scanner v1)

| 種別 | Before | After |
|---|---|---|
| **Empty label link** | `[](entry:<lid>)` / `[](asset:<key>)` | `[<Entry Title>](entry:<lid>)` / `[<Asset Name>](asset:<key>)` |
| **Legacy log fragment** | `[memo](entry:<lid>#<logId>)` | `[memo](entry:<lid>#log/<logId>)` |
| **Same-container Portable PKC Reference** | `[ref](pkc://<self>/entry/<lid>)` / `[ref](pkc://<self>/asset/<key>)` | `[ref](entry:<lid>)` / `[ref](asset:<key>)` |

空ラベル + 旧 TEXTLOG fragment が重なっている場合は 1 件にまとめて処理されます(label 合成 + fragment 正規化を同時適用)。

### 非対象(一切触らない)

- **cross-container `pkc://<other>/...`** — 別 PKC の識別子、v1 では保持
- **ordinary URL**(`https:` / `http:` / `file:` / `ftp:` / `mailto:` / `tel:`)
- **Office URI**(`ms-word:` / `ms-excel:` / `onenote:` 等)
- **`obsidian:` / `vscode:` / 他未知スキーム**
- **canonical image embed** `![alt](asset:<key>)` / **canonical transclusion** `![alt](entry:<lid>)`
- **clickable-image** `[![alt](url)](url)` — 標準 Markdown の記法、v1 対象外(future dialect、§Harbor-safe dialect gate 参照)
- **code block / inline code 内のリンク**(``` / `~~~` / `` ` ``)
- **raw HTML 内のリンク**
- **body に書かれた External Permalink** — Copy 導線から直接本文に書き出す経路は存在しないため v1 は対象外

### 画面表示

- **ヘッダ**: `N candidates across M entries (K safe).`
- **候補リスト**(各行): `[SAFE]` バッジ / kind label / 対象エントリタイトル + archetype + `log/<logId>`(TEXTLOG 時)/ Before / After のコードブロック / Reason
- **Apply all safe ボタン** + **Close ボタン** / 背景クリック / Escape でも閉じる

### Apply の動作

1. `Apply all safe` を押すと、ダイアログ表示時の候補を blindly 使わず、**現在の container を再 scan**
2. 各候補の `Before` 文字列を現在の本文と照合(**stale 検出**)
3. 一致するものだけ適用、同一本文内の複数候補は **offset 降順** で置換(earlier rewrite が later offset を shift するのを防ぐ)
4. 書き換わったエントリごとに **revision を記録**、全件共通の `bulk_id` で束ねる
5. **結果バナー** を表示:
   - `Applied N link migrations across M entries.`
   - `Skipped K candidates because the source text changed between preview and apply.`(drift が発生した場合のみ)
6. ダイアログは **再 scan** した結果を表示 → 残り 0 件なら empty state `All PKC links in this container are already in canonical form.`

### Apply が無効になる条件(6 種、ツールチップに理由が出る)

| 理由 | 対処 |
|---|---|
| `readonly` | light export / embedded viewer で起動中。編集可能 container で開き直す |
| `import-preview` | import preview 進行中。先に Confirm / Cancel |
| `light-source` | 永続化不可セッション(undo 不能)。通常の起動方法で開き直す |
| `view-only-source` | 同上(view-only source) |
| `editing` | 他エントリ編集中。Save / Cancel を待つ |
| `no-candidates` | 候補 0 件 |

preview は readonly / embedded でも開けます(scanner は pure read-only、「何が直せるか見るだけ」用途を許可)。

### Undo

Apply で書き換わったエントリには **revision snapshot** が残ります。右ペインの revision 履歴から `Restore` で元の本文に戻せます。`bulk_id` が付いているので、将来の一括 restore UI でも同じ Apply を group として扱えます。

---

## Harbor-safe dialect gate

v2.1.0 初期の Phase 2 設計で一度 "Candidate D — Legacy asset image embed" という opt-in 変換を spec に入れていましたが、2026-04-24 の Markdown standard compatibility + PKC dialect design audit の結論として **scanner v1 から撤去** しました。

### 撤去理由

- `![alt](asset:<key>)` は asset resolver が `data:` URI に展開する **現行 canonical image embed**、migration で触る理由がない
- 旧 spec §3.5 の after 形 `[![<alt>]](asset:<key>)` は markdown-it が literal `![]` label の anchor として token 化し、clickable image にならない
- 意図を汲んだ nested 形 `[![<alt>](asset:<key>)](asset:<key>)` は標準 CommonMark の clickable-image だが、現行 PKC2 `SAFE_URL_RE` に `asset:` が含まれないため外側 link が reject され literal 漏れが起きる

### 将来方針

- 標準 Markdown の clickable-image は **future dialect として reservation**(`docs/spec/pkc-link-unification-v0.md` §5.7.5)
- renderer / asset-resolver / action-binder の整備とセットで migration tool v2 として扱う(航路図は `docs/development/clickable-image-renderer-audit.md` に固定済み)
- `[![]](target)` は **invalid / do-not-emit** として永続的に避ける(literal label `![]` にしかならない)

この判断は **harbor 4 層評価**(入港 / 定泊 / 出港 / 座礁回避)に基づいて行われました。PKC は閉じた Markdown 島ではなく整備された港であり、現行 renderer が safely dock できない future dialect を migration が自動生成することは harbor 原則違反と位置付けています。

---

## Manual sync

Slice 4 で以下を `docs/manual/` に反映済み:

- **05 日常操作** — §PKC リンクを正規化する — Normalize PKC links(対象 / 非対象 / preview 表示 / Apply 動作 / 無効化条件 / Undo)
- **09 トラブルシューティング** — 5 件新規
  - 候補が出ない(7 原因の切り分け)
  - メニュー項目が灰色(no-container)
  - Apply all safe が押せない(理由別対処)
  - skipped された候補が出た(stale guard 説明)
  - clickable-image が変換されない(future dialect reservation)
- **09 用語集** — 3 件新規:Normalize PKC links / Safe candidate / Stale candidate
- **00 index** — 最近の UX 改善に "PKC リンクの一括正規化" bullet 追加
- **PKC2-Extensions/pkc2-manual.html** — rebuild 済み(sample container 内にも新節が反映)

---

## Compatibility

- **container schema は変更なし**(`schema: 1` のまま)
- v2.1.0 で作成した container / export は **そのまま v2.1.1 で開ける**
- v2.1.1 で Apply したエントリには revision が追加されるだけで、container shape は従来どおり。v2.1.0 で開いても新 revision は `container.revisions[]` に普通に含まれる(`bulk_id` は v2.1.0 の revision schema で既に optional フィールドなので後方互換)
- 既存 body に残った legacy 形式(空 label / `#<logId>` / 同 container `pkc://...` 等)は **renderer の互換処理で壊れずに読める** ことは変わらず、正本化は **user が Tools → Normalize PKC links → Apply all safe を押したときだけ** 実行される

---

## Known limitations(v2.1.1)

**誠実に書いておきます**:

- **Per-candidate checkbox selection 未実装** — v1 Apply は "all safe" のみ。個別に選択できる UI は follow-up(Slice 3.5 or v2.2)
- **Clickable-image renderer support 未実装** — `[![alt](url)](url)` は future dialect reservation。`SAFE_URL_RE` / asset-resolver の拡張とセットで migration v2 として扱う
- **Card / embed presentation 未実装** — `@[card](entry:<lid>)` / transclusion 強化は spec 予約のみ
- **Color tag は theme / a11y 検証ツール未対応** — palette fixed list(Slice 1)、Saved Search additive `color_filter` schema(Slice 2)、Entry schema + picker UI + sidebar 色バー(Slice 3)、`color:<id>` query parser + filter axis + Saved Search round-trip(Slice 4)が 2026-04-25 までに着地。**残るのは theme HEX の per-container override と CVD(色覚多様性)pairwise simulation tooling のみ**(将来 slice で再評価)
- **Cross-container resolver / P2P 未実装** — `pkc://<other>/...` や cross-container External Permalink を別 container 自動ロードする機構はない(手動で該当 container の PKC を開き直す必要あり)
- **OS protocol handler 未実装** — `pkc://` を OS に登録してクリックだけで PKC を起動する機構は外部ツール連携になるため v2.1 には含まない
- **External Permalink body residue rendering 未実装** — body 内に直接 `<base>#pkc?...` を手入力 / import した場合の内部 navigate fallback は v1 対象外(外部クリックの受信側は既存 External Permalink receive で対応済み)
- **Full container footprint 未実装** — Storage Profile は asset bytes のみを扱い、body / relations / revisions を含めた total 計測は未対応

---

## Migration 注意

- v2.1.0 で作成した container / export は **そのまま v2.1.1 で開ける**。アップグレード操作は不要
- v2.1.0 で本文に書き残した legacy 形式を "一括で正本化したい" 場合、v2.1.1 で Shell menu → Tools → `🔧 Normalize PKC links` → `Apply all safe` を実行してください
- Apply で書き換わったエントリには revision が追加されますが、**元の body は revision restore で完全に戻せます**。`bulk_id` が付いているので、どの Apply 操作の影響かは追跡可能
- v2.1.1 で Apply した container を v2.1.0 で開いても、container shape / schema は互換(新 revision は `revisions[]` に含まれ、`bulk_id` フィールドは v2.1.0 の optional 定義で読まれる)

---

## 参照 docs

- **Link migration tool spec**: `docs/spec/link-migration-tool-v1.md`
- **Clickable-image renderer audit**: `docs/development/clickable-image-renderer-audit.md`
- **Link system audit(2026-04-24)**: `docs/development/link-system-audit-2026-04-24.md`
- **Link spec(PKC Link Unification)**: `docs/spec/pkc-link-unification-v0.md`
- **Versioning policy**: `docs/development/versioning-policy.md`
- **v2.1.0 CHANGELOG**: `docs/release/CHANGELOG_v2.1.0.md`
- **Dev INDEX**: `docs/development/INDEX.md`(#156-#161 が本 release の対象範囲)

---

## 次 release に向けて(non-binding)

- **v2.1.2 / v2.1.x(patch)**: Per-candidate checkbox selection / External Permalink fragment scroll など、UX 細部の追加
- **v2.2.0(minor)**: Clickable-image renderer support + migration v2 / Card / Embed 本体 / Color tag UI / Cross-container resolver 初期設計 のうちまとまった wave が着地したら
- **v3.0.0(major)**: Container schema breaking change が必要になった場合のみ

Versioning policy は `docs/development/versioning-policy.md` を参照。
