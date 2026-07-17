/**
 * Post-build single-file packager(graph 拡張と同型)。
 *
 * Vite lib 出力(dist/onenote.js IIFE + 抽出 CSS)を、self-contained な
 * `pkc2-onenote.html` にまとめる。classic <script>(NOT type="module")なのは
 * document.write 起動(PKC2 の拡張ランチャー経路)で確実に実行されるため。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const dist = resolve(dir, 'dist');

const files = readdirSync(dist);
const cssFile = files.find((f) => f.endsWith('.css'));

const js = readFileSync(resolve(dist, 'onenote.js'), 'utf8')
  .replace(/<\/script>/gi, '<\\/script>');
const css = cssFile ? readFileSync(resolve(dist, cssFile), 'utf8') : '';

const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PKC2 → OneNote 送信</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <main>
      <h1>📓 PKC2 → OneNote 送信</h1>
      <div id="status" data-kind="info">PKC2 からメモを「🧩 送る ▸」で受け取り待ちです…</div>

      <section class="card">
        <h2>1. 受領したメモ</h2>
        <label for="page-title">OneNote ページタイトル</label>
        <input id="page-title" type="text" placeholder="会議メモ 2026-07-17" />
        <label for="memo-preview" style="margin-top:8px">本文(markdown、受領内容)</label>
        <textarea id="memo-preview" rows="6" readonly></textarea>
        <ul id="warnings"></ul>
        <div id="part-summary"></div>
        <p class="hint">録音・画像など本文が参照する添付は、それぞれの attachment entry も「送る ▸」で本拡張へ送ってください(受領すると警告が消えます)。</p>
      </section>

      <section class="card">
        <h2>2. Microsoft Graph</h2>
        <label for="token">アクセストークン(Graph Explorer 等で取得、scope: Notes.ReadWrite)</label>
        <input id="token" type="password" placeholder="eyJ0eXAiOiJKV1..." autocomplete="off" />
        <div class="row" style="margin-top:8px">
          <div class="grow">
            <label for="section">送信先セクション</label>
            <select id="section"></select>
          </div>
          <button id="load-sections" type="button">セクション読込</button>
        </div>
        <p class="hint">トークンは保存されません(このウィンドウのメモリ内のみ・約 1 時間有効)。</p>
      </section>

      <section class="card">
        <h2>3. 送信</h2>
        <div class="row">
          <button id="send" type="button">📤 OneNote ページを作成</button>
          <a id="result-link" target="_blank" rel="noopener noreferrer"></a>
        </div>
        <details style="margin-top:8px">
          <summary class="hint">送信する XHTML を確認</summary>
          <textarea id="xhtml-preview" rows="10" readonly></textarea>
        </details>
      </section>
    </main>
    <script>
${js}
    </script>
  </body>
</html>
`;

writeFileSync(resolve(dir, 'pkc2-onenote.html'), html);
console.log(`✓ pkc2-onenote.html (${(html.length / 1024).toFixed(1)} KB)`);
