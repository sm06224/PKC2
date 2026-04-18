# 4. Conflict 判定（data contract）

## 4.1 normalizeTitle

title 比較に使用する正規化関数。pure / deterministic。

```ts
function normalizeTitle(title: string): string {
  let s = title
  s = s.normalize('NFC')
  s = s.trim()
  s = s.replace(/\s+/g, ' ')
  return s
}
```

- Unicode NFC 正規化を適用
- 前後の空白を除去
- 連続空白を単一スペースに圧縮
- 大文字小文字は区別する（v1 固定）

## 4.2 contentHash

entry の内容同一性を判定するためのハッシュ。既存 `src/core/operations/hash.ts` の FNV-1a-64 helper を再利用する。

**入力範囲（supervisor 確定）**: `body + archetype` のみ。title は除外する。

```ts
function contentHash(body: string, archetype: string): string {
  return fnv1a64(body + '\0' + archetype)
}
```

- title を除外する理由：title は C2 分類（title-only match）の判定に別途使用するため、hash 入力に含めると C1/C2 の区別が不可能になる
- `\0` separator：body と archetype の境界を明確にする（body 末尾が archetype 文字列で終わるケースとの衝突回避）

## 4.3 3 分類の判定ルール

| 分類 | 条件 | default resolution |
|------|------|--------------------|
| **C1: content-equal** | `archetype` 一致 + `normalizeTitle(title)` 一致 + `contentHash` 一致 | `keep-current`（pre-selected） |
| **C2: title-only** | `archetype` 一致 + `normalizeTitle(title)` 一致 + `contentHash` 不一致 + host 候補 1 件 | なし（explicit 選択必須） |
| **C2-multi: title-only-multi** | `archetype` 一致 + `normalizeTitle(title)` 一致 + `contentHash` 不一致 + host 候補 2 件以上 | なし（explicit 選択必須、keep-current disabled） |
| **C3: no-conflict** | 上記いずれにも該当しない | 介入不要（MVP 経路でそのまま append） |

## 4.4 detectEntryConflicts pseudocode

```
function detectEntryConflicts(host: Container, imported: Container): EntryConflict[]
  hostMap = new Map<string, HostEntry[]>()
  for each entry in host.entries:
    key = normalizeTitle(entry.title) + '|' + entry.archetype
    hostMap.get(key)?.push(entry) or hostMap.set(key, [entry])

  conflicts: EntryConflict[] = []
  for each imp in imported.entries:
    key = normalizeTitle(imp.title) + '|' + imp.archetype
    candidates = hostMap.get(key) or []
    if candidates.length === 0: continue  // C3, no conflict

    impHash = contentHash(imp.body, imp.archetype)
    exactMatch = candidates.find(h => contentHash(h.body, h.archetype) === impHash)

    if exactMatch:
      conflicts.push({
        kind: 'content-equal',
        imported_lid: imp.lid,
        host_lid: exactMatch.lid,
        imported_title: imp.title,
        host_title: exactMatch.title,
        archetype: imp.archetype,
        imported_content_hash: impHash,
        host_content_hash: contentHash(exactMatch.body, exactMatch.archetype),
        imported_body_preview: bodyPreview(imp.body),
        host_body_preview: bodyPreview(exactMatch.body),
        imported_created_at: imp.createdAt,
        imported_updated_at: imp.updatedAt,
        host_created_at: exactMatch.createdAt,
        host_updated_at: exactMatch.updatedAt,
      })
    else if candidates.length === 1:
      conflicts.push({
        kind: 'title-only',
        imported_lid: imp.lid,
        host_lid: candidates[0].lid,
        ...timestamps and previews...
      })
    else:
      // multi-host: 代表 = updatedAt 最新、tie-break = array index 昇順
      representative = candidates.sort((a, b) => {
        const cmp = b.updatedAt.localeCompare(a.updatedAt)
        if (cmp !== 0) return cmp
        return host.entries.indexOf(a) - host.entries.indexOf(b)
      })[0]
      conflicts.push({
        kind: 'title-only-multi',
        imported_lid: imp.lid,
        host_lid: representative.lid,
        host_candidates: candidates.map(c => c.lid),
        ...timestamps and previews...
      })

  return conflicts
```

## 4.5 EntryConflict 型定義

```ts
type ConflictKind = 'content-equal' | 'title-only' | 'title-only-multi';
type Resolution = 'keep-current' | 'duplicate-as-branch' | 'skip';

interface EntryConflict {
  imported_lid: string;
  host_lid: string | null;
  host_candidates?: string[];
  kind: ConflictKind;
  imported_title: string;
  host_title: string;
  archetype: string;
  imported_content_hash: string;
  host_content_hash: string;
  imported_body_preview: string;
  host_body_preview: string;
  imported_created_at: string;
  imported_updated_at: string;
  host_created_at: string;
  host_updated_at: string;
}
```

## 4.6 body preview 規則

- Unicode code-point 単位で先頭 200 code points をスライス（`[...body].slice(0, 200).join('')`）
- 改行は `\n` を visible `↵` に置換
- markdown / JSON の構造記号はそのまま表示（render しない、escape しない）
- 200 code points 未満：末尾に ellipsis なし
- 200 code points 以上：末尾に `...` を追加
