# AI 整理プラン連携の自動化 — pkc-ext structure チャネル設計(2026-07)

> 改善バッチ⑤(user 承認 2026-07-12「推奨順で全部」、ただし**実装前に設計を
> user に提示する**約束のもの)。
>
> **status: user go(2026-07-13「あなたのAI設計でよし」)→ 実装済み**。
> normative は `docs/spec/pkc-message-api-v2.md` §3.8(`structure` /
> `structure-plan` / `structure-plan-result`)。送付ジェスチャはコマンド
> パレット「構成を拡張へ送る(AI 整理プラン連携)」。

## 0. 背景 / 目的

#905/#911 で「構成 export(DSL 語彙説明つき)→ AI がコマンド列を書く →
plan モーダルで dry-run 確認 → 適用」の**手動ラウンドトリップ**が完成した。
user の原要望は「この独自コマンド体験を露出して、AI に整理プランを考えさせ
たい」— 次の段階は **コピペを介さない自動化**:AI を載せた PKC-Extension が
構成を受け取り、整理プランを host に提案し、user が確認して適用する。

## 1. 設計原則(既存体系への整合)

- **host-push 体系(#806/#796)に従う**:拡張から実体を pull する経路は
  作らない。構成情報は host が push、プランは「提案」として ext→host。
- **silent apply は無い**:`propose` → 同意 banner と同じ哲学で、
  `structure-plan` → **既存 structure-plan-modal**(dry-run プレビュー +
  user 確認)に流す。適用ボタンを押すのは常に user。
- **データ最小化**:構成 export text は projection と同じメタ範囲
  (lid / title / archetype / 階層)で body を含まない。新たな露出は増えない。
- **AI 本体はコアに入れない**(#772 core-thin):API key 管理・外部通信は
  拡張側(PKC2-Extensions)の責務。コアは「構成を渡す/プランを受ける」
  チャネルだけ持つ。

## 2. プロトコル追加(pkc-ext v1 に additive)

| 方向 | t | payload | 意味 |
|---|---|---|---|
| host → ext | `structure` | `{ text }` | 構成 export text(`exportStructureText` と同一 = DSL 語彙説明つき)。**user の送付ジェスチャでのみ**送る(deliver と同格の明示操作) |
| ext → host | `structure-plan` | `{ text, correlation_id? }` | 整理プラン(DSL コマンド列)の提案 |
| host → ext | `structure-plan-result` | `{ status: 'applied' \| 'rejected' \| 'dismissed', applied?, errors?, correlation_id }` | 結果通知 |

- `structure` は projection に**含めない**(projection は自動再送されるため。
  構成 text はプロンプト資産 = 明示ジェスチャで渡す方が deliver の哲学に合う。
  なお拡張は既存 projection の folder/relations から自力で木を組むこともできる
  ので、露出情報としては増えていない — 形式の提供だけ)。
- `structure-plan` の処理:host は `parseStructureCommands` + `planStructureOps`
  で検証し、**structure-plan-modal を提案 text 入りで開く**。
  - parse/plan エラーがあってもモーダルは開く(エラー表示は既存 UI がやる。
    拡張へは `rejected` + errors を返す選択肢もあるが、v1 は「user が見て
    直せる」方を優先)
  - user が適用 → `applied`(適用 op 数付き)/ 閉じた → `dismissed`
- ガード:readonly 時は即 `rejected`。pending plan は同時 1 件(前の提案が
  未処理のうちは後続を `rejected`)。text 上限 64KB。Tier S のまま新
  capability 不要(postMessage のみ)。

## 3. 実装スコープ見積り(go 後)

1. `extension-channel.ts`:`onStructurePlan` option + `sendStructure` /
   `notifyStructurePlanResult` handle メソッド(±80 行)
2. orchestrator(extension 起動側):送付ジェスチャ UI(「構成を拡張へ送る」)
   + structure-plan 受信 → modal 連携 + 結果返送(±100 行)
3. `structure-plan-modal.ts`:外部 text を初期値に開く entry point + 適用/
   閉鎖の結果 callback(±40 行)
4. spec 追記:`docs/spec/pkc-message-api-v2.md` §3.8 に 3 message を additive
   登録 + 本 doc へのリンク
5. テスト:channel gate(identity/nonce)/ readonly / pending 1 件 /
   modal 連携 / result 往復

## 4. 非スコープ(将来、#826 台帳と同じ扱い)

- 拡張側 AI リファレンス実装(PKC2-Extensions リポジトリの仕事)
- プランの部分適用・対話的修正ループ(v1 は「全体を見て適用 or 閉じる」)
- `structure` の自動 push(projection 同期)— 実需が立ってから
