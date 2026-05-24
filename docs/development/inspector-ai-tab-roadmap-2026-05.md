# Inspector AI tab(🧠)roadmap

**作成日**: 2026-05-24
**status**: 計画段階(placeholder のまま)
**parent**: `vscode-grade-overhaul-2026-05/MASTER.md` §6.3
**契機**: user 質問(2026-05-24)「右paneの脳みそはいつ稼働するんだろ？」

---

## §1 現状

`Inspector` 5 tab(MASTER §6.3、pgc-109 で scaffold):

| Tab | 状態 |
|---|---|
| 📋 Properties | ✓ 機能化(frontmatter / warning) |
| 🔗 References | ✓ 機能化(relations / tags / link-index)|
| 📜 History | ✓ 機能化(revision-history / picker / diff)|
| 🎨 Style | ✓ 機能化(archetype-specific metrics、6 archetype 全対応)|
| 🧠 AI | **✓ pgc-147 着地**(Phase 1 A1 frontmatter suggestion、flag `shell.inspector_ai_local_enabled` opt-in、後続 PR で A 群 4/10 残り) |

pgc-147 までの AI tab:`meta-pane-inspector.ts` で `visibleRegions: []` ──
placeholder("Coming soon")を出すだけ。pgc-147 で `visibleRegions:
['inspector-ai-suggestions']` + `buildInspectorAiSection` 経路を flag opt-in
で解放。flag OFF だと従来通り空、flag ON だと本文 H1 / `#tag` から
frontmatter 候補を提示。

## §2 設計分岐点(user 議論待ち、user direction で決める)

AI tab は **scope 大** + **privacy / cost 影響大** のため、wave-γ /
wave-δ の Tier 0 flag default OFF だけでは安全に出せない。MASTER §10.2
「自律性 max」だが本機能だけは user に判断を委ねる:

### §2.1 LLM 接続戦略

| 選択 | pros | cons |
|---|---|---|
| **A. local-only**(LLM 接続なし、純粋 inspector) | 完全 privacy / cost ゼロ / offline 完結 | 「AI」と銘打つ必要性が薄い |
| **B. opt-in API**(Claude / OpenAI 等を user が API key 設定) | 強力な AI workflow / extensible | API key 管理 / cost / privacy 同意設計 |
| **C. local model**(wasm 経由で小モデル動作) | privacy 保つ + 一部 AI 機能 | bundle size 大幅増 / 性能限界 |
| **D. opt-in API + local fallback** | best of both | 複雑度 ↑ / 2 経路 maintain |

**Claude default 推奨**:**A → 段階的 B**(まず純粋 inspector で「AI らしい」
分析を出し、後で opt-in API に拡張)。理由:PKC2 の I3 invariant「single-
HTML product」は外部 dep を拒否するため、最初は local-only が自然。

### §2.2 機能 scope

「AI tab」と聞いて思いつく機能の網羅。**user direction に応じて取捨選択**。

#### A 群:local-only(API 不要)

1. **frontmatter 自動生成 suggestion** ── body の heading / 構造から
   `--- title: … category: … tags: … ---` を提案
2. **重複 entry 検出** ── 同 container 内で似た title / body の entry を
   highlight(simple TF-IDF or hash-based)
3. **broken link 一覧** ── 既存 link-index に対し、target が削除済の
   reference を集めて quick-fix
4. **abandoned entry** ── updated_at が古く relation/reference が無い
   entry を提示 ── clean-up workflow
5. **circular reference 警告** ── relation grap で循環があれば proactive 警告
6. **outline コンプライアンス** ── h1 が無い entry / h2 飛び entry の指摘
   (markdown lint 風)
7. **tag インバランス** ── tag 1 件のみの entry / tag 過多の entry を
   surface
8. **archetype mismatch suggestion** ── e.g.「この text、TODO body を
   含んでるけど todo archetype の方が合うのでは?」

#### B 群:opt-in API 必要

1. **要約** ── 現 entry を 1〜3 行で summarize、frontmatter `summary:` に書き戻し
2. **言い換え / 文体変換** ── selection を formal / casual / English に変換
3. **翻訳** ── selection を別言語へ
4. **frontmatter 生成(LLM 版)** ── LLM が読んで適切な YAML を提案
5. **broken link 自動 fix** ── LLM が context から正しい lid を推測
6. **質問 → 関連 entry 提示** ── RAG 的に container 内 search + LLM 回答
7. **ガイド / 補完** ── markdown を書きながら次の文を suggest
8. **AI commit log** ── revision 差分を LLM が「何が変わったか」一文化

#### C 群:可能だが scope 巨大

1. **container 全文 chat** ── LLM agent が container を「読んで」会話
2. **autonomous edit suggestion** ── user の意図を察して edit 提案 → apply
3. **multi-agent** ── 複数 role(reviewer / writer / lint)が並列に提案
4. **graph 分析 + insight** ── relation graph の community detection
5. **trend analysis** ── 時系列で entry creation rate / focus area の変動

### §2.3 privacy / cost / consent 設計

- B 群を実装するなら **api key 入力 UI + container 同意 flag + outbound
  policy**(local-only / specific-tasks / full)が必要
- About entry のような「機能 disclosure」を AI tab で明示
- 各 request 前に「{N} bytes を Claude API に送信します。続行?」確認
- usage log を flags Inspector と同様の場所に閲覧可能
- A 群(local-only)はこれら不要

## §3 段階的 roadmap(Claude が提示する案、user direction 待ち)

### Phase 1(scope 小、Tier 0 flag opt-in):local-only inspector

- **pgc-147 着地** ✅:A 群 1 = `frontmatter suggestion`(本文 H1 → title /
  本文 `#tag` literal → frontmatter tags の差分提案、apply / dismiss button
  付き)。`src/features/ai/frontmatter-suggester.ts` + `src/adapter/ui/
  inspector-ai-tab.ts` + flag `shell.inspector_ai_local_enabled`(default
  OFF)。22 件 case matrix + 10 件 DOM test、bundle +6 KB
- **pgc-148 着地** ✅:A 群 4 = `abandoned entry warning`(updated_at が 30
  日以上前 + relation 0 件 + link reference 0 件 の AND で「使われていない
  候補」 ⚠️ box を Inspector に表示、dismiss button のみ提供)。`src/features/
  ai/abandoned-warning.ts` + `inspector-ai-tab.ts` 拡張(container 引数追加)。
  15 件 case matrix + adapter test +7 件、bundle +1 KB(計算 logic は既存
  link-index 再利用)
- **pgc-149 候補**:A 群 10 = `broken link summary`(target 削除済の
  reference を集約 + quick-fix button)── 既存 link-index `index.broken`
  を集約するだけ、bundle +1 KB 見込み
- flag `shell.inspector_ai_local_enabled`(default OFF、opt-in)── 上記 3
  PR で同 flag を共有(機能内訳 = panel 内 sub-section)
- LLM 接続なし、pure JS 計算 ── privacy / cost ゼロ
- bundle 累計増分:~10 KB(pgc-147 で +6 KB、pgc-148/149 で +2 KB ずつ見込み)

### Phase 2(scope 中):A 群残り + UI 充実

- A 群 4〜8 件着地
- 各 suggestion に「apply」「dismiss」 button
- per-container suggestion history(localStorage)

### Phase 3(scope 大):B 群 opt-in API

- API key 入力 UI(Settings 側、Inspector AI tab に setup 動線)
- `shell.inspector_ai_api_enabled` flag + outbound policy
- 各 B 群機能を 1 PR ずつ追加(要約 → 翻訳 → frontmatter → ...)
- usage log / cost meter
- privacy 同意 flow

### Phase 4(scope 巨大、wave-ε 候補):C 群

- container chat / autonomous suggestion / multi-agent
- 別 wave 扱い、wave-ε(canvas prep)と並行 or 後段

## §4 user 質問への暫定回答

> 「右paneの脳みそはいつ稼働するんだろ？」

**回答**:placeholder のままです。実装には user direction が必要 ──
本 doc §2 で **(A) local-only**(まずは pure 分析、API 接続なし)から
段階開始する案を Claude が推奨しています。

User が以下のいずれかを示せば次 PR で開始可能:
- **「local-only でいい、Phase 1 から始めて」** → pgc-146 で着手
- **「API 接続も含めて scope 全部やって」** → pgc-146 でも local-only から
  入り、Phase 3 で API 経路を別 stack で組む
- **「AI tab そのものを廃止して、5 → 4 tab にしたい」** → tab 削除 PR
- **「設計議論続行、まだ実装するな」** → 本 doc を live で更新

## §5 関連 doc

- [`vscode-grade-overhaul-2026-05/MASTER.md`](./vscode-grade-overhaul-2026-05/MASTER.md) §6.3
- [`vscode-grade-overhaul-2026-05/wave-gamma-progress.md`](./vscode-grade-overhaul-2026-05/wave-gamma-progress.md) §4 §6.3
- `docs/release/CHANGELOG_v2.3.0.md`:pgc-109 / pgc-117 / pgc-118 で Inspector 4/5 完成

## §6 history

| date | event |
|---|---|
| 2026-05-24 | 本 doc 起こし(pgc-145、user 質問契機)── 4 phase の段階 roadmap + 3 接続戦略 + 3 群 25 機能を inventory、user direction 待ち |
| 2026-05-24 | **pgc-147 着地** ── Phase 1 A1(frontmatter suggestion)を flag `shell.inspector_ai_local_enabled`(default OFF)経由で local-only 実装。Inspector 5 tab すべて placeholder 脱却(Properties / References / History / Style / AI 全 5/5 機能化)。`§1` 現状表の AI 行 placeholder → ✓ 機能化(local-only / 後続 PR で A 群残り)に。次 stack pgc-148(abandoned entry)、pgc-149(broken link summary)|
| 2026-05-24 | **pgc-148 着地** ── Phase 1 A4(abandoned entry warning)を同 flag で実装。`updated_at >= 30 日 + relation 0 + link 0` の AND で `pkc-inspector-ai-warning` 橙 box を Inspector に表示、dismiss button。`src/features/ai/abandoned-warning.ts` 新規。次 stack pgc-149(broken link summary)で Phase 1 完了予定 |
