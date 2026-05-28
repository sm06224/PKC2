# PKC2 v3.x line 統合 master(2026-05-24、pgc-177)

**Status**:design master(docs-only、後続実装 wave は本書から派生)
**Created**:2026-05-24(user direction「**全てを統合して、既存機能とも統合していって欲しい、痛みを伴う統廃合ですが、データ互換性自体は維持して欲しい**」)
**Parent doc**:`vscode-grade-overhaul-2026-05/MASTER.md`(UI/UX 観点の全面刷新 master)、本書は **feature integration** 観点の master
**Scope**:`roadmap` + `USER_REQUEST_LEDGER §3` + `INDEX LIVE Active specs` + handoff backlog の **100+ 未実装 / deferred / candidate 機能を 1 つの統合 architecture** に束ねる。**既存機能の統廃合(rip out / merge / rename)も範囲内**。**data 型(`Container` / `Entry` / `Relation` / `Revision` / `assets`)は不変**(invariant I1)。
**Audience**:Claude(継続開発者)+ PKC2 中級〜玄人 user。本書を起点に各 unification wave を派生 sub-doc で実装する。

---

## §0 motivation / 本書の役割

user direction(2026-05-24):

> 「全てを統合して、既存機能とも統合していって欲しい、痛みを伴う統廃合
>  ですが、データ互換性自体は維持して欲しい」

このうち重要な 4 軸:

1. **全てを統合** ── 100+ 未実装機能を個別 PR でばらばらに加えるのではなく、**統合 architecture** にまとめる
2. **既存機能とも統合** ── 新機能を既存と分離せず、unify する(関連機能の機能 overlap / 設計ズレを解消)
3. **痛みを伴う統廃合** ── 古い / 重複 / 役目を終えた既存 mechanism は **rip out / merge / rename** 許容
4. **データ互換性は維持** ── `Container` / `Entry` / `Relation` / `Revision` / `assets` の data 型 + `SCHEMA_VERSION = 1` + export HTML 互換は **絶対死守**(invariant I1)

`MASTER.md` が UI/UX 軸の全面刷新 master だったのに対し、本書は **feature integration** 軸 ── 100+ 機能候補がどう束ねられて、何が廃止され、何が残るかの canonical map。

---

## §1 100+ 未実装機能の棚卸し(2026-05-24 grep 結果)

### §1.1 出典別 件数

| 出典 | 件数 |
|---|---|
| `feature-requests-2026-04-28-roadmap.md` 領域 1〜10 の未完項目 | ~30 件 |
| `USER_REQUEST_LEDGER.md` §3 deferred(unique) | 24 件 |
| `INDEX LIVE Active specs` | ~15 件 |
| handoff §3 backlog(2026-05-24-cont) | ~10 件 |
| MASTER.md / v3 提案 8 案 / Phase β 4 spec | ~10 件 |
| **合計(重複除去後ユニーク)** | **~80 件** |

100 件は重複込み。ユニーク ~80 件を以下 10 group に統合する。

### §1.2 機能 group 化(統合 architecture の最上位)

| Group | 範囲 | 含む候補 |
|---|---|---|
| **G1 編集 surface 統一** | text editor + textlog append + todo description + form fields の編集 UX を 1 経路に | 領域 4(indent/brackets/list)+ 領域 5(編集 cmd)+ wave-δ phase 2 text(multi-cursor/minimap/outline/folding)+ Phase β Group C(format panel ワープロ化)+ Phase β Group A(編集 mode 3 分割) |
| **G2 ナビゲーション統一** | 履歴 / 検索 / Quick Open / breadcrumb / Tab system を 1 model に | 領域 1(履歴 Alt+←/→)+ 領域 5(command palette / Quick Open)+ wave-γ Tab system(pgc-85)+ wave-γ §6.5 workspace tab 統合 + MASTER §4.2 §4.3 §4.5 |
| **G3 archetype 統合** | text / textlog / todo / form / folder / attachment + 新規(spreadsheet / composite / document-set / office)を 1 archetype model に | C-4 spreadsheet + C-5 complex composite + C-6 document-set + C-7 office preview + C-P1 textlog redesign + handoff wave-δ phase 2 archetype |
| **G4 reference / link / fragment 統一** | `entry:<lid>` + `[[wikilink]]` + `entry:<lid>#log/<id>` + URL fragment(YouTube 時間 / PDF page / W3C text-fragment) を 1 IR に | C-3 link-index(完了)+ 領域 10-3 IR + `fragment-reference-ir-spec-2026-05.md` + `bookmarklet-snapshot-recipes-2026-05.md` + 領域 6 自己 doc ref |
| **G5 markdown 方言完結** | wave-10-2 Phase 1(L-1〜L-9 完了)+ Phase 2 残り 20+ 拡張 + IR + 6 surface parity | 領域 6 Phase 2(backmatter / glossary / track changes / 図表 caption / spreadsheet embed 等)+ `markdown-dialect-extensions-spec-2026-05.md` + `render-surface-parity-audit-2026-05.md`(Gap-1〜15)|
| **G6 inspector / hints / AI 統一** | Inspector 5 tab + Hints(Phase 1+2 完了 8 機能)+ Phase 3 LLM(将来)+ container-wide diagnostics | pgc-147〜166(本 session 着地)+ Phase 3 LLM 接続 + wave-γ §6.3 Inspector 各 tab 中身肉付け(Properties frontmatter 編集 inline / History revision diff)|
| **G7 multi-window / surface parity** | center / Viewer / editor 別窓 / monitor / Split View の 5 surface を canonical 1 renderer に | `multi-window-vscode-extension-spec-2026-05.md` + `render-surface-parity-audit-2026-05.md`(5 surface Gap)+ Phase β Group A §3 マルチウィンドウ + MASTER §5 |
| **G8 visual layer / theme / chrome 統一** | header / sidebar / Activity Bar / meta pane / format panel / view-mode tab / button category を unified visual に | wave-γ §6 全(header 削減 / sidebar tab strip / Inspector / format panel / view-mode)+ button-size-audit(pgc-169、step 1〜3-bis 着地)+ wave-δ slim chrome / header compact + 領域 7 iPhone action bar + MASTER §8 visual layer |
| **G9 collaboration / extension / sandbox** | PKC-Message + extension + sandbox + multi-workspace + WebRTC + bookmarklet 受入 | D-1〜D-4 vision + 領域 10-5 PKC-Message + 領域 10-7 アプリランチャー + 領域 10-8 sandbox + H-5 multi-workspace + H-9 P2P + `bookmarklet-snapshot-recipes-2026-05.md` |
| **G10 data 拡張 / migration** | revision branch + provenance + i18n + DOM diff + schema migration | C-1 revision branch + H-1 i18n + H-2 DOM diff + H-3 schema migration(spec 完了)+ H-8 TEXT→TEXTLOG provenance(spec 完了)|

各 group は **wave-α' 〜 wave-ε'**(本書 §6)で段階着地。group 内で「既存機能を rip out / merge」 する痛みを伴う統廃合を含む。

---

## §2 既存機能との統合 / 統廃合 map(group 別)

各 group で「**既存何を残し、何を統廃合し、何を新規**」 を表で固定。痛みを伴う統廃合(rip out 候補)は赤字で示す。

### §2.G1 編集 surface 統一

| 既存(現状) | 統廃合判断 | 統合後の姿 |
|---|---|---|
| `text` archetype の `<textarea>`(detail-presenter.ts) | **拡張**(multi-cursor / minimap / folding 拡張) | 統一編集 surface の主軸 |
| `textlog` archetype の append textarea | **保持** + **追加機能継承**(log search/importance pgc-155/157 を統一編集 surface のメソッドに) | 統一編集 surface の log-mode |
| `todo` description 編集(JSON 内) | **rip out 候補** ── inline subtask(pgc-150)を統一編集 surface の subtask-mode に統合、JSON 直編集 UI は廃止 | 統一編集 surface の todo-mode |
| `form` fields(name / note / checked) | **拡張** ── 構造化編集 surface(field 順序 DnD + conditional field) | 統一編集 surface の form-mode |
| `format-panel.ts`(選択追従 floating、scrap-and-build 対象) | **rip out**(Phase β Group C で scrap 確定) | desktop 固定 ribbon(`editor.format_panel_enabled`)に再構築 |
| `snippet-toolbar.ts`(iPhone 用) | **merge** ── format-panel の context-aware と統合 | 統一編集 surface の floating inline toolbar |
| `entry-window`(text の split editor) | **拡張** ── editor mode 3 分割(inline / split / window) | Phase β Group A の editor mode registry |

### §2.G2 ナビゲーション統一

| 既存 | 判断 | 統合後 |
|---|---|---|
| header back / forward(pgc-101)+ Alt+←/→(未実装) | **merge** ── 領域 1 着地で 1 model に | unified history nav |
| breadcrumb(pgc-101)+ Tab system(pgc-85) | **co-exist + merge UX** ── tab strip に breadcrumb 統合 | unified nav header |
| Command Palette(pgc-80) + Quick Open(pgc-81) + slash menu | **保持 + 統一 API** | 3 entry が同 registry 経由 |
| view-mode tabs(Detail / Calendar / Kanban / Filer / Graph / Launcher) | **rip out + rebuild** ── workspace-level tab を center tab strip に統合(§6.5 大改修) | tab strip 1 本に統合 |

### §2.G3 archetype 統合

| 既存 | 判断 | 統合後 |
|---|---|---|
| `text / textlog / todo / form / folder / attachment / generic / opaque / system-*` | **保持 + 拡張**(SCHEMA_VERSION 1 死守) | 既存 9 archetype 維持 |
| C-4 spreadsheet archetype 新規 | **新規 additive**(`spreadsheet`)| 新 ArchetypeId、CSV / XLSX 埋込 |
| C-5 composite archetype 新規 | **新規 additive**(`composite`)or **rip out 候補** ── 既存 transclusion + folder で代替可能か議論 | TBD(議論 OQ-U1)|
| C-6 document-set archetype 新規 | **rip out 候補** ── folder + structural relation + 章節項採番(領域 8 Layer 1)で代替可能か | TBD(議論 OQ-U2)|
| C-7 office preview(.docx / .xlsx / .pptx) | **attachment 拡張**(新 archetype 不要)| `attachment` の MIME ベース preview |

### §2.G4 reference / link / fragment 統一

| 既存 | 判断 | 統合後 |
|---|---|---|
| `entry:<lid>` markdown link(C-3 link-index 完了) | **保持** | 標準 |
| `[[wikilink]]`(部分実装、entry-ref autocomplete) | **保持 + 拡張** | 同等 |
| `entry:<lid>#log/<id>`(C-P1 textlog redesign) | **拡張完了対象** | unified fragment IR |
| URL fragment(YouTube `?t=` / PDF `#page=` / W3C `#:~:text=` / Amazon ASIN / 小説) | **新規 unified IR**(`fragment-reference-ir-spec-2026-05.md`) | 6 種 fragment を 1 IR |
| `bookmarklet snapshot`(`?pkc-snapshot=<base64>`) | **新規 attachment 受入** | 5 種 bookmarklet sample(完了 spec) |

### §2.G5 markdown 方言完結

| 既存 | 判断 | 統合後 |
|---|---|---|
| Phase 1 L-1〜L-9(完了、`markdown-dialect-extensions-spec-2026-05.md`)| **保持** | canonical |
| Phase 2 M-7 variables(完了) | **保持** | canonical |
| Phase 2 残り(backmatter / page layout / 用語定義 + glossary + index + lint / track changes / 簡易 block / 図表 caption / CSV cell 書式 / spreadsheet embed 等 20+) | **新規 additive** | wave-α'/β' で順次 |
| 5 surface(center / Viewer / Split View / editor 別窓 / monitor) | **rip out + rebuild** ── canonical renderer 1 本化(MASTER §5.1) | unified renderer + chrome layer |
| 6 wave(`render-surface-parity-audit-2026-05.md` Gap-1〜15) | **解消対象** | 全 surface で同 render |

### §2.G6 inspector / hints / AI 統一

| 既存 | 判断 | 統合後 |
|---|---|---|
| Inspector 5 tab(Properties / References / History / Style / Hints) | **保持 + 拡張**(各 tab 中身肉付け継続) | canonical |
| Hints 8 機能(本 session 着地、pgc-147〜165) | **保持** | local lint canonical |
| Phase 3 LLM 接続(opt-in API、roadmap §3) | **新規 additive、opt-in flag gate** | API key UI + outbound policy |
| flag inventory(pgc-167、32 flag、always-on 11 推奨) | **段階的 cleanup** ── user 同意後 default ON → flag 削除 | コード簡素化 |

### §2.G7 multi-window / surface parity

| 既存 | 判断 | 統合後 |
|---|---|---|
| center pane(canonical S1) | **保持** | 基準 |
| Viewer popup(独立 inline CSS、Gap-1〜13) | **rip out + rebuild** ── canonical renderer 共有 | unified |
| editor 別窓(Gap-1〜15) | **rip out + rebuild** | unified |
| monitor 別窓(TOC only)| **拡張** ── 多 panel(outline / recent / search / calendar / relations / activity / pinned) | plugin-style panel registry |
| Split View(pgc-89) | **保持 + 拡張** ── sourceLineAnchors path も unified renderer 経由 | unified |
| postMessage 4 新 type(window roles / layout persist / 競合 diff)| **保持** | canonical |

### §2.G8 visual layer / theme / chrome 統一

| 既存 | 判断 | 統合後 |
|---|---|---|
| `pkc-button-*` family + `pkc-header-nav-*` + `pkc-view-mode-btn` + `pkc-meta-inspector-tab` + `pkc-activity-bar-btn` 等 20+ button class | **rip out inline override + unified inherit** ── button-size-audit(pgc-169)の step 6(.pkc-btn 統一)で `pkc-button-base` + 6 size category 完全採用 | 1 base + 6 category + variant override |
| header / sidebar / Activity Bar / meta pane / format panel / view-mode tab | **wave-γ 全 step 完遂** | unified shell |
| theme(Light / Dark / System / CRT scanline / accent color / preferred-font) | **保持 + 拡張**(preset、JSON theme、reduce motion) | unified theme registry |
| 領域 9 CSS architecture(token 化 完了、Phase 4 deferred) | **保持 + Phase 4 user trigger 待ち** | 24 token 軸 |

### §2.G9 collaboration / extension / sandbox

| 既存 | 判断 | 統合後 |
|---|---|---|
| 既存 message system(simple postMessage) | **拡張 → PKC-Message v2** | unified protocol |
| 領域 10-5 PKC-Message + extension | **新規 additive、I3 single HTML 死守** | 外部 ext + receive bookmarklet |
| 領域 10-7 アプリランチャー(pgc 該当 view 完了) | **保持 + 拡張** | unified launcher |
| 領域 10-8 sandbox / multi-window controller | **新規** | unified controller |
| H-9 P2P / WebRTC(D-3) | **vision のまま** ── user direction 明示まで非着手 | TBD |

### §2.G10 data 拡張 / migration

| 既存 | 判断 | 統合後 |
|---|---|---|
| `SCHEMA_VERSION = 1`(死守) | **保持** | I2 |
| `Container` / `Entry` / `Relation` / `Revision` / `assets` 型 | **保持** | I1 |
| C-1 revision branch(`prev_rid` 完了、UI 未着手) | **拡張 UI** | branch tree viewer |
| H-1 i18n | **新規 + 既存 ja 文言を ja-JP locale に整理** | unified locale |
| H-2 DOM diff renderer(`entry 1000+ 痛み 待ち`)| **vision のまま** | TBD |

---

## §3 invariants(全 wave で死守)

`MASTER.md §0.3` の I1〜I7 を継承 + 本書で追加:

| # | invariant | 理由 |
|---|---|---|
| I1 | `Container` / `Entry` / `Relation` / `Revision` / `assets` 不変 | 既存 user データ + bookmarklet / export HTML 互換 |
| I2 | `SCHEMA_VERSION = 1` 維持 | I1 の必然 |
| I3 | export HTML 単一 artifact 維持 | PKC2 の核 |
| I4 | core / features 層は browser API 非依存 pure | wasm 経路で再利用可能 |
| I5 | main = 唯一の dispatcher / IDB writer | multi-window で死守 |
| I6 | Tier 0 flag で gate、default OFF で出荷 | 段階 rollout、急進破壊回避 |
| I7 | main 着地禁止(本書全期間 hold)| user 品質判断まで stack |
| **I8** | **既存 export HTML(rehydrate)で v2.3.0〜v3.x 全期間 round-trip 可能** | data 互換性死守の strongest contract |
| **I9** | **統廃合で削除した既存 class / region attr / action id は、削除 commit に migration note を残す**(import 時 fallback) | 既存 saved state / URL flag 等の forward compat |

---

## §4 統廃合 candidates(rip out / merge、痛みを伴う)

### §4.1 rip out(完全廃止)

- `format-panel.ts`(選択追従 floating、Phase β Group C で scrap 確定)
- 旧 sidebar tree mode(γ-A4 で完全 removal、`shell.sidebar_mode_default` flag 撤去)
- view-mode tabs の standalone(`pkc-view-mode-bar`)── center tab strip に統合
- 旧 Inspector AI tab 名称(pgc-166 で Hints に rename 済、後続で AI naming は Phase 3 LLM 接続時のみ復活)

### §4.2 merge(別 module / class に吸収)

- `snippet-toolbar.ts` + `format-panel.ts` → 統一編集 surface の inline toolbar
- 既存 19 個 unique button class → `pkc-button-base` + 6 size category(button-size-audit 完遂)
- 5 surface 独立 renderer → canonical 1 renderer + chrome layer 分離

### §4.3 rename(naming integrity)

- Inspector AI tab → Hints tab(pgc-166 完了、Phase 3 LLM で復活余地)
- view-mode tabs → workspace tabs(範囲限定の workspace 操作と区別)
- meta pane → Inspector pane(MASTER §6.3 既定)

---

## §5 段階的 implementation plan(wave-α' 〜 wave-ε')

`MASTER.md §9` の 5 wave 計画と直交(本書は **feature integration** 軸、MASTER は **UI/UX** 軸):

| wave | 名称 | scope | 規模 |
|---|---|---|---|
| **α'** | foundation merge | G2 ナビ統一(履歴 Alt+←/→ + Quick Open / Command Palette refactor)+ G8 button audit 残 step 4/6 + G6 Inspector 各 tab 中身肉付け | 15-20 PR |
| **β'** | editor surface unify | G1 統一編集 surface(text / textlog / todo / form の編集 UX を 1 経路に)+ G5 markdown Phase 2 残 + G4 fragment IR | 25-30 PR |
| **γ'** | archetype + reference unify | G3 archetype 統合(spreadsheet / composite / document-set / office)+ G4 link IR 完成 | 20-25 PR |
| **δ'** | multi-window + surface parity | G7 unified renderer + multi-window + monitor 多 panel + bookmarklet 受入 | 20-25 PR |
| **ε'** | collaboration + canvas | G9 PKC-Message v2 + extension + sandbox + multi-workspace + canvas+wasm 前駆 | 25-30 PR |

合計 **~120 PR**、user 品質判断まで stack 継続(I7)。

各 wave 内では sub-doc を起こす(`wave-alpha-prime-foundation-merge.md` 等)、本書は index 兼。

---

## §6 OQ(user 議論待ち、本書合意時に確定)

| # | 内容 |
|---|---|
| OQ-U1 | C-5 composite archetype を **新規 archetype** or **既存 transclusion + folder で代替** か |
| OQ-U2 | C-6 document-set archetype を **新規** or **folder + 章節項採番(領域 8 Layer 1)で代替** か |
| OQ-U3 | C-7 office preview を `attachment` 拡張で十分 vs 新 archetype 必要 |
| OQ-U4 | `format-panel.ts` rip out 時期 ── Phase β Group C scrap-and-build と整合 |
| OQ-U5 | i18n(H-1)を Phase α' に入れるか、ε' に後送りするか |
| OQ-U6 | DOM diff renderer(H-2)の痛み発生 timing は 「entry 1000+」 ── 現状 ~数十件で問題なし、deferred 継続? |
| OQ-U7 | flag always-on 化 batch(pgc-167 推奨 11 件)の同意取得手順 ── 一括 OR 段階 |
| OQ-U8 | C-P1 textlog redesign(Stage 2 asc/desc / Stage 3 Loop drag-to-reorder)の着手 timing |
| OQ-U9 | G7 unified renderer の build / runtime architecture(`detail-presenter.ts` を main / sub document に共有する design)|
| OQ-U10 | I8(rehydrate forward compat)の test strategy ── 各 wave に rehydrate regression test を必須追加するか |

---

## §7 関連 doc(本書が継承 / 包含)

- [`vscode-grade-overhaul-2026-05/MASTER.md`](./vscode-grade-overhaul-2026-05/MASTER.md):UI/UX 軸の全面刷新 master、本書の sibling
- [`pkc2-vision-modern-emacs-2026-05.md`](./pkc2-vision-modern-emacs-2026-05.md):long-term vision、本書 G3/G5/G6 が具体化
- [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md):領域 1〜10 棚卸し、本書 §1 で要約
- [`../planning/USER_REQUEST_LEDGER.md`](../planning/USER_REQUEST_LEDGER.md) §3:deferred 28 件、本書 §2 で group 配置
- [`completed/render-surface-parity-audit-2026-05.md`](./completed/render-surface-parity-audit-2026-05.md):5 surface Gap-1〜15、**全件 RESOLVED**(pgc-78〜211、2026-05-28 archive)
- [`multi-window-vscode-extension-spec-2026-05.md`](./multi-window-vscode-extension-spec-2026-05.md):G7 と統合
- [`fragment-reference-ir-spec-2026-05.md`](./fragment-reference-ir-spec-2026-05.md):G4 と統合
- [`markdown-dialect-extensions-spec-2026-05.md`](./markdown-dialect-extensions-spec-2026-05.md):G5 と統合
- [`button-size-audit-2026-05-24.md`](./button-size-audit-2026-05-24.md):G8 と統合(step 1〜3-bis 着地、残 step 4/6)
- [`flag-inventory-audit-2026-05-24.md`](./flag-inventory-audit-2026-05-24.md):G6/G8 と統合(always-on cleanup)

---

## §8 history

| date | event |
|---|---|
| 2026-05-24 | 本書起稿(pgc-177、user direction「全てを統合 + 既存統廃合 + データ互換維持」)。100+ 未実装機能を 10 group に統合、各 group で既存 rip out / merge / 拡張 / 新規 を表で明文化、wave-α' 〜 ε'(~120 PR)の段階 plan を §5 に提示、OQ-U1〜10 を §6 に記録 ── user 議論待ちで着手判断 |
