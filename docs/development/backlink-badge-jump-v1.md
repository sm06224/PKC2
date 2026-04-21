# Sidebar Backlink Badge — Click Jump v1

**Status**: implementation — 2026-04-20.
**Scope**: sidebar の relations-based backlink count badge（`←N`）にクリック挙動を追加し、「気づく → 開く → 見る／消す」のループを 1 クリックで繋ぐ。視覚や計算方式は v1 で確定済、**クリック動作のみ追加**。

## 1. Explicit design answers

### Q1. すでに選択中の row の badge をクリックしたら何が起きるか
**Relations セクション (`[data-pkc-region="relations"]`) に scrollIntoView する**。
- SELECT_ENTRY は再 dispatch しない（冪等な reducer 呼出を避けるため）
- Meta pane 内で scroll → ユーザーは Backlinks / Outgoing relations の list を即座に見れる

### Q2. ジャンプ先 DOM anchor
Meta pane 内の `[data-pkc-region="relations"]` が一意の target。v1.2 以降、このセクションは **relations 0 件でも常時描画**される（"No backlinks." の empty state を持つ）ので、scroll target は常に存在する。

### Q3. relations 0 件の entry で badge をクリックしたら
**想定外のエッジ**: badge 自体は count > 0 の時しか描画されないので、このケースは通常発生しない。
- ただし race condition（render 直前に relation が消えた等）で万一起きても、scroll は no-op で済む（relations region は empty state を出すだけ）
- 安全側の design: badge 描画ゲートは変わらず `count > 0` のまま

### Q4. readonly / lightSource / manual contexts
**削除 UI とは違い、badge click は purely-navigational**。readonly でも動作させる:
- badge の描画ゲートは「count > 0」のみ（canEdit 不要）
- click → SELECT_ENTRY + scroll。両方 readonly で許容されるアクション
- lightSource / viewOnlySource も同じ扱い

### Q5. キーボード操作
`<span>` を `<button>` に変更し、**native なフォーカス可能性 + Enter/Space 起動**を得る。追加コードなし。
- Tab で focus 可能
- Enter / Space で click イベント発火 → 同じ action 経路

### Q6. viewMode の扱い
現在が `detail` 以外（`calendar` / `kanban`）の場合、relations セクションは描画されない。
- click 時に `SET_VIEW_MODE`（`mode: 'detail'`）を先行 dispatch → 通常 `select-entry` と同じ挙動
- すでに `detail` なら SET_VIEW_MODE は skip

### Q7. event 伝播
現在の sidebar 行 `<li>` は `data-pkc-action="select-entry"`。badge `<button>` に `data-pkc-action="open-backlinks"` を付ければ、`e.target.closest('[data-pkc-action]')` は **innermost** を拾うので `open-backlinks` が採用される。`stopPropagation` 不要、既存 closest-based delegation の自然な挙動。

## 2. DOM 仕様

### Before (v1 の count badge)
```html
<span class="pkc-backlink-badge"
      data-pkc-backlink-count="N"
      title="N incoming relation(s)">←N</span>
```

### After (本 PR)
```html
<button class="pkc-backlink-badge"
        data-pkc-action="open-backlinks"
        data-pkc-lid="<lid>"
        data-pkc-backlink-count="N"
        title="N incoming relation(s)"
        aria-label="Jump to N incoming relation(s)">←N</button>
```

変更点:
- タグ: `<span>` → `<button>`
- `data-pkc-action="open-backlinks"` 追加
- `data-pkc-lid="<lid>"` 追加（action-binder の handler がターゲット entry を特定するため）
- `aria-label` 追加（screen reader で意味が通るように）

## 3. action-binder 実装

`handleClick` の switch に新 case:

```ts
case 'open-backlinks': {
  if (!lid) break;
  const state = dispatcher.getState();
  if (state.viewMode !== 'detail') {
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
  }
  if (state.selectedLid !== lid) {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
  }
  // Defer scroll until after the renderer has (re)painted the
  // relations region — SELECT_ENTRY triggers a state notification
  // which happens before this rAF callback fires.
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => { cb(0 as unknown as number); return 0; };
  raf(() => {
    const region = root.querySelector<HTMLElement>('[data-pkc-region="relations"]');
    if (region && typeof region.scrollIntoView === 'function') {
      region.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  break;
}
```

- SET_VIEW_MODE / SELECT_ENTRY は**必要な時だけ dispatch**、冪等な再 dispatch は避ける
- scroll は rAF で defer（既存 navigate-entry-ref と同パターン）
- happy-dom 環境用 rAF fallback も既存コード流用

## 4. 実装範囲

| 層 | ファイル | 変更 |
|----|---------|------|
| adapter/ui | `src/adapter/ui/renderer.ts` | badge を `<span>` → `<button>`、`data-pkc-action` / `data-pkc-lid` / `aria-label` 追加 |
| adapter/ui | `src/adapter/ui/action-binder.ts` | `case 'open-backlinks'` 追加 |
| styles | `src/styles/base.css` | `.pkc-backlink-badge` に button default reset（background/border/padding） |
| tests | `tests/adapter/renderer.test.ts` | 新 button 属性 + 既存テストの selector 更新 |
| tests | `tests/adapter/mutation-shell.test.ts` | 統合: click でスクロール + SELECT_ENTRY dispatch |
| docs | 本文書 | spec |

**既存 reducer / action / data スキーマ不変**。

## 5. Terminology（厳密）

本 PR も **relations-based backlinks のみ**。

| 要素 | 文言 |
|------|------|
| button `title` | `"N incoming relation(s)"`（不変） |
| button `aria-label` | `"Jump to N incoming relation(s)"` |
| action 名 | `open-backlinks` — provisional（"open" は具体的に "scroll into relations section" を意味する便宜名） |
| spec 内 | "relations-based backlink badge click" |
| link-index / markdown-reference backlinks | **本 PR は触らない** |

`open-backlinks` は暫定名。将来 relations / link-index を unified にする場合、もしくは専用 panel を開く action を追加する場合に rename 候補。

## 6. Graph deferral note（**本 PR では実装しない**）

relation graph visualization（ノード・エッジの描画 UI）は、検討対象ではあるが **本 PR および当面の PKC2 core 開発では実装しない**。

### 理由
- PKC2 core のバンドルサイズへの影響を避ける
- graph UX / design の選択肢が広く、core に早期に固定化するのは premature
- 現状の "sidebar badge → click → Relations セクションにジャンプ → 行単位で削除 / navigate" という relation 操作ループを先に完成させるほうが投資効率が高い

### 将来の実装候補
1. **single-HTML ランチャー成熟後**: PKC2 core 以外の "launcher" 基盤が確立してから、graph viewer を追加 HTML アプリとして配布する選択肢
2. **PKC-Extensions アプリ + PKC-Message 経由**: 既存 `postMessage` transport (record:offer / record:accept 等) の仕組みを流用し、graph アプリから PKC2 に relation データを要求する形で分離実装

いずれも **PKC2 core の bundle / 5-layer には触らず**、別プロジェクトで graph UX を独自設計する方向。進捗次第で別 spec doc を作成する。

## 7. テスト観点

### renderer
- badge が `<button>` として描画される（`.tagName === 'BUTTON'`）
- `data-pkc-action="open-backlinks"` + `data-pkc-lid` + `aria-label` が付与される
- count > 0 時のみ描画（既存挙動不変）

### integration (mutation-shell)
- 未選択 entry の badge click → SELECT_ENTRY dispatch → selectedLid 更新
- すでに選択中の entry の badge click → selectedLid 不変（dispatch されない）
- calendar view で click → viewMode が `detail` に切り替わる
- Enter key で同じ動作が起きる（keyboard accessibility）

### readonly
- readonly な container でも badge が描画され click 可能（navigational）

## 8. 非スコープ（将来候補）

> **📌 As of 2026-04-21（historical overlay）**: 当時の将来候補のうち **orphan 検出 UI + relation kind 編集 UI は LANDED**。他は現状 active candidate ではない。
>
> - graph visualization — **永続的に DEFERRED**（§6 / `unified-orphan-detection-v3-contract.md §4.8` / `§6.2.1`）
> - orphan 検出 UI — **LANDED** (`orphan-detection-ui-v1.md` v1、`connectedness-s4-v1.md` v3 sidebar marker。S5 filter のみ Defer)
> - relation kind 編集 UI — **LANDED** (`relation-kind-edit-v1.md`)
> - backlinks panel の independent scroll anchor — **DEFERRED**（現状 `data-pkc-region="relations"` 流用が継続、分離要求なし）
> - badge hover preview — **DEFERRED**

- **graph visualization**（§6 参照、明示的に defer）
- **orphan 検出 UI**（relations 0 件 entry のハイライト）
- **relation kind 編集 UI**
- **backlinks panel への independent scroll anchor**（現状 `relations` region を流用、将来分離する余地）
- **badge の hover preview**（peer entry の title 等を浮遊表示）

## 9. 互換性 / Rollback

- `<span>` → `<button>` に変わるが、selector `.pkc-backlink-badge` や `data-pkc-backlink-count` は維持
- 既存テストで `querySelector('.pkc-backlink-badge')` を使っていれば無影響（v1 で追加した 3 tests 含む）
- `git revert` で前状態に戻せる

## 10. 関連文書

- `docs/development/sidebar-backlink-badge-v1.md` — count badge の前提（§5 で「v1 はクリック挙動なし、将来余地あり」と記載済）
- `docs/development/backlinks-panel-v1.md` — relations セクションの確立
- `docs/development/relation-delete-ui-v1.md` — 同セクション内の削除 UI（本 PR と連携してループ完成）
- 本 PR の graph defer note（§6）は将来の専用 spec doc の前段
