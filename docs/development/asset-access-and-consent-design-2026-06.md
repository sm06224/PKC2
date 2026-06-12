# 拡張へのデータ受け渡しモデル 設計 — #806 × #796(2026-06-11、rev.2)

**Status**: 設計 doc。**実装はプライム・ディレクティブ下で凍結 — go は user 判断**
**Issues**: #806(asset 経路 — SR-13/14/15)/ #796(封じ込め)/ #795(transport 基盤、着地済み)
**前提 doc**: `pkc-extension-containment-design-2026-06.md`(#796 sandbox)/ `pkc-message-api-v1.md` §6(storage boundary)/ `pkc-message-api-v2.md` §3
**改訂**: 同日 rev.1 の **pull 型(拡張が `asset:request` で要求 → 毎回 consent banner)** は、user direction(2026-06-11)により **host 主体の push 型**へ全面差し替え。rev.1 の consent-fatigue 弱点を構造的に解消する。

---

## 0. 設計原理(host direction 2026-06-11)

1. **既定の露出は projection だけ**。PKC はコンテナ丸ごとを既定では渡さない。拡張に既定で見せるのは **汎用 index / list / 統計**(= `GraphProjection`(#790)の一般化:メタのみ、body/assets/revisions を含まない)。
2. **実体(asset / entry 本文)の受け渡しは host 主体の明示ジェスチャ**。ユーザーが右クリック等で「この拡張へ送る」を選ぶ、または「既定送り先拡張」を事前設定する。**送る行為そのものが同意**(意図と consent が融合 = consent-fatigue が起きない)。
3. **オプトインは紐付け(導入)で成立**。graph は「ユーザーが自分で起動する」ことがオプトイン(projection のみ)。asset/entry を欲しがる拡張は「ユーザーが紐付けて導入する」ことがオプトイン契約。

> rev.1 の核心的誤り = **矢印の向き**。拡張が pull する設計は consent を per-request banner に押し込み、高頻度 read で banner が形骸化する。push 型は「ユーザーが送らない限り何も出ない」ので、idle / 侵害された拡張が探りを入れる経路自体が無い。

## 1. 解く問題(実証済みブロッカー)

v1 で拡張が触れられるのは projection 系のみで、**実体に触れる正規経路が無い**:
- **読み**: 任意 entry/asset の read API 無し(`export:request` は container 全文一括のみ。これは embed/parent 全エクスポート用で残すが、拡張向けの常用経路ではない)
- **書き**: offer への asset 同送は §6.3 で意図的禁止 → asset 付き attachment offer は中身が空

結果、高度な viewer / editor(添付ビューア類)が機能不能。本書はこれを **host-push** で解く。

## 2. 信頼 3 tier(オプトインの強度に対応)

| tier | オプトインの成立条件 | 拡張が得るもの | 例 |
|---|---|---|---|
| **T0 起動 viewer** | ユーザーが**自分で起動**(launch = opt-in) | projection のみ(index/list/統計)。**実体は受け取らない** | graph(#790)— **特殊事例**。projection で完結 |
| **T1 紐付け受信** | ユーザーが**紐付けて導入**(bind = 標準 opt-in 契約) | projection + **ユーザーが send したもの**(asset/entry の実体) | PDF / docx / 画像 viewer |
| **T2 io権(editor)** | T1 + **書き戻し権限の付与**(最も重い別 grant) | T1 + **検証付き書き戻しチャネル** | エディタ系 |

- **graph は T0 に固定**。launch=opt-in / projection-only を T0 として明文化し、「起動した拡張は asset を pull できる」という抜け穴に発展させない。graph は asset を一切要求しない。
- T1/T2 の拡張は **紐付け(導入)時にオプトイン**。紐付け = 「この拡張は、あなたが送ったものを受け取れる」という standing contract。

## 3. 受け渡し機構(host 主体)

### 3.1 ジェスチャ(consent = この操作)

- **右クリック → 「拡張へ送る」→ 送り先選択**(紐付け済み拡張のリスト)。または
- **既定送り先拡張を事前設定**(archetype / mime 別。例:`.pdf` は既定で pdf-viewer へ)。設定済みなら右クリック→「○○で開く」一発

どちらも **host が発火点**。拡張は「送れ」と命令できない。送られるまで実体は host 内に留まる。

### 3.2 wire(host → extension の push)

rev.1 の pull 型 `asset:request`(拡張発)を廃し、**host 発の deliver** を一次経路にする:

| type | 方向 | payload | 用途 |
|---|---|---|---|
| `pkc:projection` | host → ext | index/list/統計(メタのみ) | T0/T1/T2 既定。起動/紐付け時に push |
| `pkc:deliver` | host → ext | `{ kind:'asset'|'entry', key/lid, mime?, filename?, data_base64?/body?, correlation_id? }` | 送付ジェスチャで実体を 1 件 push(T1/T2) |
| `pkc:write` | ext → host | `{ lid?, ops:[...], correlation_id? }` | T2 の書き戻し。**host が全 op を検証**してから dispatch |
| `pkc:write-result` | host → ext | `{ ok, correlation_id?, reason? }` | 書き戻しの成否 |

- 拡張が「item Y が欲しい」を**示唆**することは許す(UI ヒント)が、**pull は不可**。host が send 導線を提示するに留め、実際に流れるのはユーザーの send ジェスチャ後のみ。
- `correlation_id` は #804 の相関トークンを流用。

### 3.3 マルチ送付

「多数を渡したい」は **host 側 multi-select → まとめて send**(拡張側 enumerate-then-pull ではない)。breadth は projection で navigate、depth は host-push で渡す。

## 4. 店主判断で足す関門(ジェスチャでは自動で埋まらない穴)

1. **G1 — 渡した後の封じ込めは #796 の担当**。send は「何を・いつ」を制御するが、渡したバイトを拡張がどう扱うかは sandbox(opaque origin / postMessage 唯一通路)が握る。push 型と封じ込めは**相補**(代替ではない)。T1/T2 拡張は #796 の sandbox 上で動かす。
2. **G2 — io権(T2)は viewer の上位の別 grant**。viewer(T1)は片方向コピーで完結。editor(T2)は `pkc:write` を**既存 data-safe パターン(`moveEntryToFolder`/`relateEntries` = 検証+dispatch+永続化)で必ず検証**してから適用。host は拡張の write を決して無検証適用しない。push モデルは「entry E を editor X に渡した」を host が知っているので、E への write-back の相関検証が容易。
3. **G3 — 紐付け時開示 + 既定送り先の可視性**。紐付け(導入)時に「この拡張は send したものを受け取れる」を明示(= per-bind 開示が per-request banner を置換)。既定送り先は設定 UI で**一覧・変更・取消**可能(set-and-forget で全 send が黙って 1 拡張に流れるのを防ぐ)。
4. **G4 — deliver の targetOrigin pin 必須**。`pkc:deliver` の asset payload は base64 全文 = 機微。`pinTargetOrigin(対象 window origin)`(#797)で受け取り窓に固定。B-1 `onTraffic`(#807)で deliver/write を観測、payload preview は base64 自動 redaction(spec §Observability)。

## 5. コスト(正直な評価)

- **host UI 増**: 「拡張へ送る」右クリック導線 + 既定送り先設定。プライム・ディレクティブとの緊張はあるが、**rev.1 の pull+banner 機構を置換する**ものでネット増ではない。新 UI mode ではなく既存 context-menu / settings への項目追加に収める。
- **拡張の自律性低下**: 拡張は欲しい実体を勝手に取れない。viewer/editor には適合(ユーザーが対象を選んで開く自然な流れ)。composition 重視の拡張は projection で navigate して必要分を送ってもらう degrade で吸収。これは**意図した制約**(攻撃面の縮小)。

## 6. SR-13/14 の位置づけ

- **SR-14(`record:offer` に mime_type / filename)= consent 非依存の純 additive** → #805 と同枠で**先行 go 可能**(本モデルの凍結とは独立)。`pkc:deliver` の `mime?/filename?` とも整合。
- **SR-13(attachment offer に asset を伴う書き)= asset 書き方向**。本モデルでは「ユーザーが host 側で attachment を作る/送る」で代替できる可能性が高く、拡張発の asset 書き込みは T2 の `pkc:write` 経由に寄せる。SR-13 単独の必要性は実装設計で再評価。

## 7. パイロット順(変わらず妥当)

1. **graph(T0)**= projection-only + #796 sandbox 化を先行実証(asset 不要なので consent UI 抜きで sandbox/identity 改修を検証)
2. **単純 viewer(T1、例 pdf)**= 紐付け + 右クリック send + `pkc:deliver` の最小実証
3. **editor(T2)**= `pkc:write` の検証書き戻し

## 8. 実装順(go 後、各独立 PR)

1. **SR-14**(mime/filename additive)— consent 非依存、即着手可
2. **projection 一般化**(`pkc:projection`、GraphProjection を汎用化)
3. **送付導線**(右クリック「拡張へ送る」+ 紐付けレジストリ + 既定送り先設定)
4. **`pkc:deliver`**(T1 viewer 経路、targetOrigin pin + B-1 観測)
5. **graph の T0/sandbox 化**(#796 + #791)
6. **`pkc:write`**(T2 editor、検証書き戻し)

## 9. 判断事項(user 確認待ち)

- **D-1**: 信頼 3 tier(T0 起動/T1 紐付け受信/T2 io権)+ host-push 受け渡しで確定してよいか
- **D-2**: 受け渡し導線 = 右クリック「拡張へ送る」+ archetype/mime 別の既定送り先設定、で良いか
- **D-3**: SR-14 を本凍結から外して先行実装 go してよいか
- **D-4**: パイロット順(graph T0 → pdf T1 → editor T2)で良いか
- **D-5**: 実装 go の出し方(§8 を一括 / 段階)

## 関連

- 封じ込め: [`pkc-extension-containment-design-2026-06.md`](./pkc-extension-containment-design-2026-06.md)
- transport 基盤: [`transport-hardening-and-observability-design-2026-06.md`](./transport-hardening-and-observability-design-2026-06.md)
- INDEX: [`INDEX.md`](./INDEX.md)
