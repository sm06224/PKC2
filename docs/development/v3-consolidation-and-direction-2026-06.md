# PKC2 整理・方針集約(2026-06-06)— 単一アンカー

**Status**: 🟢 LIVE / **本書が現在地の単一正本**(2026-06-06 以降)
**役割**: 散らばった方針 doc(8案v3 / Phase β / 68PR Phase γ / roadmap CANDIDATE
/ ledger deferred)を 1 枚に集約し、**現在の user 意図に対して古くなった計画を
凍結 / supersede** する。「これだけ読めば現在地が分かる」状態を作るための anchor。
**前提**: 2026-06-02 user direction(PR #760 起源)+ 2026-06-06 user direction
(本 review session)。

---

## §0 なぜ本書を起こすか(1 段落)

PKC2 は「欲しい機能を足す」方向に振り切れた結果、**(a) open PR 50 件が一本 stack
化、(b) bundle.js が 1.87 MB → 5.08 MB に膨張、(c) 方針 doc が現在の user 意図と
乖離**、の 3 重肥大に陥った。user は 2026-06-02 / 06-06 で繰り返し
「**もう機能は足さない。デバッグと取捨選択と着陸だけやる**」と表明している。
本書はそれを唯一の運用前提として固定し、足す計画を全部凍結する。

---

## §1 診断(hard facts、2026-06-06 時点)

| 症状 | 実測 | 出典 |
|---|---|---|
| **ワヤ** = stack 肥大 | open PR **50 件がほぼ一本鎖**(#711→…→#758→main)| PR list |
| **もっさり** = bundle 肥大 | bundle.js **1874 KB → 5078 KB**(gzip 1882 KB)、約 2.7× | PR #760 build |
| 計算量対策は別途 stack 内 | perf wave **#711–#728**(entryByLid Map / memoize / lazy / WeakMap)が stack に埋没し未着地 | PR list |
| **方針乖離** | docs は「68 PR 足す」(Phase γ)、user 意図は「削る/選る」| 本書 §2 |
| doc 肥大 | `docs/**` **447 md**(archived 103 / dev top-level 128)、INDEX が changelog 散文化 | repo |

**根本原因**: CLAUDE.md の儀式過積載(visual parity / case matrix 10件 / 8項目自己監査
/ 3 surface verify / CHANGELOG / INDEX 登録 / 分岐ごと 4 doc grep)で 1 PR の着地が
高コスト化 → 着地せず stack に逃げる → Wave §1「30–50 で打ち止め」を本人が破る、の悪循環。
**プロセスの肥大が code/doc の肥大を生んでいる**。

---

## §2 凍結 / supersede 表

以下は **本書により凍結**(= 当面着手しない、参照のみ historical)。再開には user の
明示 go が要る。各 doc の冒頭にも本書への supersede note を入れる(段階実施)。

| 凍結対象 | 旧 status | 本書での扱い |
|---|---|---|
| `v3-architecture-proposals-2026-05-18.md`(8案)| LIVE 提案 | 🔒 **凍結**。Group D(canvas+wasm)以外は「削る/選る」と両立しないため棚上げ。実機評価で残った案のみ将来再評価 |
| `phase-beta-plan-2026-05-19.md` + Group A/B/C spec + Phase γ wave map(68 PR)| LIVE 設計 wave | 🔒 **凍結**。足す計画。**Group A の sidebar filer 化 / AI tab は user が 06-02 で却下済**(PR #760 で除外)|
| roadmap `feature-requests-2026-04-28-roadmap.md` CANDIDATE 群 | live tracking | 🔁 **GitHub Issues へ移行**(§5)。markdown は移行後 archive |
| `USER_REQUEST_LEDGER.md` §3.6 deferred | live tracking | 🔁 同上 |
| INDEX CANDIDATE / 保留節 | live tracking | 🔁 同上 |

**凍結しないもの**: perf wave(#711–#728)= もっさり対策、着陸候補として最優先で活かす。

---

## §3 プライム・ディレクティブ(当面の唯一の運用前提)

> **機能を足さない。削る・選る・着陸させる。**

- 🚫 新 archetype / 新 feature / 新 markdown 方言 / 新 UI mode の **追加 PR 凍結**
- ✅ 許可: ① bug fix、② perf、③ bundle 引き算(機能 subtract)、④ main 着陸の取捨選択、
  ⑤ doc / process 整理、⑥ §4 の設計 doc(実装はしない)
- user が「これは足したい」と言い出したら、Claude 側は **本書 §3 を引いて一旦止め、
  Issue 化して優先度判断に回す**(user 自己申告「考え始めると機能が溢れる」への先回り)

---

## §4 North Star(設計高度のみ、実装は未コミット)

user 提示の長期像(2026-06-06)。**現時点では設計 doc 化までで止め、実装は §3 の凍結下**。
着手は「足す」ではなく「コア構成を組み替えて、機能を逃がす器を作る」ものとして、
プライム・ディレクティブと両立する範囲で順次設計する。

1. **コアを薄く** — 基本機能をシンプルに抑える
2. **ランチャー + PKC-Extensions** — 多機能を core から退避させる器(launcher view は既存、
   Extension host は未実装 = 新規設計)
3. **OPFS をコアに / idb はブラウザ専用レガシーモード** — `storage-adapter.ts` は既に
   `opfs-adapter.ts`(未実装)を構造的に予約済。土台あり
4. **workspace 概念の導入** — 現 `BucketName='containers'|'assets'` 固定を workspace 軸へ拡張
5. **コンテナ化の分離** — container 化と workspace を別レイヤに

これらは **L3 レーン**(§6)で 1 枚の設計 doc に落とす。実装 go は別途 user 判断。

---

## §5 GitHub Issues 移行 + doc すっきり方針

user 要望: **ファイルベース issue 管理 → GitHub Issues**、doc をすっきり。

**移行方針**:
- live tracking(roadmap CANDIDATE / ledger §3.6 deferred / INDEX 保留節)を
  **少数の整理された GitHub Issue** に変換。label 体系(案):
  `lane:perf` / `lane:curation` / `lane:arch-v3` / `lane:process` /
  `type:bug` / `type:debt` / `frozen`(= §2 凍結、参照のみ)
- 変換後、markdown tracker は `docs/**/archived/` へ移動(live 件数削減)
- 以後の live tracking は **GitHub Issues が正本**、markdown は設計 doc(不変な仕様)のみ残す

**doc archive 候補**(移行完了後):roadmap / ledger の live 部 / INDEX CANDIDATE 節 /
凍結した Phase β・γ 一式。

---

## §6 4 レーン(Claude が回す、user は判断)

| レーン | 内容 | 成果物 | 状態 |
|---|---|---|---|
| **L1 もっさり / 着陸** | perf wave(#711–728)を feature と切り離し main へ通す道筋 + #760 の bundle 5MB を機能単位で「何を削れば戻るか」棚卸し | 申し送りプロンプト + 引き算 audit | 次着手 |
| **L2 curation / subtract** | #760 から不要機能を subtract(取捨選択)、実機評価で残す/捨てる仕分け | subtract PR 群の handoff | L1 後 |
| **L3 arch v3 設計** | §4 North Star を 1 枚の設計 doc 化(OPFS/extensions/workspace/container)。実装はしない | 設計 doc | 並行可 |
| **L4 process** | GitHub Issues 移行(§5)+ CLAUDE.md スリム化(儀式削減・stack 上限強制・bundle 予算優先)| Issues + CLAUDE.md rewrite | 並行可 |

---

## §7 役割契約(2026-06-06 確認)

- **user(統括)**: 優先度判断、merge 判断、機能の go/no-go。「考え始めると機能が溢れる」ため、
  落ち着くまで着手対象の選定を Claude に委任(2026-06-06)
- **Claude(レビュアー / 設計)**: 診断・設計・**実装担当への申し送りプロンプト作成**。
  code の直接実装と PR close は user 判断に委ね、prompt と plan を作る
- **実装担当**: 申し送りプロンプトを受領して実装

---

## §8 history

| date | event |
|---|---|
| 2026-06-02 | user direction(PR #760 起源):AI tab / filer 入替 / header sizing 却下、「デバッグと取捨選択だけ」表明、rollup #760 を main 着地 vehicle に |
| 2026-06-06 | user review session:「機能どれもイマイチ / もっさり / 肥大化」+ North Star(OPFS/extensions/workspace/container 分離)提示。Claude が 50 PR stack + bundle 2.7× + docs 乖離を診断、本書で集約・凍結 |
