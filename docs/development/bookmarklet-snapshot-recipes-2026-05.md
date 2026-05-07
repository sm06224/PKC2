# Bookmarklet snapshot recipes(2026-05-05、領域 10-6 ζ'' Phase 3c-E)

**Status**: Recipes & spec(自分で bookmarklet を登録する手順 + 提供サンプル)
**Lineage**: fragment-reference-ir-spec-2026-05.md §3.4 + Phase 3c-E 実装

User direction(2026-05-05、Phase 3a-r1 push 後):
> 今後、それらのサイトをスナップショット的に取り込むためのブックマークレットも計画しましょう

→ Phase 3c-E で **PKC2 側の受入経路**(URL `?pkc-snapshot=<base64>` を boot 時に検出 → 新規 TEXT entry 作成)を整備。本 doc は **bookmarklet 側の実装ガイド + サンプル** を提供。

> User 哲学:**main shell には modal を置かない**(2026-05-05)。snapshot 取込時も modal を出さず、新規 entry を作成して selectedLid を移すだけ。bookmarklet が PKC2 を **新タブで開く** ので、user が見るのは「PKC2 が新しい entry を開いて立ち上がる」だけ。

---

## 1. 前提:PKC2 側の URL 受入仕様

### 1.1 URL 形式

```
https://your-pkc2.example.com/pkc2.html?pkc-snapshot=<base64-or-json>
```

- `?pkc-snapshot=` が boot 時に検出される
- 値は **JSON 直接 or base64-encoded JSON**(後者推奨、URL 長さ制限と特殊文字回避のため)
- Boot 完了後、URL から `pkc-snapshot` パラメータが自動で除去される(reload で重複 entry 防止)

### 1.2 Snapshot JSON 形式

```ts
{
  "format": "pkc2-fragment-snapshot",
  "version": 1,
  "fragment": {                                  // optional
    "source": "https://...",
    "locator_kind": "time" | "page" | "episode" | "section" | "text-quote" | ...,
    "locator": { /* kind 別 shape */ },
    "open_uri": "https://...?t=130",
    "label": "2:10"
  },
  "selection": {                                  // optional
    "title": "Page title",
    "snippet": "Selected text or excerpt",
    "url": "https://..."
  },
  "captured_at": "2026-05-05T12:00:00Z",         // optional
  "comment": "User memo"                         // optional
}
```

### 1.3 PKC2 側 boot 動作

1. URL から base64 / JSON を decode
2. `format === 'pkc2-fragment-snapshot' && version === 1` を確認
3. `snapshotToEntryDraft(snapshot)` で `{ title, body }` を生成
4. `CREATE_ENTRY { archetype: 'text', title }` → editingLid 割当
5. `COMMIT_EDIT { lid, title, body }` で frontmatter + body を確定
6. URL から `pkc-snapshot` 除去(history.replaceState)
7. ユーザは新規 TEXT entry を編集中 → 通常画面に戻る

---

## 2. Sample bookmarklet recipes

すべての recipe は browser のブックマーク欄に保存して、対象サイトを開いた状態で click すれば PKC2 を新タブ起動 + entry 自動生成する。**`PKC2_URL` を自分の PKC2.html の URL に置換**してください。

### 2.1 汎用 — 現在のページタイトル + URL を保存

```javascript
javascript:(function(){
  var PKC2_URL = 'https://your-pkc2.example.com/pkc2.html';
  var snap = {
    format: 'pkc2-fragment-snapshot', version: 1,
    selection: {
      title: document.title,
      url: location.href,
      snippet: window.getSelection().toString()
    },
    captured_at: new Date().toISOString()
  };
  var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
  window.open(PKC2_URL + '?pkc-snapshot=' + b64, '_blank');
})();
```

### 2.2 YouTube — 現在の再生時間で fragment 化

```javascript
javascript:(function(){
  var PKC2_URL = 'https://your-pkc2.example.com/pkc2.html';
  var v = document.querySelector('video');
  var t = v ? Math.floor(v.currentTime) : 0;
  var url = location.href.split('&t=')[0] + '&t=' + t;
  var snap = {
    format: 'pkc2-fragment-snapshot', version: 1,
    fragment: {
      source: location.href,
      locator_kind: 'time',
      locator: { kind: 'time', start_sec: t },
      open_uri: url,
      label: Math.floor(t/60) + ':' + ('0' + (t%60)).slice(-2)
    },
    selection: { title: document.title, url: url },
    captured_at: new Date().toISOString()
  };
  var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
  window.open(PKC2_URL + '?pkc-snapshot=' + b64, '_blank');
})();
```

### 2.3 Amazon 商品ページ — ASIN/ISBN を含めて book 化

```javascript
javascript:(function(){
  var PKC2_URL = 'https://your-pkc2.example.com/pkc2.html';
  var asinMatch = location.href.match(/\/dp\/([A-Z0-9]{10})/);
  var asin = asinMatch ? asinMatch[1] : '';
  var snap = {
    format: 'pkc2-fragment-snapshot', version: 1,
    selection: {
      title: document.title.replace(/^Amazon[^:]*:\s*/, ''),
      url: location.href.split('?')[0],
      snippet: 'ASIN/ISBN: ' + asin
    },
    captured_at: new Date().toISOString()
  };
  var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
  window.open(PKC2_URL + '?pkc-snapshot=' + b64, '_blank');
})();
```

### 2.4 小説家になろう — n コード + 話数

```javascript
javascript:(function(){
  var PKC2_URL = 'https://your-pkc2.example.com/pkc2.html';
  var m = location.pathname.match(/^\/(n[a-z0-9]+)(?:\/(\d+))?/i);
  var ncode = m ? m[1] : '';
  var ep = m && m[2] ? Number(m[2]) : null;
  var snap = {
    format: 'pkc2-fragment-snapshot', version: 1,
    fragment: ep !== null ? {
      source: 'https://' + location.host + '/' + ncode + '/',
      locator_kind: 'episode',
      locator: { kind: 'episode', episode: ep },
      open_uri: location.href,
      label: ncode + ' 第' + ep + '話'
    } : undefined,
    selection: {
      title: document.title,
      url: location.href,
      snippet: window.getSelection().toString()
    },
    captured_at: new Date().toISOString()
  };
  var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
  window.open(PKC2_URL + '?pkc-snapshot=' + b64, '_blank');
})();
```

### 2.5 W3C Text Fragment — 選択テキストで fragment 化

```javascript
javascript:(function(){
  var PKC2_URL = 'https://your-pkc2.example.com/pkc2.html';
  var sel = window.getSelection().toString().trim();
  var url = location.href + (sel ? '#:~:text=' + encodeURIComponent(sel) : '');
  var snap = {
    format: 'pkc2-fragment-snapshot', version: 1,
    fragment: sel ? {
      source: location.href,
      locator_kind: 'text-quote',
      locator: { kind: 'text-quote', exact: sel },
      open_uri: url,
      label: sel.length > 32 ? sel.slice(0, 32) + '…' : sel
    } : undefined,
    selection: {
      title: document.title,
      url: location.href,
      snippet: sel
    },
    captured_at: new Date().toISOString()
  };
  var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
  window.open(PKC2_URL + '?pkc-snapshot=' + b64, '_blank');
})();
```

---

## 3. ブックマーク登録手順

1. ブラウザのブックマークバー / お気に入りバーに **新規ブックマーク** を追加
2. 名前を「PKC2 取込(YouTube)」などに
3. URL 欄に上記コードをそのまま貼り付け(`javascript:` で始まる)
4. 必要に応じて **`PKC2_URL` を自分の PKC2 URL に書き換える**
5. 対象サイトを開いた状態で bookmarklet を click → 新タブで PKC2 起動

---

## 4. 制約 / セキュリティ

- bookmarklet は **ブラウザ拡張ではない** ので、対象サイトの DOM にしかアクセスしない
- PKC2 は URL 経由で受け取った JSON を **container.entries に新規 TEXT として追加** するだけ — 既存 entry を壊さない
- Snapshot 内に embed する base64 は URL 長さ制限(各ブラウザ ~2000-8000 文字)に注意。長い snippet は短縮するか、bookmarklet 側で fragment URL のみ送る形にして body は user が後から追記する設計が安全

---

## 5. 関連 doc

- canonical IR: [`fragment-reference-ir-spec-2026-05.md`](./fragment-reference-ir-spec-2026-05.md)
- snapshot intake 実装: `src/features/snapshot/intake.ts`
- 受入 boot 経路: `src/main.ts` `maybeIngestSnapshotFromUrl`
- フィラ wave audit(本機能の上位 wave): `filer-view-and-folder-display-profile-audit-2026-05.md`
