# Boot Container Source Priority

Status: COMPLETED 2026-04-16
Related: `src/main.ts` §11, `src/adapter/platform/pkc-data-source.ts`, `src/adapter/platform/persistence.ts`

---

## 問題

エクスポートした HTML（pkc-data に Container を埋め込んだ単一 HTML）をブラウザで開くと、
ブラウザの IndexedDB に前セッションの Container が残っていた場合、
**IDB の Container が優先表示** されてしまい、エクスポートされたスナップショットが見えなかった。

結果として、エクスポート HTML を「他人に snapshot を渡す」「別端末で見る」
「別ブラウザセッションで確認する」といった基本用途で、意図した中身が表示されなかった。

## 原因

`main.ts` の boot 手順が以下の順：

1. IDB default container → あれば採用
2. pkc-data element → IDB が空のときだけ採用
3. empty container → fallback

この順序では、**同じブラウザで PKC2 を使ったことがある受信者** が
エクスポート HTML を開くと、自分の IDB が勝ってしまう。

## 修正

boot 順序を pkc-data 優先に入れ替える。

1. **pkc-data element**（非空なら即採用）
2. IDB default container
3. empty container

### 前提条件

- fresh bundle `pkc2.html` は `#pkc-data` が canonical empty payload `{}` で出荷される
- `readPkcData()` は `{}` / empty / whitespace のみの場合は `null` を返す
- したがって「PKC2 を普通に開き直す」ケース（fresh bundle）では pkc-data が null になり、
  従来通り IDB が勝つ — 既存の「再起動して続きから」運用は壊れない

### safety

- readonly export（`export_meta.mutability === 'readonly'`）は reducer が全 mutation を block するため、
  受信者側の IDB を新規書き換える副作用は発生しない
- light export（`export_meta.mode === 'light'`）は `lightSource=true` が設定され、
  `persistence.ts` の `doSave` が save を skip するため、asset-stripped データで IDB を汚染しない

### full / editable export の扱い

受信者が full / editable なエクスポート HTML を開いて編集した場合、
通常のフローで `store.save()` が走り、DEFAULT_KEY が export 側の container_id に切り替わる。
受信者の以前の container は `CONTAINERS_STORE` に `container_id` 別キーとして残り、物理削除はされない。
この挙動は fix 前後で変わっていない（DEFAULT_KEY の切替は既存の `save()` 契約）。

## 構造変更

- 新規 `src/adapter/platform/pkc-data-source.ts`
  - `readPkcData()` を `main.ts` から切り出し、JSON parse / asset decompress の失敗を
    try/catch で握り潰して `null` を返すよう強化（旧実装は `JSON.parse` が throw すると
    boot 全体が SYS_INIT_ERROR に落ちていた）
  - `chooseBootSource(pkcData, idbContainer)` pure 関数で優先順位ロジックを固定
- `src/main.ts` §11 で両者を呼び出し、`chooseBootSource` の結果 `source` で dispatch を分岐
- `src/adapter/platform/persistence.ts` の `loadFromStore` doc コメントを「IDB-only、優先順位の決定は chooseBootSource に委譲」へ更新

## テスト

- `tests/adapter/pkc-data-source.test.ts`（14 件、新規）
  - `readPkcData`: absent / `{}` / whitespace / malformed JSON / missing container key /
    full payload / readonly / lightSource の 8 パターン
  - `chooseBootSource`: pkc-data > IDB の優先（**本 fix の核心**）/ readonly forwarding /
    lightSource forwarding / IDB fallback / empty fallback / IDB 経路で readonly/lightSource を誤って継承しない の 6 パターン
- 既存 `tests/adapter/persistence.test.ts` (14 件) は全 pass — `loadFromStore` の契約は不変

## 非スコープ

- Container 選択 UI（「どちらを開きますか？」ダイアログ等）は今回は追加しない
- 受信者の IDB container を pkc-data import 時にバックアップする機能も今回は追加しない
- 既存 UX を最小差分で「エクスポート HTML を開いたら中身が見える」状態に戻すことだけ
