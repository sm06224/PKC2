# Session handoff 2026-05-24(pgc-99〜145 stack 47 PR)

**作成日**: 2026-05-24
**作成セッション**: claude-opus-4-7[1m]、約 12 時間連続作業
**次セッション読み**: `Read` 必須(プロンプト内で `--read-docs` 指示)
**寿命**: pgc-146 着手時に次セッションが §3 棚卸しを再 grep して更新する

---

## §1 user direction(本運用の根幹、絶対遵守)

> 「まだまだスタックを積んで、いまの main がとはまるで生まれ変わったか
>  のようになるまでは、この運用を維持するようにします」
>
>  ── user 2026-05-24

つまり:
- **main 着地禁止**(invariant I7)を `MASTER.md §10` の規定どおり継続
- **stack PR 方式**を継続(各 PR は直前 PR の branch を base、`claude/pgc-N-...`)
- **Tier 0 flag default OFF**(後方互換完全維持)
- **「生まれ変わった」状態の定義は user 判断**(merge 解禁 = user の終了宣言)

## §2 累計成果(pgc-99〜145、47 PR)

| metric | value |
|---|---|
| PR 件数 | 47(pgc-99〜145) |
| test 件数 | 8927 → **9207**(+280) |
| bundle js | 1908 KB → 1943 KB(+35KB / +1.8%) |
| bundle css | 174 KB → 187 KB(+13KB / +7.5%) |
| dist html | 1065 KB → ~1075 KB |
| keymap registry binding | 0 → **21 件** |
| Tier 0 flag(本 wave で追加) | **20+ 件**(全 default OFF) |
| 0 regression 維持 | 47/47 PR 全件 |
| local gitleaks no leaks | 47/47 PR 全件(152 commits / 394 MB scan) |

### §2.1 wave-γ shell redesign(23 PR、pgc-99〜124)

完了 5 領域 + 1 hotfix + 2 docs:

| § | 機能 | PR(s) |
|---|---|---|
| §6.1 | header 削減 3 phase(+New picker / Data→Shell Menu / back-forward→breadcrumb) | pgc-99/100/101 |
| §6.2 | Activity Bar 全 6 tab(Explorer / Search / Outline / Relations / Recent / Pinned)+ 位置切替 + keyboard shortcut + tooltip keybind | pgc-102〜108, 116, 121, 124 |
| §6.3 | Inspector 5 tab scaffold + 4/5 機能化(Properties / References / History / Style)+ References clarify + chord shortcut | pgc-109, 112, 117, 118, 123 |
| §6.4 | Format panel default-hidden + 🎨 toggle + `Alt+Shift+F` shortcut | pgc-110, 120 |
| §6.5 | view-mode tabs scoped(entry vs workspace 視覚分離) | pgc-111 |
| §2 U-19 | About PKC-Markdown showcase + vars 動的展開 | pgc-113, 114 |
| (hotfix) | `+ New` popover 画面外 fix | pgc-106 |
| (docs) | wave-γ progress doc + 2 回更新 | pgc-115, 119, 122 |

### §2.2 wave-δ archetype-specific UX(18 PR、pgc-125〜144)

| 機能 | PR |
|---|---|
| editor footer wordcount + live + read time | pgc-125, 126, 127 |
| Inspector Style archetype-specific 6/6(text/textlog/todo/attachment/folder/form) | pgc-128, 129, 130, 131, 132 |
| docs update | pgc-133 |
| todo overdue 視覚 indicator(sidebar / filer) | pgc-134 |
| hotfix:export 動線消失救済 | pgc-135 |
| **user issue #1〜10 一括対応**(2026-05-24 報告) | pgc-136〜145(10 件) |

### §2.3 user issue 10 件カバー詳細(pgc-136〜145)

詳細は前セッション末尾の summary 表 + `CHANGELOG_v2.3.0.md` 参照。
全 10 件着地済、AI tab のみ docs roadmap で実装は user direction 待ち。

## §3 未着手 backlog(優先度順)

### §3.1 AI tab roadmap(user direction 待ち、pgc-145 で起こした doc 参照)

[`inspector-ai-tab-roadmap-2026-05.md`](./inspector-ai-tab-roadmap-2026-05.md) §4 の 4 択:
- A. **local-only Phase 1 開始** → pgc-146 で frontmatter suggestion / abandoned warning / broken link summary
- B. **全 scope 走る** → Phase 1 から開始、Phase 3 で API 接続 stack 追加
- C. **AI tab 廃止** → 5→4 tab に変更
- D. **設計議論続行**

### §3.2 wave-γ 残り(MASTER §6 後続)

- **workspace tab を center tab strip に統合**(§6.5 大改修):view-mode bar 廃止 → tab strip(`shellTabsEnabled`)に Calendar / Kanban / Filer / Graph / Launcher の workspace tab を統合
- **format panel inline toolbar**(§6.4 step 3):selection-floating Notion / Medium 流(scope 大)
- **Activity Bar tab badge**(unread / pending count 等)
- **Inspector Properties tab の frontmatter 編集 inline UI**
- **Inspector History tab の revision diff viewer**

### §3.3 wave-δ phase 2(archetype 編集 UX 改修)

- **text**:multi-cursor / minimap / outline sidebar / reading mode / folding 拡張
- **textlog**:各日の高速 jump / log search / importance filter UI
- **todo**:subtask 階層 / completion graph
- **form**:field 順序 DnD / conditional field
- **attachment**:preview MIME 拡張 / batch download / sandbox policy GUI
- **folder**:tree-flat 切替 / children sort filter / bulk select / move

### §3.4 wave-ε scope(canvas prep、未着手)

MASTER §8 ── canvas + wasm 経路の前駆。secondary pane の独立 render
path(pgc-89 Split View)が既に foundation。Phase δ で renderer を
differential 振り分ける足場を作る。

### §3.5 ベースの改善 candidates

- **wordcount footer / read time の code block / image alt 除外 option**
- **wordcount mobile compact format**
- **mobile UX 全般の見直し**(user は触り中の様子)
- **slim chrome / compact mode を default ON** にする是非(現状全 OFF だが、現役 user の好みに合わせて default 変更を検討)
- **flag inventory cleanup**(本 wave で 20+ 件追加、全 default OFF。一定 PR 着地後に「定着 flag は always-on 化(コード簡素化)」する整理が必要)

## §4 次セッション規律(必ず守る)

### §4.1 PR の作り方

1. `git checkout -b claude/pgc-N-<short>` で新 branch(N = 連番)
2. **直前 PR の branch を base** に stack(本 session pgc-145 の base は pgc-144)
3. 1 PR = 1 機能 / 1 hotfix、scope 小
4. **必ず Tier 0 flag default OFF**(後方互換、I7 維持)
5. **新 flag 追加時は `shell-flags.ts` に description + URL flag 例 + 関連 PR 番号**を書く

### §4.2 test / build / scan

各 PR 着地前:
1. `npm run typecheck`(green 必須)
2. `npm test`(0 regression 必須)
3. `npm run build`(green 必須)
4. **`/tmp/gitleaks detect --config=.gitleaks.toml --log-opts="origin/main..HEAD"`**
   ── 「no leaks found」確認後 push(false positive は `.gitleaks.toml` allowlist で吸収)
5. `git push -u origin claude/pgc-N-...`
6. **MCP `mcp__github__create_pull_request`** で PR 作成(`gh` CLI 使えない、`ToolSearch` で読み込む)
7. webhook subscribe ← 来たら **必ず unsubscribe**(session policy)

### §4.3 CHANGELOG / docs

- 各 PR commit + push 前に **`docs/release/CHANGELOG_v2.3.0.md`** の最新 entry の頭に 1 行追加(PR 番号 + 概要)
- 新規 doc 追加時は **`docs/development/INDEX.md`** に同 commit で 1 行追加(check:doc-orphans が CI で fail する)
- 進捗 doc(`wave-gamma-progress.md`)は概ね 5〜10 PR ごとに update

### §4.4 commit message format

```
feat(<area>): wave-X #N — <short> [stack pgc-N]

<段落 1:背景 / user direction / bug report quote>

<段落 2:implementation 要約>

Tests: tests/adapter/<file>.test.ts N 件
  - case 1
  - case 2
  ...

全 N file / M unit test pass(+K new、pgc-N-1 baseline から 0 regression)、
typecheck + build green。

local gitleaks scan(N commits / M MB)で "no leaks found"。

https://claude.ai/code/session_017KG66tCdhQsbpARsXeRWiB
```

## §5 教訓(本セッションから次セッションへの引き継ぎ)

### §5.1 技術的教訓

1. **GitHub MCP tools は intermittent**(中盤で disconnect、後で reconnect)。push は git で確実、PR 作成だけ MCP 復活後にバッチ実行。
2. **gitleaks pre-push は uncommitted change を見落とす** ── `--log-opts="origin/main..HEAD"` は committed only。次 PR の最初に前 PR の commit を scan するため、false positive 検出は 1 PR 遅れる。test fixture は明らかに非 secret な命名(`test-asset-...`)で予防。
3. **module-local state pattern**(Activity Bar、Inspector、format panel visibility、entry picker callback)が多用される。state 反映には dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: state.childWindowLids ?? [] }) で強制再描画 + module-local の getter を renderer.ts から call。
4. **action-binder click handler で button が再描画される問題**:dispatch 後の `target.setAttribute` は旧 node を変更する。新 node に書きたい場合は `root.querySelector(...)` で再 query する(pgc-136 の click flash で対応)。
5. **test で sidebar.mode=tree** flag を併用しないと sidebar entry-list `<li>` 構造が出ない(default は filer mode)。
6. **archetype 型は ArchetypeId**(test 用 fixture で `'folder' as ArchetypeId` cast 必要、`string` だと typecheck fail)。
7. **happy-dom test の URL params** ── 完全に新規 URL を構築(`baseUrl.split('?')[0]`)した方が安全、`url.searchParams.delete` は前 test の残骸を取りこぼすことがある。
8. **CSS rule の文字列が HTML に含まれる** ── `expect(html).not.toContain('data-pkc-chrome="true"')` は CSS rule selector も検出する。`<body data-pkc-chrome="true">` 等 element-specific な assertion を使う。
9. **entry-window test で同 lid を使い回すと duplicate-open 検出で 2 回目以降 HTML が write されない** ── `entryCounter++` で unique lid 生成。

### §5.2 process 教訓

1. **webhook 通知が来たら反射的に unsubscribe**。session policy で「GitHub CI を気にしない、local CI のみ参照」── 全 47 PR で守った。
2. **小 PR (~100〜500 行) は 1 セッション 30〜50 件着地可能** ── 本 session は 47 PR、約 12 時間。stack 規律 + Tier 0 flag default OFF で main 影響ゼロ。
3. **user bug report を即座に hotfix PR で対応**:pgc-106(+New popover offscreen)、pgc-135(export 動線消失)、pgc-136〜144(user 提示 10 件)── user 信頼維持に重要。
4. **roadmap doc 化**:scope 大の議論案件(AI tab pgc-145)は実装せずに doc で選択肢を提示、user direction 待ち ── 余計な scope 増を防ぐ。

### §5.3 user 観察

- user は **flag opt-in 経由の動作確認** を実機 (`?pkc-flag=...` URL flag) で行う。flag 名は **clear かつ ON 時の効果を一語で描写**(`shell.header_compact_enabled` 等)。
- user は **density + minimum chrome 重視**(VSCode 流)。
- user は **動線の discoverability** を重視:tooltip / placeholder / 短い hint。
- user は **「ヘッダフッタが見えない」「上部 4 段占有」「視覚ノイズ」** 系の体感事故を即報告 ── 視覚設計に sensitive。

### §5.4 設計 doctrine 確立済

- **archetype-specific Inspector Style** は pure helper(`parseTextlogBody` 等 features 層)を import すれば 6 archetype に展開可能
- **slash menu 拡張**:`registerXxxPickerCallback` pattern で cycle 回避
- **keymap registry**:`registerBuiltinKeymaps` に 1 行追加 + command palette に keybind 注記
- **module-local state + render reads it**:state mutation は SYS_SYNC で再描画 trigger、reset helper を export してテスト容易

## §6 次セッション開始用 prompt(user が新 chat にコピペ)

下記を新セッションに貼り付けると、Claude が即座に本 stack を引き継ぎ次 PR に着手します。

```
PKC2 v2.3.0 stack PR(pgc-99〜145、47 件)を引き継いで次 PR pgc-146 を開始してください。

【必読 docs(順序固定)】
1. /home/user/PKC2/CLAUDE.md(project 規律 + Language Policy:思考は EN、出力は JA)
2. /home/user/PKC2/docs/development/session-handoff-2026-05-24.md(本セッション handoff、scope / 規律 / 教訓 / backlog)
3. /home/user/PKC2/docs/development/vscode-grade-overhaul-2026-05/MASTER.md(全体 master、invariants I1〜I7 必読、特に I7 main 着地禁止)
4. /home/user/PKC2/docs/development/vscode-grade-overhaul-2026-05/wave-gamma-progress.md(wave-γ/δ 着地状況)
5. /home/user/PKC2/docs/development/inspector-ai-tab-roadmap-2026-05.md(AI tab 4 phase 計画、§4 user direction 待ち)
6. /home/user/PKC2/docs/release/CHANGELOG_v2.3.0.md 末尾 50 行(直近 PR の細部)

【絶対遵守】
- main 着地禁止(invariant I7)、stack PR を継続
- 全 PR Tier 0 flag default OFF、後方互換完全維持
- 各 PR: typecheck + npm test + build + local gitleaks(/tmp/gitleaks detect --config=.gitleaks.toml --log-opts="origin/main..HEAD")で no leaks 確認 → push → MCP で PR 作成
- 1 PR = 1 機能 / 1 hotfix、scope 小
- webhook subscribe が来たら反射的に unsubscribe(session policy 「GitHub CI を気にしない」)
- CHANGELOG_v2.3.0.md 更新必須、新 doc は INDEX.md 同時登録(check:doc-orphans)
- commit message format は handoff doc §4.4 参照、必ず "https://claude.ai/code/session_017KG66tCdhQsbpARsXeRWiB" を含める
- PR base は直前 PR の branch(pgc-146 の base は pgc-145 branch claude/pgc-145-ai-tab-roadmap)

【最初の判断】
session-handoff-2026-05-24.md §3 backlog から最初の PR を選ぶ。優先度推奨(私の judgement):
- A: AI tab Phase 1(pgc-145 §4 で user direction 待ちなので user に再確認 or 設計議論続行)
- B: workspace tab を center tab strip 統合(§6.5 大改修、scope 大)
- C: wave-δ phase 2 から todo subtask か textlog log search(scope 中)
- D: 小ネタ(slim chrome / compact mode の default ON 化検討、wordcount code block 除外 option)── 即着地可能

user に最初に "次 PR の候補と着手順を提示" してから始める(本人不在で autonomous に走る場合は D の小ネタから着手)。

【user 意向(2026-05-24 引用)】
「まだまだスタックを積んで、いまの main がとはまるで生まれ変わったか
 のようになるまでは、この運用を維持する」

「main が生まれ変わった」状態の定義は user 判断 ── merge 解禁 = user の終了宣言。
それまでは continuous stack mode。

【次の handoff】
新セッションで概ね 30〜50 PR 着地したら、本 doc と同じ format で
session-handoff-<date>.md を起こして次セッションへ繋ぐ。
```

## §7 history

| date | event |
|---|---|
| 2026-05-23〜24 | pgc-99〜145 着地(47 PR、test 9207、~12 時間連続)── wave-γ shell redesign + wave-δ archetype UX + user issue 10 件カバー。本 handoff doc 起こし(pgc-146)。 |
