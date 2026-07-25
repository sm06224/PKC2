---
name: shinsatsu
description: >
  視聴覚 + 官能の動的動作テスト(可搬ハーネス版)。マウス・クリック・スクロール・
  キーボードを人間のように動かしてページに触り、目(スクショ画素差分・
  elementFromPoint)と耳(AudioContext タップで録音 → dBFS・クリッピング・音階解析)
  で「よくない動き」(dead click / dead scroll / dead input / dead mute / 覆われた
  要素 / 音の破綻 / 裏の例外 / 画面の嘘)を見つけて潰すワークフロー。Playwright に
  依存しない CDP 直叩きハーネス同梱で、スキルディレクトリごとコピーすれば任意の
  リポジトリで動く。PKC2 の視覚検証の正本は従来どおり visual-parity /
  playwright-visual(tests/smoke/)— 本スキルは「音・官能の検査」「Playwright が
  使えない/入っていない環境での視覚検査」「他リポジトリへの展開元」で使う。
  「音のテスト」「官能テスト」「このスキルを○○リポジトリにも」という文脈で必ず使う。
---

# 診察(shinsatsu)— 視診・聴診・触診(可搬ハーネス版)

マウスは曲線を描いて動き、クリックには間があり、キーには緩急がある。
そうやって**人間のようにページに触り**、結果を**目と耳の両方**で確かめる。
`docs/development/visual-state-parity-testing.md`(生成 ≠ 描画、programmatic
click ≠ 実機 click)の規律を、**Playwright 非依存の同梱ハーネス**で実装し、
聴覚と官能まで広げたもの。初出は [na リポジトリ](https://github.com/sm06224/na)
(依存ゼロ作品集)で、そこで踏んだ罠ごと持ち帰った。

## PKC2 での住み分け(重要)

| 用途 | 使うもの |
|---|---|
| 視覚 parity の正本(PR 規律の「最低 1 件」) | `visual-parity` skill + `tests/smoke/*-parity.spec.ts`(Playwright) |
| user に見せるデモ・画像比較レポート | `playwright-visual` skill(`npm run visual`) |
| **音の検査 / 官能検査** | **本スキル**(Playwright に音の捕獲は無い) |
| **Playwright が無い環境・他リポジトリへの展開** | **本スキル**(ディレクトリごとコピー) |

PKC2 の視覚機能 PR の parity 義務は従来どおり Playwright 側で果たす。
本スキルの specs/ はお手本 1 本のみ置き、網羅はしない。

## 前提環境(Claude の実行環境で動くことが正)

- **Node ≥ 22**(内蔵 WebSocket で CDP を話す)
- **Chromium / Chrome がどこかにあること** — 探索順: `VISUAL_CHROME` →
  `/opt/pw-browsers/chromium`(この開発環境の常備品)→ `google-chrome` →
  `chromium` …。**バイナリのダウンロードはしない**(proxy 403 対策。
  playwright-visual skill の resolver と同じ思想)
- npm パッケージ不要(依存ゼロは目的ではなく結果。必要になれば環境の道具を使う)

## 実行

```bash
npm run build                                        # src を変えたら必ず(dist を配る)
node .claude/skills/shinsatsu/run.js          # 全スペック
node .claude/skills/shinsatsu/run.js boot     # 名前で絞る
```

- **リポジトリのルートから実行**(カレントディレクトリを静的サーバで配り、
  スペックは `t.goto('/dist/pkc2.html')` で開く)
- boot 待ちは正本シグナルで:
  `await t.page.waitFor('!!(window.PKC && window.PKC.bootReady)')` →
  `await t.page.eval('PKC.bootReady.then(() => true)')`
  (`#pkc-root` の存在待ちは段階 0 で通過する — boot-ready helper と同じ契約)
- selector は **`data-pkc-*` のみ**(リポジトリ規約)
- 結果: `test-results/visual/report.html`(画像埋め込み自己完結 HTML)+
  スクショ PNG + 録音 .wav / 波形 PNG / スペクトログラム PNG。FAIL で exit 1

## 実行後の検品規律(Claude の作法)

1. **スクショ・波形・スペクトログラムを Read で全部検品**してから結果を語る
2. **md5 重複検出**で空振りショットを探す(無音同士の波形は同じ絵になる —
   正当な重複。中身を見て判断):
   `md5sum test-results/visual/*.png | awk '{print $1}' | sort | uniq -d`
3. user への提示は画像とレポートで。音は **.wav を SendUserFile で**(最終官能は
   user の耳)

## 三つの規律 + 耳

1. **到達可能性** — 押す前に `elementFromPoint`(`t.human.click` に内蔵)
2. **実イベント** — CDP `Input.dispatch*Event`。軌道はベジェ + ease-in-out、
   揺らぎはスペック名 seed の決定的乱数(人間らしく、再現可能)
3. **画面と音で確かめる** — 画素差分(absdiff)+ 画面観測点の値 + PCM
4. **耳** — ページが作る `AudioContext` にタップを仕込み実音を捕獲。
   `--mute-audio` はデバイス出力を黙らせるだけで WebAudio グラフは動くので
   全部聴こえる。アプリ自前の消音(gain)はタップにも無音が届く =
   「消音が本当に効くか」まで検証できる

## 見つける「よくない動き」

dead click / 起きてはいけない変化 / dead scroll / dead input / 覆われて押せない
要素 / **dead sound・dead mute・音割れ(クリッピング)・不協和** / 画面の嘘
(表示とデータの不一致)/ ページ内例外・console.error・リソース読込失敗。

## スペックの書き方

`specs/<nn>-<name>.visual.js`。PKC2 のお手本は `01-boot-and-entry.visual.js`
(boot 正本待ち → 実打鍵でエントリ作成 → 画面観測点 → 静寂の確認)。
na 側にはさらに 5 本の実例がある(canvas の凪測定・ペンタトニック判定・
dead mute 検出など)。

主要 API:

- **t**: `goto` / `shot(label, {sel?})` / `diff(label, a, b, {threshold?})` /
  `act(label, {expect: 'change'|'none', sel?, ratio?}, fn)` / `expect` `pass`
  `fail` `warn` `note` / `page.eval` / `page.waitFor` / `page.settle`
- **t.human**: `click(sel, {clickCount?})` / `reach` / `bringIntoView` /
  `type`(非 ASCII は IME 確定経路)/ `press` / `wheel` / `drag` /
  `moveTo` `clickAt` `buttonDown` `buttonUp`
- **t.listen**: `record(label, action | 待機ms)` → `{ rmsDb, peakDb, clipRatio,
  peaks, pentaRoot, … }` or `null`(AudioContext 不在)。.wav / 波形 /
  スペクトログラムを自動保存

## 官能検査の分担

| 層 | 誰が | 何を |
|---|---|---|
| 機械計測 | ハーネス | dBFS / クリッピング / 音階の協和 / 画素差分 / 応答の有無 |
| 多感覚検品 | **Claude** | スクショの破綻、スペクトログラム・波形の異常(常鳴り・ノイズ床・DC・ぶつ切り) |
| 最終官能 | **user** | .wav を耳で(心地よさ・意図との一致)。SendUserFile で必ず届ける |

ルーブリック: **見え** = 破綻無く意図した情景か / **聴こえ** = 静寂は静寂か・
鳴るべき時に鳴るか・音量は節度(-20〜-45 dBFS 目安)か・調性は意図どおりか /
**触り心地** = 応答は一拍以内か・操作が「吸われる」瞬間は無いか。

## 落とし穴(全て実際に踏んだもの)

- **フェード中のオーバーレイが pointer を吸う**(na の intro 1.5s fade で実証)。
  DOM フラグでは「開いた」ように見える。操作対象が出た後も**手が届くまで**
  `elementFromPoint` を `t.page.waitFor` で見張る
- **入力欄の既定値**: PKC2 のタイトル欄には日付 Note が入っている。実打鍵は
  追記になる(人間と同じ)ので、置き換えたいときは**トリプルクリックで全選択**
  してから打つ(`t.human.click(sel, { clickCount: 3 })`)
- **常時アニメーション(canvas)は瞬間比較が効かない**: 先に「凪」(無操作の
  揺らぎ)を測って基準にし、画素閾値 `threshold` を上げる(na の波は 40 で
  凪 0.00% vs 大波 13%)
- **効果は減衰する**: 「リセットで画面が変わる」系は直前に強い状態を作り直す
  (減衰後のリセットは何も変えず dead interaction に誤検出される)
- **hover の残り香**: `t.act` は判定前にマウスを隅へ park する
- **残響の尾・gain ランプ**: 消音検証は減衰しきるのを待ってから録る
- **loadEventFired は稀に取りこぼす**(5MB 単一 HTML で実測 1/4)— goto は
  readyState 監視とのレースで対処済み。自作の待ちにも同じ罠がある
- **favicon 404 は既定で無視**。無害な console はスペックの `allow: [/…/]` で

## 他リポジトリへの展開

1. `.claude/skills/shinsatsu/` を**ディレクトリごとコピー**(自己完結)
2. `specs/` を対象アプリ向けに書き直す
3. 配信ルート = cwd。ビルドが要るなら先にビルド。独自 dev サーバがあるなら
   `run.js` の `serveStatic(ROOT)` をその origin に差し替え
4. `test-results/` を .gitignore に(PKC2 は済み)

## 非ゴール

- PKC2 の視覚 parity の置き換え(それは Playwright 側の仕事。本スキルは音・官能と可搬性)
- pixel-perfect visual regression / 音の心理音響モデル / 全網羅
