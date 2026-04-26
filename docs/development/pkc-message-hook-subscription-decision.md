# PKC-Message Hook Subscription — Go / No-Go Decision Doc (docs-only)

> **Status (2026-04-26)**: 本 doc は v1 spec(`docs/spec/pkc-message-api-v1.md`)では **deferred** として §11.1 から参照される。本 doc は hook subscription の go/no-go 判断の正本(=Defer 決定)として **active** な状態を保持する。

**Status**: decision doc — 2026-04-20. **本 PR は実装を含まない**。
**Purpose**: review / acceptance / PoC 設計の三段構えが揃った状態で、「**PKC2 は hook subscription を実装すべきか？**」を判断する材料を 1 箇所に集約する。判断は本書内で下す（実装 Go / No-Go / Defer）。

---

## 0. TL;DR

- **価値**: 外部 graph 可視化ツールとのリアルタイム連携が可能になる。ただし現時点では「便利」であって「必須」ではない
- **リスク**: PKC2 を "プラットフォーム" 方向に一歩踏み出す。管理面・セキュリティ面のコスト増は不可避
- **代替案**: polling / manual export / extension-only の 3 路が存在し、いずれも hook なしで実現可能
- **推奨**: **Defer（延期）** — UX 強化フェーズ（backlinks / autocomplete / unified references）を先に完了し、拡張フェーズに入る段で改めて判断
- **条件**: Defer 期間中に acceptance contract / PoC 設計を stale にしない（将来着手時に即利用可能な状態を維持）

---

## 1. 提案サマリ（最短再述）

PKC-Message プロトコルに opt-in の event 購読機構を追加する。embedded 状態の PKC2 が relation 変更を push 通知し、外部ツール（graph viewer 等）がリアルタイムで状態を受け取れるようにする。PKC2 側の review / acceptance contract / PoC 設計はすべて完了しており、技術的に実装可能な段階にある。

## 2. Value Analysis（解放される価値）

### 2.1 具体的ユースケース

| # | ユースケース | hook なしの代替 | hook で何が変わるか |
|---|-------------|----------------|-------------------|
| U1 | **Graph Tool**（relation 可視化） | export → import / polling | リアルタイム反映。relation 作成直後に graph が動く |
| U2 | **外部ダッシュボード**（orphan / 統計表示） | container export 定期分析 | 変化時のみ更新される軽量通知 |
| U3 | **マルチウィンドウ同期**（同一 container を 2 つの PKC2 で開く） | 未サポート | 片方の relation 変更がもう片方に通知される（PoC scope 内か微妙）|
| U4 | **CI / 品質モニタ**（relation 構造ルール違反検出） | 手動 export → lint | event 駆動でルール判定、即フィードバック |

### 2.2 解放される価値の質

- **U1 (Graph Tool)** は最も concrete で、外部提案の動機そのもの。ただし PKC2 **本体** に graph を取り込まないことは acceptance で決定済みなので、hook 実装しなくても **「graph は外部ツールの責務」** は変わらない
- **U2〜U4** は「あれば便利」だが「なくても代替可能」

### 2.3 率直な問い

> **この value は、今すぐ支払うコスト（§3 / §6）に見合うか？**

- 現時点の PKC2 ユーザ人口で、U1 を日常的に使うペルソナが存在するかは未確認
- hook なしでも Graph Tool は「export した JSON を読み込んで静的表示」で最低限機能する
- "リアルタイム" が必須になるのは **container の relation が頻繁に変わる編集セッション中** のみ

## 3. Risk Analysis（リスク評価）

### 3.1 Security リスク

| ID | リスク | 深刻度 | PoC の緩和策 | 残余リスク |
|----|--------|--------|-------------|-----------|
| S1 | payload 漏洩（body / metadata が外部に漏れる） | **高** | projection 必須 + closed allow-list + projector 層 | projector 実装バグ時に allow-list 外フィールドが通る可能性は排除できない |
| S2 | embedded=false で grant が成立する | **高** | `canHandleMessage` の boolean gate | gate 外の経路で handler に到達するコードパスが生まれないか要継続検証 |
| S3 | TTL 無視による無限購読 | **中** | `setTimeout` + registry 自動 close | timer の leak / cancellation 漏れ |
| S4 | postMessage 大量送出で host ハング | **中** | simple throttle（acceptance §2.7） | PoC ではバッチングなし → bulk import 時に N 件連射。host 側も対策必要 |
| S5 | 外部ツールが hook を same-origin injection に利用 | **低** | hook は read-only 通知。write 系 API なし | v2+ で write 系を入れない限り理論上安全 |

### 3.2 Complexity リスク

- **新規ファイル 3 本 + 既存 4 ファイル変更**: 量としては中規模。だが **transport 層のテスト surface が倍増** する
- subscription lifecycle（create / expire / close / source detach）のステートマシンは単純だが、テスト網羅にはエッジケースが多い
- DomainEvent → HookEventPayload の projection は「安全に動いている限り気にならないが、壊れると一番発見しにくい」性質

### 3.3 Maintenance リスク

- **hook event 型は外部契約**: 一度 merge すると v1 の間は形を変えられない。PKC2 内部のリファクタ時に「hook 契約を壊していないか」を常に検証する義務が発生する
- **DomainEvent 改修のたびに projector テストが必要**: 現在は DomainEvent を自由に変えられるが、hook を入れると「DomainEvent 変更 → projector で吸収 → hook 契約は不変」のチェーンが挟まる
- relation kind の追加・名前変更時に `HookRelationEventPayload.kind` の互換性判断が毎回発生

## 4. Architectural Impact（PKC2 の性格への影響）

### 4.1 本質的な問い

> **PKC2 は「閉じた知識容器」か、「外部とつながる OS」か？**

- hook subscription は PKC2 に **pub-sub 配信者** としての責務を持ち込む
- 今の PKC2 は「尋ねられたら答える」（request-response: export, record:offer, navigate）モデル
- hook を入れると「変化を自発的に外部に流す」（push-notification）モデルが加わる
- これは **PKC2 をツールからプラットフォームへ 1 歩進める** 行為

### 4.2 Platformization（プラットフォーム化）のスペクトラム

```
  閉じた容器  ←───────────────────────→  プラットフォーム
  (export/import のみ)                   (event bus / API / plugin)
        │                                       │
    ★今ここ                                     │
        │                                       │
        └── hook (PoC scope) ──┘                 │
                                                 │
                             trusted-origin / write API / plugin registry
```

- **PoC scope の hook は "容器寄りの push"** と見なせる（relation 限定・embedded 限定・read-only）
- しかし存在自体が「次の一歩」（entry event / write hook / plugin system）への足がかりになる
- 一度入れると「hook で○○もできるようにしたい」という拡張圧力が恒常的にかかる

### 4.3 PKC2 の design identity との整合

| 原則 | hook PoC の整合度 |
|------|------------------|
| 単一 HTML プロダクト | ✅ 変わらない（hook はプロトコル層のみ）|
| Container is source of truth | ✅ hook は notification であり source of truth ではない |
| 5-layer structure | ✅ core / features 無変更（acceptance P2-1） |
| No premature abstraction | ⚠️ subscription registry は「まだ要らない抽象」かもしれない |
| No backward-incompatible changes | ⚠️ hook 型は入れたら抜けない（外部契約化） |

### 4.4 結論
- hook PoC 自体は design identity を **破壊しない**（acceptance で縛り済み）
- ただし **"プラットフォーム方向のスイッチ"** であることは認識した上で判断すべき
- 今はスイッチを入れる必然性がない

## 5. Alternative Options（代替手段）

hook なしで同等のことを達成する手段は 3 つある。

### 5.1 Polling（定期問い合わせ）

外部ツールが `export:request` → `export:result` を定期送信し、container snapshot を丸ごと受け取って差分を自前で検出する。

| 項目 | 評価 |
|------|------|
| 実装コスト（PKC2 側） | **ゼロ**。既存 `export:request` がそのまま使える |
| 遅延 | polling 間隔に依存（e.g. 5 秒 → 最大 5 秒遅延） |
| 帯域効率 | **悪い**。変化なしでも full container が送られる |
| 外部ツール側コスト | 差分検出を自前実装する必要あり |
| セキュリティ | export:result の payload は既に公開範囲として accepted |

**判定**: PoC の前段として最も安全な代替。hook の必然性を先に検証するなら、**まず polling で Graph Tool を動かし、遅延が本当に問題か計測する** のが合理的。

### 5.2 Manual Export → Import

ユーザが「Export」ボタンを押し、出力 JSON を Graph Tool にドロップ / ペーストする。

| 項目 | 評価 |
|------|------|
| 実装コスト（PKC2 側） | **ゼロ**。既存 export 機能がそのまま使える |
| 遅延 | ユーザ操作分だけ（秒〜分） |
| 帯域効率 | 問題なし（user-initiated なので） |
| UX | 摩擦が高い。毎回手動操作 |
| セキュリティ | ユーザが意図的にデータを渡すので最も安全 |

**判定**: PoC 以前のベースライン。hook を正当化するには「手動 export では不十分」を実証する必要がある。

### 5.3 PKC-Extensions Only Approach

PKC2 本体にはイベント機構を追加せず、外部ツール側が PKC2 の HTML を拡張（MutationObserver / DOM 監視）して変化を検出する。

| 項目 | 評価 |
|------|------|
| 実装コスト（PKC2 側） | **ゼロ** |
| 遅延 | DOM 更新即時（MutationObserver は同期的に発火） |
| 安定性 | **脆弱**。PKC2 の DOM 構造変更で壊れる |
| セキュリティ | cross-origin iframe では MutationObserver が使えない |
| 外部ツール側コスト | 高い。DOM 構造への依存が契約なしで発生する |

**判定**: **非推奨**。PKC2 の内部構造を外部契約にすることは設計原則に反する。ただし「hook を入れない限りこの方向に誘導される」リスクは認識しておくべき。

### 5.4 代替案比較まとめ

| 手段 | PKC2 コスト | 遅延 | 安全性 | 推奨 |
|------|------------|------|--------|------|
| **hook (PoC)** | 中 | リアルタイム | 高（acceptance 制約下） | △ 時期尚早 |
| **polling** | **ゼロ** | 秒〜 | 高 | **◎ まずこれで検証** |
| **manual export** | **ゼロ** | 分 | 最高 | ○ ベースライン |
| **DOM 監視** | ゼロ | 即時 | 低 | ✕ 非推奨 |

## 6. Cost vs Benefit（コスト対効果）

### 6.1 Implementation Cost（相対見積もり）

| 項目 | 工数（相対） | 理由 |
|------|-------------|------|
| 新規コード（3 ファイル） | **M** | registry + projector + handler。各 100〜200 行程度 |
| 既存ファイル変更 | **S** | envelope / capability / bridge / main に追加行 |
| テスト（transport 単体） | **M** | lifecycle / TTL / projection / envelope / error path 各テスト |
| テスト（integration） | **M** | happy-path / reject / TTL-expire / source-detach / kill-switch |
| ドキュメント（v1 spec） | **S** | acceptance + PoC をベースにすでにほぼ書ける |
| dist ビルド差分確認 | **S** | bundle size 微増確認のみ |
| **合計** | **M〜L** | 単独 feature PR としては中〜大 |

S = 1h 以下, M = 数時間, L = 1 日以上（Claude / 人手問わず）

### 6.2 Ongoing Maintenance Cost

| 項目 | 頻度 | コスト |
|------|------|--------|
| DomainEvent 変更時の projector テスト更新 | relation 操作変更ごと | S |
| Relation model 拡張時の payload 互換性チェック | kind 追加等 | S |
| `KNOWN_TYPES` / `MESSAGE_RULES` の整合維持 | transport 変更ごと | S |
| Kill Switch 判断 | インシデント発生時 | M |
| 外部ツール側からの "もっと event 種類ほしい" 要求への対応 | 不定期 | **M〜L**（最大リスク） |

### 6.3 Expected Usage Frequency

- **Graph Tool 利用者**: 推定少数。PKC2 を embedded で運用している時点でテクニカル層のみ
- **relation 変更頻度**: container あたり数十〜数百回 / 編集セッション。burst は rare（bulk import 時のみ）
- **hook 購読頻度**: 多くても **同時 1〜2 本**（graph tool 1 つ + ダッシュボード 1 つ程度）

### 6.4 結論

| | hook (PoC) | polling |
|---|---|---|
| 初期コスト | M〜L | ゼロ |
| 継続コスト | S〜M / 変更ごと | ゼロ |
| 得られる体験向上 | リアルタイム（数十 ms） | 数秒遅延 |
| 利用者数 | 少数 | 少数 |

**コスト > ベネフィット（現時点では）**。リアルタイムの価値が polling の遅延で埋められないと実証されるまで、hook の必然性は確認できない。

## 7. Go / No-Go Criteria（判定チェックリスト）

### 7.1 Go の条件（すべて満たすこと）

- [ ] **G1**: acceptance contract §1 の全前提条件が満たされている
- [ ] **G2**: 外部ツール（Graph Tool 等）が polling で **動作しているプロトタイプ** が存在し、polling では解決できない UX 課題が具体的に特定されている
- [ ] **G3**: PKC2 の UX 強化フェーズの主要作業（unified backlinks v1 / entry autocomplete 完了 / relation kind 編集 UI）がすべて main に merge 済み
- [ ] **G4**: hook 実装にリソースを割いても他 feature 進行が阻害されない（並行可能）
- [x] **G5**: Non-Responsibility Boundary が acceptance contract に昇格済み（**acceptance §5 として 2026-04-20 に昇格、本条件は充足**。PoC §6.9 は以降 normative source を acceptance §5 に委譲した再掲）
- [ ] **G6**: projector テスト戦略が具体的に設計されている（「何を通し、何を通さないか」のテーブルテスト）

### 7.2 No-Go の条件（1 つでも該当すれば不可）

- [ ] **NG1**: acceptance contract の未改訂状態で実装 PR を出そうとしている
- [ ] **NG2**: polling ベースのプロトタイプが存在しない（hook の必然性が未検証）
- [ ] **NG3**: UX 強化フェーズが完了していない（リソース競合）
- [ ] **NG4**: DomainEvent 変更が直近で予定されている（projector 即座に壊れる）
- [ ] **NG5**: PKC2 の利用者数 / embedded 利用実態が不明（hook の受益者がいるか分からない）

### 7.3 Defer 条件（一時的な延期判断）

- 上記 Go の条件が「原理的に満たせるが今はまだ」の状態
- 典型: G2 / G3 / G4 が未達だが将来達する可能性がある → **Defer**

### 7.4 現時点のチェック結果

| ID | 条件 | 現状 | 判定 |
|----|------|------|------|
| G1 | acceptance 全前提 | PoC merge で概ね満たすが P1-2 (HookEventPayload spec) 未文書化 | ✕ |
| G2 | polling プロトタイプ | **存在しない** | ✕ |
| G3 | UX 強化フェーズ | unified backlinks v0 draft 段階。v1 未着手 | ✕ |
| G4 | リソース並行可能性 | 不明 | ✕ |
| G5 | Non-Responsibility Boundary 昇格 | PoC §6.9 にのみ存在 | ✕ |
| G6 | projector テスト設計 | 未着手 | ✕ |

**Go 条件: 0/6 達成。判定: No-Go (defer)**

## 8. Recommendation（最終推奨）

### 8.1 判定: **Defer（延期）**

### 8.2 理由

1. **必然性が未実証**: polling で Graph Tool を動かすプロトタイプがない。hook が polling に対して解決する具体的 UX 課題が不明
2. **時期が早い**: PKC2 は UX 爆発フェーズの途中（unified backlinks / autocomplete / kind 編集 / relation panel 改善）。拡張フェーズに入っていない
3. **コスト > ベネフィット（現時点）**: 継続的メンテコストに対して利用頻度が極めて低い
4. **不可逆性が高い**: hook 型を外部契約として公開すると v1 の間は形を変えられない。早すぎる公開は後方互換負債になる
5. **プラットフォーム化のスイッチ**: 今入れる理由がない段階でスイッチを入れるのは premature

### 8.3 Defer 期間中に維持すべきこと

| 対象 | 措置 |
|------|------|
| review doc | main に保持。stale でも remove しない |
| acceptance contract | main に保持。Non-Responsibility Boundary 昇格を follow-up PR で入れる |
| PoC design | main に保持。将来の実装 PR のスターティングポイントとして有効 |
| decision doc（本書） | main に保持。Go 条件チェックリストを定期的に再評価する |

### 8.4 Defer を解除するトリガー

以下の **すべて** が揃ったとき、本 decision doc を改訂して Go / No-Go を再判定する:

1. **polling ベースの Graph Tool プロトタイプが動いていて、polling では満たせない UX 要件が具体的に特定されている**
2. **unified backlinks v1 + relation kind 編集 UI が main に merge 済み**（UX 強化フェーズ完了の指標）
3. **PKC2 の embedded 利用実態が分かっている**（hook を受信しうる consumer が実在する）

### 8.5 推奨される次アクション（hook 以外）

hook 延期中にもっと効果が高いのは:

1. **Unified Backlinks v1 実装**（references umbrella パネル統合）
2. **Relation kind 編集 UI**（create 時の kind 選択 + edit）
3. **Graph Tool v0 を polling で構築** → hook の必然性を実証 or 不要を確定

特に **3** が重要: polling でも十分なら hook は永久に不要。polling が不十分ならその時点で decision doc を re-open する。

### 8.6 一行結論

**Hook subscription は技術的に実装可能だが、今は作るべきでない。Polling プロトタイプで必然性を実証してから改めて判断する。**

---

## 関連文書

- `docs/development/pkc-message-hook-subscription-review.md` — 提案レビュー（§3 の 5 懸念）
- `docs/development/pkc-message-hook-subscription-acceptance.md` — 受理条件（Go 条件 G1 の参照先）
- `docs/development/pkc-message-hook-subscription-poc.md` — PoC 設計（将来の実装スターティングポイント）
- `docs/development/unified-backlinks-v0-draft.md` — UX 強化フェーズの現地点
- `docs/development/backlink-badge-jump-v1.md` §6 — graph deferral 方針（本判断と整合）
