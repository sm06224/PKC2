# PKC2 Vision — モダン emacs/org-mode + 非プログラマ + AI 一級市民(2026-05-07)

## 1. 立ち位置の自覚(2026-05-07 user 直接洞察)

> User direction(原文):
> 「PKC2 の機能が emacs の org-mode に似ていることを自覚した。**非プログラマでも使えて AI と対話にも使える便利ツールとしての emacs のモダン実装** を作るイメージが湧いた。」

PKC2 は **構造として org-mode と一致しているが、3 つの根本制約を破壊している**:

1. **Emacs barrier の撤廃** — 単一 HTML 自己完結、install 不要、サーバ不要、Electron 不要
2. **AI extension の一級市民化** — PKC-Message v2 + IR(計画中)による 3rd-party AI 統合
3. **データの完全可搬性** — Container = self-contained export、ベンダーロックなし

この 3 つを満たす既存製品は **観測範囲内で存在しない**。本書はその vision を canonical 化し、後続 wave の意思決定を導く reference とする。

---

## 2. org-mode 機能との対応マップ

| org-mode | PKC2 | 状態 |
|----------|------|------|
| Plain-text outline | Container + entry hierarchy | ✅ |
| Headings + properties drawer | Archetype + frontmatter (YAML) | ✅ |
| Tags + categories | tags + color_tag + relations | ✅ |
| TODO state machine | todo archetype + status | ✅ |
| org-table | (10-4 spreadsheet で予定) | 🟡 計画 |
| org-babel(コードブロック実行) | sandbox iframe + PKC-extension(10-5) | 🟡 計画 |
| org-agenda(filter/sort/group view) | filer / inventory / calendar / kanban / graph | ✅ |
| org-capture(quick input) | bookmarklet + capture import | ✅ |
| Internal links + transclusion | entry: ref + embed | ✅ |
| Export(HTML / LaTeX / ICS) | container HTML / ZIP / single-entry export | ✅ |
| org-roam(Zettelkasten layer) | relations + graph view + folder hierarchy | ✅ |
| `org-element`(canonical AST) | (10-3 IR で予定) | 🟡 計画 |
| dynamic block / column view | markdown extension で対応(10-2) | 🟡 計画 |
| clocking(時間計測) | todo archetype 拡張で対応可 | 🟡 候補 |

**評価**:既存機能で org-mode との **構造的同型** はほぼ達成。残るのは IR(10-3)、spreadsheet(10-4)、PKC-extension 機構(10-5)、markdown 拡張による特殊記法(10-2)。これらが揃えば **org-mode の機能水準を超えるモダン版** が完成する。

---

## 3. 先行事例 / 競合製品 比較

| 製品 | 共通点 | 違い | PKC2 から見た位置 |
|------|--------|------|------------------|
| **TiddlyWiki** | 単一 HTML 自己完結、tiddler = entry、filter / transclusion / macros、~20 年の実績 | 構造化 archetype なし、AI 視点欠如、UX は古典的 | **最も近い architecture**、reference にすべき |
| **Logseq** | outliner + properties + queries、ローカル、markdown source、org-mode 思想を継承 | Electron アプリ、AI 統合は plugin 任せ | **最も近い哲学**、UX 参考 |
| **Obsidian** | ローカル markdown、plugin エコシステム、graph view | 構造化 schema 弱い、AI 統合は plugin、Electron | コミュニティの広さ参考 |
| **Tana** | Supertags = archetypes、queries、AI-native | hosted SaaS、ベンダーロック、source 不開示 | **最も AI-forward**、UX 機能参考 |
| **Roam / Athens** | block-based、bidirectional links | block 中心、archetype 軸が弱い | 概念のみ参考 |
| **Notion** | DB + pages、cross-linking、scale | 完全 hosted、export 弱い、AI は別契約 | 反面教師(ベンダーロック) |
| **Mem.ai / Reflect** | AI-native PKM | hosted、source 不開示 | AI UX 参考 |
| **emacs org-mode** | 全機能の出発点(本 vision の起点) | Emacs 専用、UX 障壁、AI は ad-hoc plugin | **思想の祖**、機能 superset 目標 |

### PKC2 のユニークな立ち位置

> **「TiddlyWiki(単一 HTML)× Logseq(org-mode 思想)× Tana(AI-native)」の交点**
>
> = 「インストール不要」+「org-mode 級の構造化」+「AI extension 一級市民」を同時に満たす唯一の製品

この交点は competitive moat になる。後発が単一 HTML + AI extension + org-mode 同型 を 3 つ同時に再実装するのは現実的でない。

---

## 4. Vision が roadmap に与える優先度シフト

各 wave に **「org-mode 等価機能の獲得」という意味付け** を与えると、roadmap の優先度が変わる:

| Wave | 元の意味 | vision 反映後の意味 | 優先度 |
|------|---------|-------------------|--------|
| **10-2** markdown 方言拡張 | 罫線 / text-align 等の追加 | **org-mode の特殊ブロック / drawer 相当を markdown 上で構築**(`#+BEGIN_QUOTE` / dynamic block 等の等価実装) | 🔴 高(具体機能) |
| **10-3** 内部中間表現(IR)導入 | export 系の経路統一 | **`org-element` 相当 = PKC document の standard AST**。IR 無しでは AI extension は ad-hoc 変換、export は個別実装、view は経路バラバラ | 🔴 **最高(本 vision の中核)** |
| **10-4** スプレッドシートエントリ | 新 archetype | **org-table 相当**、構造化データの軸 | 🟡 中(独立) |
| **10-5** PKC-Message + extension | AI extension 経路 | **org-babel 相当 + 3rd party AI extension エコシステム基盤**、IR 経由で document を渡す | 🔴 高(IR 後) |
| **10-7** アプリランチャー | view-mode 入口 | **org-agenda 風の dashboard**、PKC2 の入口体験 | 🟡 中 |
| **10-8** Sandbox / multi-window | iframe controller | **org-babel iframe 実行環境** + PKC-extension の execution sandbox | 🟡 中(spec 先行) |

### 戦略的な順序

1. **(A) Quick Win Wave**(本 wave) — wave 10-9 後の rhythm 回復 + UX polish
2. **(B) markdown 方言拡張**(10-2) — 具体機能拡張、user-visible 価値高、5 MB budget で束縛なし
3. **(C) spreadsheet**(10-4) — 独立 archetype、org-table 等価
4. **(D) IR Q&A セッション**(10-3 prep) — Q1〜Q7 + 本 vision 観点 Q を user と詰めて固定 → spec 起こし → 実装 wave へ
5. **(E) IR 実装 wave**(10-3 main) — ~3 ヶ月、本 vision 完成の中核
6. **(F) PKC-extension 拡張**(10-5) — IR 後に着手、3rd party AI extension 基盤
7. **(G) launcher / sandbox / multi-window** — 上記が揃った後の上位機能

(D) IR Q&A は (B)/(C) と並行可能(対話 wave、コードゼロ)。

---

## 5. 本 vision に紐づく Open Questions

実装前に user 合意が必要な戦略決定事項:

| OQ | 内容 | 影響範囲 | 着地時期 |
|----|------|---------|---------|
| **OQ-V1** | IR は org-element 相当の **public spec** としてどこまで開示するか?(3rd party extension の入出力 spec として) | 10-3 / 10-5 | (D) wave |
| **OQ-V2** | 3rd party PKC-extension からの IR consume / produce を **一級市民** にするか?(grant ベース ACL でガバ閉じか) | 10-5 | (D) wave |
| **OQ-V3** | org-mode の特殊機能のうち、どこまで markdown 拡張で実装するか?(優先度 list) | 10-2 | (B) wave 起点 |
| **OQ-V4** | 既存ユーザー(あなた)の usage pattern を「典型ユースケース」として spec 化するか?(persona 化) | 全 wave | 任意のタイミング |
| **OQ-V5** | 製品ブランディングを変えるか?(「単なる knowledge container」→「modern emacs / non-programmer の AI 知能拡張」) | marketing / docs | 機能着地後 |

**OQ-V1 / V2 は IR 実装の前に確定が必要** — 後から spec 公開 / 非公開を切替えるのは breaking change になる。

---

## 6. 本 vision の運用ルール

### 6.1 vision drift の防止

「面白そうだから」「emacs にあるから」だけで機能を増やさない。**追加機能は本書 §4 の優先度マップに位置付け** + 既存 archetype / IR / extension の何に紐づくかを明記してから着手する。

### 6.2 OQ-V を放置しない

§5 の OQ は **IR 実装着手前に user との対話で確定**。draft で残置せず、合意した時点で本書 §5 を「決定済」に書き換え、`intermediate-representation-audit.md` の Q1〜Q7 に統合する。

### 6.3 先行事例の継続 watch

§3 の表は本書時点の理解。Tana / Logseq / Mem.ai / 新興 AI-native PKM は急速に進化するため、**6 ヶ月ごとに watch update**(2026-11 を次回更新目安に)。新しい突破事例があれば PKC2 の差別化軸に影響するため roadmap 再評価。

---

## 7. 関連 doc

- `feature-requests-2026-04-28-roadmap.md` — 領域 1〜10 の roadmap、本書 §4 と相互参照
- `intermediate-representation-audit.md` — 10-3 IR audit、Q1〜Q7 + 本書 OQ-V1/V2 の議論場
- `pkc-message-v2-open-questions-decisions-2026-05.md` — PKC-Message v2 の OQ 決定、10-5 の前段
- `wave-10-9-stabilization-summary.md` — 直前 wave 締め
- `pr-review-checklist.md` — PR 作成時の自己監査(本 vision 観点で feature の意義を 1 文書く要請)
