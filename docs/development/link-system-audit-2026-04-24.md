# Link System Audit — 2026-04-24

## 1. Purpose

W1 Tag wave クローズ後に連続して追加された Link system(#138 / #141 / #142 / #143 / #144 / #145 / #146 / #147 / #148)の **現在地棚卸し**。

本 doc は **実装ではなく整理**。目的:

1. Copy / Paste / Render / Receive の各 surface がどの形式(External Permalink / Portable PKC Reference / Internal Reference)を扱っているか表で可視化する
2. 通常ユーザー向け Copy 導線を **1 本化する正本方針** を確定する
3. Internal Markdown Dialect(link / card / embed)の正本を spec §5.5 の TODO として残っていた箇所に固定する
4. Legacy body / Existing entries の **migration policy** を固定する
5. 次の実装 PR 順序を確定する

コード変更ゼロ、docs-only。

## 2. 現在地サマリ(1 行表)

| surface | 形式 | 正本性 | 備考 |
|---|---|---|---|
| Entry meta pane `🔗 Copy link` | **External Permalink** | ✅ 正本 | #142 で追加、#144 で訂正 |
| Attachment action row `🔗 Copy link` | **External Permalink** | ✅ 正本 | #142 で追加、#144 で訂正、legacy inline は非表示 |
| TEXTLOG log External Permalink copy | — | ❌ **未実装** | 現状 `copy-log-line-ref` のみ |
| context menu `copy-entry-ref` | Internal Reference `[title](entry:lid)` | ⚠️ legacy 扱い予定 | #146 以降も挙動不変で残存 |
| context menu `copy-asset-ref` | Internal Reference `[name](asset:key)` or `![name](asset:key)` | ⚠️ legacy 扱い予定 | 同上 |
| context menu `copy-log-line-ref` | Internal Reference `[label](entry:lid#<logId>)` | ⚠️ **legacy fragment 形** | canonical は `#log/<logId>`、本 doc で扱いを決める |
| context menu `copy-entry-embed-ref` | Internal Reference `![title](entry:lid)` | ⚠️ legacy 扱い予定 | spec §6.2 embed とは記法整合 |
| Paste(External Permalink) | 同 container → `[Title](entry:lid)` | ✅ 正本 | #145 / #147 で label 合成 |
| Paste(Portable Reference) | 同 container → `[Title](entry:lid)` | ✅ 正本 | 同上 |
| Paste(legacy `entry:` / `asset:`) | pass-through | ✅ 維持 | writer 意図尊重 |
| Render `entry:<lid>` | navigate-entry-ref routing | ✅ 正本 | 既存 |
| Render `asset:<key>` | image embed / chip | ✅ 維持 | 既存 |
| Render same-container `pkc://<self>/entry/...` | internal-like navigate-entry-ref | ✅ 正本 | #146 |
| Render same-container `pkc://<self>/asset/...` | 通常 anchor | ❌ **TODO 残置** | #146 で明示的に future slice |
| Render cross-container `pkc://<other>/...` | portable-reference-placeholder badge | ✅ 正本 | #144 |
| Receive `<base>#pkc?container=<cid>&entry=<lid>` | SELECT_ENTRY + reveal | ✅ 正本 | #145 |
| Receive `<base>#pkc?container=<cid>&asset=<key>` | 所有 attachment へ遷移 | ✅ 正本 | 同上 |
| URI scheme non-interference | Office / obsidian / vscode / mailto / tel | ✅ 正本 | #144 で 12 ケース網羅 |

✅ = post-correction 正本 / ⚠️ = legacy 扱い予定 / ❌ = 未実装 or TODO 残置

## 3. Copy surface 詳細

`src/adapter/ui/action-binder.ts` 内の `copy-*` ハンドラ全 9 件を洗った結果:

### 3.1 link 系 copy(6 件)

| action | 出力形式 | source | 通常ユーザー可視度 |
|---|---|---|---|
| `copy-entry-permalink` | `<base>#pkc?container=<cid>&entry=<lid>` | Entry meta pane の `🔗 Copy link` ボタン | **高(正本)** |
| `copy-asset-permalink` | `<base>#pkc?container=<cid>&asset=<key>` | Attachment action row の `🔗 Copy link` ボタン | **高(正本)** |
| `copy-entry-ref` | `[title](entry:<lid>)` | context menu 🔗 Entry ref | 中(legacy) |
| `copy-asset-ref` | `[name](asset:<key>)` or `![name](asset:<key>)`(画像) | context menu 📎 Asset ref | 中(legacy) |
| `copy-entry-embed-ref` | `![title](entry:<lid>)` | context menu 🖼️ Embed ref | 中(legacy) |
| `copy-log-line-ref` | `[title › timestamp](entry:<lid>#<logId>)` | context menu 📝 Log ref(TEXTLOG 行) | 中(legacy + **fragment 形ずれ**) |

### 3.2 非 link copy(3 件、参考)

| action | 出力 | 注記 |
|---|---|---|
| `copy-markdown-source` | 本文 markdown | 本 audit 対象外 |
| `copy-rich-markdown` | 本文 + HTML(rich clipboard) | 同 |
| `copy-provenance-metadata` | relation metadata JSON | 同 |

### 3.3 見つかった不整合

**a) `copy-log-line-ref` の fragment 形が legacy**
- 出力: `entry:<lid>#<logId>`(legacy、`log/` プレフィックスなし)
- spec §5.1 canonical: `entry:<lid>#log/<logId>`
- 既存 `entry-ref.ts` parser は両方 accept(legacy kind を返す)ため実害はないが、**新規 copy で legacy 形を emit している** のは整合性上の負債

**b) TEXTLOG log の External Permalink copy 未実装**
- `<base>#pkc?container=<cid>&entry=<lid>&fragment=log/<logId>` を emit する導線が **無い**
- External Permalink receive 側は `fragment=log/<logId>` を parse しているので受信準備だけはできている

**c) Internal Reference copy を通常ユーザー導線に残す是非**
- 現状 context menu に 4 件(entry-ref / asset-ref / entry-embed-ref / log-line-ref)
- 「外部アプリでの共有が目的」のユーザーには混乱要因(`entry:` 形は外部では開けない)
- 「PKC 内で markdown を手書きする」ユーザーには価値がある
- → legacy / advanced 扱いにする方針を §6 で固定する

## 4. Paste conversion の現在地

`src/features/link/paste-conversion.ts` + `src/adapter/ui/link-paste-handler.ts`。

### 4.1 受理する形

| 入力 | 判定 | 同 container 時の出力 | cross-container 時 |
|---|---|---|---|
| `pkc://<cid>/entry/<lid>[#<frag>]` | Portable Reference | `[Entry Title](entry:<lid>[#<frag>])` | 原文維持 |
| `pkc://<cid>/asset/<key>` | Portable Reference | `[Asset Name](asset:<key>)` | 原文維持 |
| `<base>#pkc?container=<cid>&entry=<lid>[&fragment=<frag>]` | External Permalink | 同上 | 原文維持 |
| `<base>#pkc?container=<cid>&asset=<key>` | External Permalink | 同上 | 原文維持 |
| `entry:<lid>` / `asset:<key>` | Internal Reference pass-through | 原文維持(wrap しない) | n/a |
| `https://...` / `file://...`(`#pkc?` なし) | ordinary URL | 横取りしない | n/a |
| `mailto:` / `ms-word:` / `obsidian://` / `vscode://` | 既存 URI scheme | 横取りしない | n/a |

### 4.2 Label synthesis 現状

- #147 で `resolveLabel(target, entries)` 追加
- entry → `entry.title`(空 / 不在は `(untitled)`)
- asset → `attachment.body.name`(空 / 不在は `(untitled)`)
- `]` / `[` / `\` は `escapeMarkdownLabel` で escape
- **空 label `[](entry:lid)` は paste 経路から排除済み**

### 4.3 見つかった不整合

- **なし**(#144 / #145 / #147 で揃った)

## 5. Render / fallback の現在地

`src/features/markdown/markdown-render.ts` の `link_open` rule。

### 5.1 Render matrix

| href | 描画 | data 属性 |
|---|---|---|
| `entry:<lid>[#<frag>]` | 通常 anchor + navigate-entry-ref routing | `data-pkc-action="navigate-entry-ref"` / `data-pkc-entry-ref="entry:<lid>[#<frag>]"` |
| `asset:<key>`(link form) | 通常 anchor(非 image) | — |
| `asset:<key>`(`![](asset:...)` embed) | 画像 embed / 非 image chip | `resolveAssetReferences` 経由 |
| `pkc://<self>/entry/<lid>[#<frag>]` | 通常 anchor + navigate-entry-ref routing(#146) | `data-pkc-action="navigate-entry-ref"` / `data-pkc-entry-ref="entry:<lid>[#<frag>]"` |
| `pkc://<self>/asset/<key>` | **通常 anchor のみ(TODO)** | — |
| `pkc://<other>/...` | external PKC placeholder badge(🌐) | `class="pkc-portable-reference-placeholder"` + `data-pkc-portable-{container,kind,target,fragment}` |
| `pkc://<malformed>` | 通常 external URL(`target="_blank"`) | — |
| `https://` / `http://` | 通常 external URL(`target="_blank"` + `rel="noopener noreferrer"`) | — |
| `mailto:` / `tel:` / `ftp:` | 通常 anchor(SAFE_URL_RE 許可) | — |
| `ms-word:` etc. | 通常 anchor(SAFE_OFFICE_URI_RE 許可) | — |
| `#section1` など普通の fragment | 通常 anchor | — |

### 5.2 見つかった不整合

- **`pkc://<self>/asset/<key>` の内部 fallback 未実装**(#146 で意図的に残した TODO)
- それ以外は整合

## 6. Receive の現在地

`src/adapter/ui/external-permalink-receive.ts`(#145)。

### 6.1 挙動

| URL | 結果 |
|---|---|
| `<base>#pkc?container=<self>&entry=<lid>` | `SELECT_ENTRY{lid, revealInSidebar:true}` |
| `<base>#pkc?container=<self>&entry=<lid>&fragment=<frag>` | 同上(lid のみ使用、fragment は parser が捕捉するが navigation には今のところ未反映) |
| `<base>#pkc?container=<self>&asset=<key>` | 所有 attachment へ `SELECT_ENTRY` |
| `<base>#pkc?container=<other>&...` | no-op + info toast |
| `<base>#pkc?container=<self>&entry=ghost` | no-op + info toast |
| `<base>#pkc?garbage` | silent no-op(malformed) |
| `<base>#section1` / hash なし | 完全無干渉 |

### 6.2 見つかった不整合

- **`fragment=log/<logId>` の scroll 反映が未実装**(parser は値を持つが、SELECT_ENTRY 後に log 行まで scroll する経路がまだ繋がっていない)
- Priority: Copy 側(§3.3 b)が先。Copy で log External Permalink が emit されなければ receive の fragment 処理もテストしようがない

## 7. Gap list(優先度付き)

| # | gap | 影響 | 優先度 |
|---|---|---|---|
| G1 | TEXTLOG log の External Permalink copy 未実装 | 外部共有で log 行を指せない | **高** |
| G2 | `copy-log-line-ref` が legacy fragment 形を新規 emit | ref の一貫性欠如 | 中 |
| G3 | `pkc://<self>/asset/<key>` の内部 fallback rendering 未実装 | body に残った asset permalink がクリックで資産にいけない | 中 |
| G4 | Receive の `fragment=log/<logId>` が scroll 反映されない | log 行指定 External Permalink が機能半分 | 中(G1 着地後) |
| G5 | Legacy body(旧 `pkc://...` / 空 label link 等)の migration 方針が spec に無い | ユーザーが古い body をどう扱うかが不明 | **高** |
| G6 | Copy surface が 2 系統混在(External Permalink + Internal Reference context menu) | ユーザーが「どれを使えばいいか」迷う | 中(正本方針を spec で固定すれば緩和) |
| G7 | 新規 body に `[](entry:...)` 空 label を emit する経路が、旧 `copy-entry-ref` / `copy-asset-ref` / `copy-log-line-ref` 経由で **残っている可能性**(手動編集 / legacy paste path) | 不可視 anchor が再発しうる | 低(実際の経路は paste 系で塞いだが、copy 経由 → 手動削除は起きうる) |

## 8. 正本方針: Copy surface の 1 本化

### 8.1 通常ユーザー向け導線

**唯一の正本 = External Permalink**:
- Entry meta pane `🔗 Copy link` → `<base>#pkc?container=<cid>&entry=<lid>`
- Attachment action row `🔗 Copy link` → `<base>#pkc?container=<cid>&asset=<key>`
- TEXTLOG log(新規追加予定、G1) → `<base>#pkc?container=<cid>&entry=<lid>&fragment=log/<logId>`

理由:
- 外部アプリ(Loop / Office / mail)で開ける唯一の形
- 受け手側が別 PKC でも paste 時に自動で internal 化される(`paste-conversion.ts`)
- Link system の受信側(#145)を完全に活かせる

### 8.2 Internal Reference copy の扱い

**legacy / advanced 用途として context menu に残す**:
- `copy-entry-ref` / `copy-asset-ref` / `copy-entry-embed-ref` / `copy-log-line-ref`
- UI 位置は context menu 内に限定、meta pane / action row からは出さない
- 通常ユーザー向けドキュメント(manual)では "高度な使い方" セクションにのみ言及
- 既存挙動は削除しない(互換性維持)

理由:
- PKC 内で markdown を手書きするパワーユーザーには依然有用
- 既存コードと既存 body を壊さない
- UI 上の可視度を下げるだけでも混乱は大幅に減る

### 8.3 禁止

- **新規に `[](entry:<lid>)` を生成しない**(empty label)
- **新規に `[](asset:<key>)` を生成しない**(empty label)
- **新規に body へ `pkc://...` を書き出さない**(paste 側で自動降格済み、copy 側も External Permalink に統一)
- **`[card:<lid>]` 記法は採用しない**(spec §10.1 既決)

## 9. 正本方針: Internal Markdown Dialect

Body 内で PKC 専用 target を指す markdown の **正本記法** を 1 表で固定する:

### 9.1 Target(内側形、body に書かれる)

| target | 意味 |
|---|---|
| `entry:<lid>` | 同 container の entry 全体 |
| `entry:<lid>#log/<logId>` | 同 container entry の log 行(canonical) |
| `entry:<lid>#day/<yyyy-mm-dd>` | 同 container entry の day section |
| `entry:<lid>#log/<logId>/<slug>` | 同 container log 行内の heading |
| `asset:<key>` | 同 container の asset |

### 9.2 Presentation(外側形、記法)

| presentation | 記法 | 用途 |
|---|---|---|
| **link** | `[Label](<target>)` | 通常リンク(必須 label) |
| **embed** | `![Alt](<target>)` | 画像 / transclusion |
| **card**(未実装) | `@[card](<target>)` | block preview(次 wave) |

### 9.3 Legacy / 読み込み互換(accept, emit しない)

| 形 | 扱い |
|---|---|
| `entry:<lid>#<logId>`(legacy fragment、`log/` なし) | parser accept、**新規 emit しない** |
| `[](entry:<lid>)` 空 label | renderer は従来どおり描画、**新規 emit しない**(#147 で paste 側対策済み) |
| `pkc://<self>/entry/<lid>` body 内残存 | renderer が same-container fallback(#146)で navigate-entry-ref に合流、**新規 emit しない** |
| `pkc://<other>/...` body 内残存 | portable-reference-placeholder で描画、**新規 emit しない** |
| `![](asset:<key>)` legacy embed form | accept / emit 両方 OK(現行 asset image 経路と一致) |

### 9.4 Card / Embed の予約(次 wave)

- `@[card](entry:<lid>)` → block preview card
- `[![]](entry:<lid>)` のような "embed 強調" 形は本 audit では採用しない(既存 `![alt](entry:...)` transclusion が既に存在し、記法衝突を避ける)
- 詳細は次 wave の card-embed spec で確定

## 10. Migration policy(Normalize PKC links)

### 10.1 基本方針

- **自動一括 rewrite はしない**
- **user opt-in の explicit tool 経由でのみ実行**
- **preview 必須 → 確認 → 適用** の 3 段階
- ordinary URL / Office URI scheme / 関係ない markdown は一切触らない

### 10.2 変換候補(例)

Tool が検出して candidate として提示する対象:

| 検出対象 | 変換案 |
|---|---|
| `[](entry:<lid>)` 空 label | `[Entry Title](entry:<lid>)` |
| `[](asset:<key>)` 空 label | `[Asset Name](asset:<key>)` |
| `pkc://<self>/entry/<lid>[#<frag>]` body 内残存 | `[Entry Title](entry:<lid>[#<frag>])` |
| `pkc://<self>/asset/<key>` body 内残存 | `[Asset Name](asset:<key>)` |
| `entry:<lid>#<logId>` legacy fragment | `entry:<lid>#log/<logId>` |

### 10.3 触らない対象

- `pkc://<other>/...`(cross-container、解決不能)
- `https://` / `http://` / `file://`(`#pkc?` 含まないもの)
- `mailto:` / `tel:` / `ftp:`
- Office URI scheme(`ms-word:` / `ms-excel:` / `onenote:` / 他)
- `obsidian:` / `vscode:` / その他未知 scheme
- `[label](entry:<lid>)` の **空でない label**(ユーザー意図を優先)

### 10.4 実装形態(docs-first、実装は別 PR)

- Entry 一覧を scan、candidate を detail pane に表示
- candidate 単位で accept / skip 可能
- 一括 apply / 選択的 apply を切替可能
- apply 時は **新 revision を作って記録**(既存 revision 機構で undo 可能)
- 実装 / リリースは後続 PR(本 audit は方針のみ)

## 11. URI scheme non-interference(確定)

PKC 専用処理は **以下に限定**:

```
entry:
asset:
pkc://
<base>#pkc?
[label](entry:/asset:/pkc://)
![alt](entry:/asset:)
@[card](entry:/asset:/pkc://)   ← 次 wave
```

**絶対に横取りしない**:

```
https:
http:
file:
mailto:
tel:
ftp:
ms-word:
ms-excel:
ms-powerpoint:
ms-visio:
ms-access:
ms-project:
ms-publisher:
ms-officeapp:
ms-spd:
ms-infopath:
onenote:
obsidian:
vscode:
web+*:
その他未知の syntactically valid URI scheme
```

Verify 済み:
- `src/features/link/paste-conversion.ts` — 12 ケーステスト `URI scheme non-interference`(#144)
- `src/features/markdown/markdown-render.ts` — `SAFE_URL_RE` + `SAFE_OFFICE_URI_RE` allowlist 維持

## 12. 次 PR の順序案

現在地 + gap list + 正本方針をふまえ、以下の順序を推奨:

### Phase 1(Link 正本化)

1. **Copy surface unification — spec correction**(本 PR)
   - 本 audit doc + spec §5.5 / §7 / §11 / §12 の surgical update
   - Internal Markdown Dialect(§9)を spec に固定
   - Migration policy(§10)を spec に追加
   - docs-only

2. **TEXTLOG log External Permalink copy 実装**(次 PR)
   - G1 を埋める
   - TEXTLOG log 行に `🔗 Copy link` ボタン追加 or context menu に新 action
   - 形式: `<base>#pkc?container=<cid>&entry=<lid>&fragment=log/<logId>`
   - canonical fragment 形を使う(G2 も同時に解消)
   - 既存 `copy-log-line-ref`(legacy internal form)は保持 — 並存

3. **Paste conversion log-label support 拡張**(次 PR、2 と並行可)
   - External Permalink の `fragment=log/<logId>` に対する paste で `[Log Label](entry:<lid>#log/<logId>)` を emit
   - label は log 行の timestamp + title 合成(`copy-log-line-ref` の format に寄せる)

4. **pkc://<self>/asset/<key> の内部 fallback rendering**(次 PR)
   - G3 を埋める
   - action-binder に `navigate-asset-ref` または `navigate-entry-ref` の asset 拡張
   - same-container asset placeholder と同形の renderer 対応

### Phase 2(Migration)

5. **Link migration tool design**(docs-first)
   - §10 を docs/spec/link-migration-tool-v1.md として独立 spec 化
   - UI モック / action naming / revision 連携 / candidate grammar

6. **Link migration tool implementation**
   - docs-first spec 着地後に実装
   - preview + user-opt-in で §10.2 の各 pattern を順次対応

### Phase 3(可視化)

7. **Version / Changelog / About v2.1.0**
   - Phase 1 / Phase 2 設計が固まった時点でまとめてリリース
   - `2.1.0` に上げる正当性がここで揃う

### Phase 4(次 wave)

8. **Card / Embed implementation**
   - Phase 1-3 完了後
   - §9.4 の予約記法に沿って実装
   - 必要なら card-embed spec v1 として別 doc

### 順序の根拠

- **Copy surface 1 本化 → Paste label 完成 → Render fallback 完成 → Migration** が 正本を「新規生成」で寄せてから「既存 body」を寄せる順序
- Version / Changelog は Link 正本が固まってから出さないと嘘になる
- Card / Embed は Link 正本の上に積む機能なので最後

## 13. 今回あえて実装しなかった項目

- 本 PR は docs-only
- コード変更ゼロ
- テスト追加ゼロ
- bundle 再ビルドのみ(INDEX 更新に伴う docs 変更の release re-stamp)
- 既存挙動は完全に維持
- 既存 copy action / paste / render / receive すべて無改変
