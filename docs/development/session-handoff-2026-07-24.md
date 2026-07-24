# セッション引き継ぎ — 2026-07-24(storage v3 P0〜P2 完了・マニュアル刷新期)

前セッション(2026-07-22〜24)の成果・残件・教訓の申し送り。次セッションはまず
CLAUDE.md → `v3-consolidation-and-direction-2026-06.md` → 本書の順で読むこと。

## 1. このセッションで着地したもの(全て main に merge 済み)

| 領域 | PR | 内容 |
|---|---|---|
| C11 ファイル完結モード | #974–#979 | 設計 doc(`storage-v3-architecture-2026-07.md` §4.5/§4.6)→ uiPrefs バッグ(localStorage 非依存)/ prefs 単体入出力(.pkc2-prefs.json)/ IDB 死亡環境の明示フォールバック掲示 / フォルダ sink(ZIP 自動保存)/ ストレージ殺し実機 E2E + sink ベンチ(amp 0.34×) |
| P1s2 asset 恒久解 | #980–#982 | ObjectURL registry(同期 miss → wanted → 非同期 URL 化 → identity refresh)+ pin/プリウォーム + 4MB 閾値撤去(#956/#964 DoD) |
| P2 セグメントログ | #983–#988 | layout v3(meta 単一)→ v4(revisions 分割 gzip)→ v5(bodies 分割)。`persistence.lazy_entry_bodies` flag(既定 OFF)。移行 M1 = 切替時 ZIP 強制ゲート + versionchange 対応。実測: cold 11s → 16ms 級 |
| 依存採用 | #986 | cooldown 明け minor/patch 一括(ts-eslint は 8.64.0 ピン)。#687 にコメント済 |
| hotfix | #989 | Mac Firefox 設定メニュー grid blowout(minmax(0,1fr) + flex-wrap)。**Mac Firefox 実機確認は user 待ち** |
| マニュアル | #990–#992 | 07 章刷新(保存の全体像 mermaid 図解 + おすすめ組み合わせ 4 段)/ 陳腐化修正(12 章 mermaid「未実装」表記等)/ **生成物の壊れ画像修正**(画像参照を `images/*.png` に一元化し builder が `asset:` へ transcode、check:manual に再発防止検査) |

## 2. 残件(次セッションの入口)

### user 判断待ち(催促しない・提示済み)

1. **`persistence.lazy_entry_bodies` の既定 ON 可否** — 推奨: user 実環境で数日 opt-in
   運用 → 問題なければ既定 ON PR。留意: 旧ビルドで開くと本文が空に見える / 新形式の
   実ユーザー実績ゼロ
2. **v3 P3(ワークスペースのツリー第一級化 + L2 フォルダミラー)** — 設計 doc §7。
   **指示があるまで着工しない**
3. **フォールバック掲示側にも切替前 ZIP ゲートを足すか** — 現状は Settings 側の
   pick-storage-folder のみゲートあり。掲示側成功パスは「守るデータが未ロード」の
   理屈で省略中(#992 会話参照)
4. **mermaid render(`editor.mermaid_render_enabled`)の既定 ON 化** — マニュアル 07 章の
   図解をアプリ内で既定表示するため。プライム・ディレクティブ絡みのため user 判断

### 確認待ち

- **#989 の Mac Firefox 実機確認**(user の手元でしか再現できない。直っていなければ
  スクショをもらって仮説を立て直す)

### 環境メモ

- 予約 send_later トリガ(trig_01LV8…/trig_017qd…)は発火済みの可能性が高いが、
  user が delete を拒否したため**残す**(勝手に消さない)
- Firefox はこの実行環境にインストール不可(playwright install が proxy 403)。
  Firefox 起因の報告は CSS 静的解析 + Chromium 回帰 + user 実機確認の 3 点で回す

## 3. このセッションの教訓(次セッションも遵守)

### プロセス(user 叱責で確立したもの ── 最重要)

1. **doc-first**: 実装前に設計 doc を書き、GitHub URL で提示し、user 裁定を得てから
   実装する。「何勝手に実装してるの？先にドキュメント化でしょう？」
2. **AskUserQuestion ツールは使わない**。質問は必ず会話文で(「黙れアスクツールで
   聞いてくるな情報からコンテキストが抜ける」)
3. **成果物は GitHub URL(rendered)で提示**。diff を見せても user には伝わらない
4. **字義でなく意図を読む**。user の発言が事実と食い違っても、関連する実態を探して
   聞き返す(例:「localStorage が初期化される」→ 実態は「ブラウザストレージ全滅」)
5. **user-facing 変更はお知らせ(`STARTUP_NOTICES`)掲載 + マニュアル反映**。
   マニュアルは触るついでに陳腐化確認(今回: mermaid「未実装」表記が実装済みだった)

### 技術・運用(スキル化済み → `.claude/skills/` 参照)

- **merge-on-green ループ**(`/merge-loop`): PR ごとの branch 作り直し → CI 監視
  cron(*/3)→ squash merge → main 同期。詳細・落とし穴は
  `.claude/skills/merge-on-green/SKILL.md`
- **マニュアル整備**(`/manual-update`): md 正本の画像は `images/*.png` パス必須
  (builder が asset: へ transcode)。build:manual + check:manual + 生成物 commit を
  忘れない。詳細は `.claude/skills/manual-maintenance/SKILL.md`
- **visual parity**: 既存 `.claude/skills/visual-parity/SKILL.md`(seed race 対策 =
  `__default__` commit を poll で待つ、が今回も効いた)
- python heredoc での一括置換は**一意アンカー必須**(同一文字列が複数箇所にあると
  全部置換され wrap<T> を破壊した事故あり)
- **テストを追加したら必ずその後で typecheck**(追加前の typecheck 実績は無効)
- grid blowout の定石: `minmax(0, 1fr)` + 子要素 `min-width: 0` + 非 wrap 行に
  `flex-wrap: wrap`(#989)

## 4. 申し送りプロンプト(新セッションの最初の指示に貼る)

```
PKC2 の開発を前セッションから引き継ぎます。まず次を順に読んでください:
1. CLAUDE.md(運用方針・プライム・ディレクティブ「機能を足さない」)
2. docs/development/v3-consolidation-and-direction-2026-06.md(方針正本)
3. docs/development/session-handoff-2026-07-24.md(前セッションの成果・残件・教訓)

会話ルール(必ず遵守): 出力は日本語 / AskUserQuestion ツール禁止・質問は会話文で /
成果物は GitHub URL(rendered)で提示 / 実装前に設計 doc → 私の裁定 → 実装の順 /
user-facing 変更はお知らせ掲載 + マニュアル反映。

PR 運用: merge は CI 全 green 確認後にあなたが squash merge(.claude/skills/
merge-on-green/SKILL.md の手順)。branch は claude/… を main から作り直して使う。

残件は handoff doc §2 のとおり。user 判断待ち項目(lazy_entry_bodies 既定 ON /
P3 着工 / フォールバック側 ZIP ゲート / mermaid 既定 ON)は私が指示するまで
着工しないこと。まず handoff を読み終えたら、現状の要約と着手可能な選択肢を
簡潔に提示してください。
```
