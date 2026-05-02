# Archived — Boot container source policy(audit + revision + priority)

**Status**: archive(参照のみ、policy 確定済)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/boot-container-source-*.md`(計 3 ファイル)

PKC2 の boot 時 Container 取得元(`pkc-data` embed / IDB / empty / error)の **優先順位確定までの議論記録**。最終的な policy は `src/adapter/platform/pkc-data-source.ts` の `chooseBootSource` および `src/main.ts` §11 に実装されている。

## 一覧(時系列、計 3 件)

| Order | File | 内容 | Date |
|---|---|---|---|
| 1 | [`boot-container-source-policy-audit.md`](./boot-container-source-policy-audit.md) | 初期 audit — IDB 優先による snapshot 不可視問題の発見と原因分析 | 2026-04-15 |
| 2 | [`boot-container-source-policy-revision.md`](./boot-container-source-policy-revision.md) | 採用案の改訂 — pkc-data 優先 + 「IDB に保存しない transient mode」設計 | 2026-04-15 |
| 3 | [`boot-container-source-priority.md`](./boot-container-source-priority.md) | **最終確定 policy** — 優先順位 `pkc-data → IDB → empty`、エクスポート HTML が他者の IDB を上書きしない契約 | 2026-04-16 |

## 確定 policy(参照便宜のため抜粋)

1. **`pkc-data` element があれば最優先**(エクスポート HTML として正しい)
2. **無い場合は IDB の最後の保存内容**(通常起動)
3. **両方無ければ empty container**(初回起動 / クリーン状態)
4. **すべて失敗時は `SYS_INIT_ERROR`**(boot abort)

実装 anchor: `src/adapter/platform/pkc-data-source.ts` `chooseBootSource()` + `src/main.ts §11`(loadFromStore wiring)。

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
- 並行 spec: `docs/spec/data-model.md`(Container 構造)
