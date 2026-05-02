# Debug Privacy Philosophy(PKC2 のデバッグ・プライバシー哲学)

**Status**: 設計 doc(2026-05-02、reform-2026-05 段階 β 着手前に landing)
**Owner**: PKC2 reform-2026-05、`debug-via-url-flag-protocol.md` の上位規約
**前提**: PR #207(reform docs)+ PR #209(段階 α 実装)で「ユーザー報告導線」と「Report dump」の枠組が landing 済。本 doc はその上位の **PKC2 として「ユーザー content をどう扱うか」** の判断基準を明文化する。

---

## 1. なぜ哲学を先に置くか

debug 機能は**最も間違えやすい場所**で privacy を扱う。失敗は致命的だが、CLAUDE.md「test pass = ship 禁止」原則を Adopt する以上、判断基準は code 側ではなく**doc 側**で先に固定しておく必要がある。

> 機能 PR の review が「設計合意済みの仕様への適合」だけで済むようにする。

哲学が code PR の不具合と同 PR で倒れる事態を防ぎ、reform-2026-05 全体(段階 β / γ / δ)と将来の implementer(Gemini 等)が同じ判断基準で動けるようにする。

---

## 2. 業界の現代潮流(2020 年代後半)

PKC2 が同居する大きな潮流を確認しておく。設計判断はこの線上で行う。

### 2-1. 「Privacy by default、観測は構造のみ」へシフト

2010 年代の telemetry は「全部収集、サーバ側で sanitize」が主流だった。GDPR(2018) / CCPA(2020)以降、**data minimization 原則** が業界標準となった:

| System | デフォルト挙動 |
|---|---|
| Sentry | `sendDefaultPii: false`、stack values は自動 `[Filtered]` |
| DataDog RUM | `defaultPrivacyLevel: 'mask'`、入力欄は `*****` |
| OpenTelemetry | span attribute に PII を入れない方針、`processor` で別途 scrub |
| Apple Crash Reports | "Share with Developer" を**毎回** opt-in 確認 |
| Microsoft Defender | Basic / Enhanced / Full の 3 段階を user が選ぶ |

共通点: **デフォルトは構造のみ、コンテンツは「明示的に user が選んだとき」だけ**。

### 2-2. 「graduated consent(段階的同意)」

all-or-nothing flag ではなく、**詳細度を user が level として選ぶ**:

- Level 0: 構造のみ(action 種類、UA、phase、件数)
- Level 1: 構造 + 識別子(lid、relation 種類、archetype 等の enum)
- Level 2: + 内容(title / body / asset、ただし user が paste 前に視認可能)

UI 例: macOS の "Send detailed reports?"、Firefox Telemetry の Standard / Strict、ChatGPT の "Improve the model" toggle。

### 2-3. 「local-first observability」という新しいカテゴリ

local-first software(Ink & Switch 提唱、2019)の流れで、**ユーザー端末を出ない debug データ** が新しい設計クラスとして登場した:

- Logseq / Obsidian: 自動 telemetry なし、手動 export のみ
- Tauri: 既定で network 経由 telemetry 無効
- Local-First Web Apps(Tinybase / Replicache 等): 観測は手元、送信は user 操作

PKC2 はすでに**この形(clipboard 経由で user が能動的に paste)**を採っているため、業界の最先端ラインに既に乗っている。

### 2-4. schema は versioned protocol

Sentry / OTel / Cloud Logging の schema は **additive-only**。古い consumer が新しい dump を読んでも壊れない。schema version field を必ず置く。

PR #209 で `schema: 1` を入れたのは正解で、本 doc はそこに version 進化規律を加える。

---

## 3. PKC2 固有の制約と利点

| 性質 | 含意 |
|---|---|
| **Local-first**(single-HTML、サーバなし) | 自動 upload リスクがそもそもゼロ。user が paste しない限り何も送られない。**業界の最大課題(誰がデータを持つか)を構造的に解決済**。 |
| **entries は機密文書たりうる** | 個人 journal、認証情報メモ、業務秘密。**body / title が無造作に流れる事態は致命的**。 |
| **clipboard 経由 paste** | user は paste 前に「何を貼るか」を見れる(前提)。だが現状 α は JSON が長すぎて目視 sanitize 困難 → preview UI が必要(段階 γ 以降)。 |
| **2 名 → 多名体制移行中** | debug data の宛先は限定的だが、**仕様としての privacy 担保**は外部 implementer 受け入れに備えて必要。 |

---

## 4. PKC2 Debug Privacy Philosophy(4 原則)

以下を **PKC2 の Debug Privacy Philosophy** として確定する。reform-2026-05 全体 + 将来の debug 機能拡張がこれに従う。

### 原則 1. Local-only by construction

**debug データは user の端末を出る経路を持たない**。

- upload / fetch / WebSocket / IndexedDB 自動同期 etc は debug 機能から永遠に禁止
- 出力は clipboard / fallback modal / `download` 属性付き anchor のみ(すべて user の明示操作が必要)
- production telemetry / analytics / error tracking が**追加で必要になった場合は別の機能**として設計し、debug 機能とは独立した opt-in を取る

これは **non-goal** として `debug-via-url-flag-protocol.md` §9 にも記載済(本 doc で再確認)。

### 原則 2. Privacy by default(structural-only)

**flag を立てた default 挙動でも user content は混入しない**。

「見える化」の対象は次に限定:
- 構造: action 順序、phase、view mode、件数
- 識別子: lid、relation の from/to lid
- 列挙: archetype 名、relation kind、theme name 等の有限集合
- 環境: UA、viewport、pointer.coarse、URL(flag 自身は OK)

含めないもの:
- entry の title / body
- asset の base64 data
- ユーザーが入力した検索クエリ / コメント / フォーム値
- relation の自由文 metadata

### 原則 3. Graduated opt-in for content

content を含めたい場合、**追加の URL flag を user が明示的に typing したときのみ**有効化する。

仕様(段階 β で実装):

| Flag 組合せ | level | 内容 |
|---|---|---|
| (なし) | (off) | debug 機能 OFF、ボタンも出ない |
| `?pkc-debug=<features>` | `structural` | overlay + Report、構造のみ |
| `+ &pkc-debug-record=1` | `structural` | + dispatch ring buffer(action 種類 + lid のみ) |
| `+ &pkc-debug-contents=1` | `content` | + content 込み(title / body / assets full) |

- `pkc-debug-contents` は明示性を最大化(typo で立つ可能性ゼロ、文字列が長い)
- Report に **`level` field と `contentsIncluded: boolean`** を必ず立て、user が paste 前に視認できるようにする
- 段階 γ 以降の preview modal で `level === 'content'` のとき**赤色警告**を出す(将来計画)

### 原則 4. Schema is a versioned protocol

`DebugReport.schema: N` の進化は **additive only**。

ルール:
- schema field は必ず最初に出る number
- bump は実装者が「内容を追加したい」とき。**既存フィールドの意味を変えるなら別 field 名で追加**
- 旧 consumer は不明 field を無視してそのまま動く forward-compat を維持
- bump 時は本 doc または `debug-via-url-flag-protocol.md` に migration note を追加

| schema | landing | 追加内容 |
|---|---|---|
| 1 | PR #209(段階 α) | env + phase + view + selection + container counts |
| 2 | PR #211 first round(段階 β) | + level + contentsIncluded + recent[] |
| 3 | PR #211 finalize(段階 β) | + pkc.commit + storage + container.{schemaVersion, archetypeCounts} + recent[].seq + recent[].durMs + errors[] + replay(content-only) + truncatedCounts |
| 4 | 段階 γ 以降(予定) | + feature.* + screenshot + DOM snapshot(opt-in) |

---

## 5. 実装上の哲学的選択

### 5-1. redact せず「拾わないか、全部出すか」の二択

業界主流(Sentry 等)は「全コピーしてから sensitive キーを redact」。これは PKC2 では**採らない**。理由:

- 新しい action / 新しい sensitive field が追加された瞬間に redact 漏れリスクが顕在化
- "test pass = ship 禁止"原則(CLAUDE.md)に照らすと、redact 戦略は**漏洩テストでカバーしきれない部分が常に残る**
- PKC2 は単一 HTML、コードベース可視。redact しなくても「拾わない」なら型レベルで保証できる

代わりに採る方針:
- structural mode: **allowlist**(`{ type, lid?, ts }` のみ拾う)、新 action は型 exhaustive check で **compile time に検出**
- content mode: **full payload を変えずにそのまま記録**(redact しない)— user が opt-in したのでそれでよい

これにより「中途半端な redact による偶然の漏洩」が起こり得ない構造になる。

### 5-2. Report に level / contentsIncluded を**明示的に**載せる

`flags: ['*', 'record', 'contents']` のようなフラグ列だけだと user が見落とす可能性がある。**専用 field**で:

```jsonc
{
  "schema": 2,
  "level": "structural",      // 'structural' | 'content'
  "contentsIncluded": false,  // boolean、structural=false / content=true
  ...
}
```

これは将来 paste preview modal が `level === 'content'` を見て大きく警告するための contract でもある。

### 5-3. localStorage 永続化の規律

`pkc2.debug` localStorage key は URL flag を local 永続化するためのものだが、**`pkc-debug-contents=1` も同じ仕組みで永続化できてしまう**。これは:

- Pro: PWA / 開発端末で毎回 typing しなくて済む
- Con: 知らないうちに content mode のまま session が継続するリスク

**判断**: 永続化は許可するが、**boot 時に `localStorage.pkc2.debug` から `contents` を読んだ場合は console.warn を必ず出す**。user environment でなぜか content mode が続いていることを認知できるようにする。段階 γ 以降の preview modal でも視覚的に表示する。

### 5-4. Every field justifies itself by debugging workflow value

PR #211 finalize(2026-05-02)で確立した **field 採否基準**:

> **新フィールドの審査基準**: そのフィールドが**欠けていたら**、開発者が "I wish I had X" と思う bug カテゴリが具体的に存在するか?Yes なら入れる。No なら入れない。

理由 — debug report は「**user が献身的に再現してくれた一回のクリック**」を「**開発者が actionable に fix できる情報**」へ変換する装置。fill rate(field の埋まる割合)や見栄え(完全感)は判断基準ではなく、**workflow 価値**だけが基準。

具体的な適用例(PR #211 finalize 時):

| 採否 | フィールド | 想定 bug カテゴリ |
|---|---|---|
| ✓ | `errors[]` + stack + `lastSeq` | crash 系 — stack なしでは原因到達不能 |
| ✓ | `pkc.commit` | dev build identification — version だけだと曖昧 |
| ✓ | `recent[].durMs` | "X が遅い / freeze" — duration なしでは perf bug 報告に手が出ない |
| ✓ | `env.storage` | quota 系 — IDB local-first PKC では常連 |
| ✓ | `container.schemaVersion` | migration 後にだけ起こるバグ |
| ✓ | `container.archetypeCounts` | "todo N 件以上で再現" 型 — fixture 構築の指針 |
| ✓ | `replay.initialContainer`(content mode) | 完全決定論 replay の seed |
| ❌ | `container.titlesHash` | 複数 user 報告の相関機能 — PKC2 現 scale(2 名)ではペイしない |

**判断手続き**: 新フィールド追加の PR では、対応する bug カテゴリ(可能なら過去報告 issue)を明記すること。「あったら役立つかも」は不採用理由となる。

### 5-5. Replay opt-in:なぜ content mode に内包したか

`replay.initialContainer` は content mode で**自動的に**有効化(別 flag を分けない)。理由:

- `?pkc-debug-contents=1` を立てた user は「この container を見せて debug してほしい」と意思表示済 → 同じ container の initial snapshot を焼くのに**追加同意は不要**
- replay flag を別に分けると "structural + replay-only" のような中間 mode が生まれ、graduated opt-in 構造が壊れる
- replay の前提となる **reducer 純粋性** は contract-level で重要であり、`tests/core/replay-determinism.test.ts` で固定する。この test が破れた瞬間に replay の約束は嘘になるため、**test ファイルの存在自体が design 上の責任**

サイズ上限: `applyTotalSizeCap`(1 MiB)で `replay` を**最初に**落とす truncation 順位。理由 — replay は便利だが unique な fix 必要情報ではない(代替手段あり)、対して errors[] / recent[] は欠けると価値が大きく落ちる。

---

## 6. なぜこの形が PKC2 にとって最強か

- **Local-first の構造的安全性をフル活用**: upload 経路がそもそもないので、content opt-in しても外部漏洩リスクはゼロ。業界標準より厳しい
- **「拾わないか、全部出すか」の二択で漏れの中間がない**: redact 戦略の検証負債を構造的に消す
- **未来の機能(段階 γ の screenshot / DOM snapshot、δ の feature overlay)も同じ階層構造に乗る**: `level` / `contentsIncluded` 一つで全 layer が揃って動く
- **doc 化することで Gemini 等の将来 implementer が同じ哲学で実装可能**(reform-2026-05 §「2 名 → 多名体制」の準備)
- **CLAUDE.md「test pass = ship 禁止」原則と合致**: 「拾わない」は test で 100% 検証可能(JSON 全文 grep で漏洩 guard)

---

## 7. 具体的な adoption(段階 β PR で実装する内容)

本 doc が landing した後の段階 β PR で:

1. `src/runtime/debug-flags.ts`:
   - `RecentEvent` 型 = `{ kind: 'dispatch'; type: string; lid?: string; ts: string; content?: { ... } }`
   - `recordDebugEvent(event)` ring buffer(max 100、FIFO)
   - `isRecordingEnabled()` / `isContentModeEnabled()`
   - `DebugReport` を schema 2 に拡張: `level` / `contentsIncluded` / `recent` を additive 追加

2. `src/adapter/state/dispatcher.ts`:
   - `dispatch()` の中で `if (isRecordingEnabled()) recordDebugEvent({...})` の 1 行
   - allowlist は型 exhaustive check で強制(`extractRecordableFields(action)` が action を switch、漏れたら compile error)

3. `src/adapter/ui/debug-report.ts`:
   - `recent: readDebugEvents()` を Report に詰める
   - `level` / `contentsIncluded` を flag 状態から決定

4. テスト:
   - structural mode で content が ring buffer に**絶対に入らないこと**を JSON 全文 grep で確認
   - content mode で明示的に opt-in したときだけ payload が含まれること
   - schema 1 → 2 の forward-compat(旧 consumer が新 dump を壊さず読めること)
   - localStorage で `contents` を読んだとき `console.warn` 出ること

5. `docs/development/debug-via-url-flag-protocol.md` §5.4 を本 doc 参照に更新済(本 PR で同時更新)

---

## 8. 非ゴール(将来も追加しない)

- **production telemetry / analytics**: debug 機能は debug。観測は user の意志で paste されたときだけ
- **自動 upload / 自動 issue 起票**: 原則 1 違反
- **部分 redact 戦略**: 原則 5-1 違反、検証負債が残る
- **silent content mode**: content mode は必ず Report 上に明示

---

## 9. 関連 doc

- `docs/development/debug-via-url-flag-protocol.md` — URL flag / Report dump の具体仕様
- `docs/development/visual-state-parity-testing.md` — debug overlay を test 観点でどう活用するか
- `docs/development/pr-206-paused.md` — 仕切り直し起点
- `docs/development/handover-2026-05-01.md` — reform-2026-05 全体経緯
- `CLAUDE.md` — 「描画と生成は別物 ─ test pass = ship 禁止」「Specification Documents」index

本 doc は将来の debug feature 拡張の判断基準として live document 扱いとし、bump / 修正は dedicated PR で行う(機能 PR と混在させない)。
