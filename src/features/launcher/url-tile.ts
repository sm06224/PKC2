/**
 * URL 起動タイル — 擬似リダイレクトページ生成(#926、user 要望 2026-07-17)。
 *
 * 「単純な URL からの起動を可能とするランチャ。オリジン同一を許さない
 *  サイトのために、擬似的なリダイレクトページを挟む URL ジャンプも必要」
 *
 * 方式: URL タイル = **リダイレクト専用の小さな HTML を attachment 化**した
 * もの。既存の launcher 機構(registered_as_app + open-html-attachment)に
 * そのまま乗るため、データモデル変更ゼロ・export でそのまま持ち出せる。
 *
 * リダイレクトページの性質(オリジン遮断):
 *   - タイル起動は `window.open('') + document.write` = about:blank 由来の
 *     文書。そこからの遷移なので **file:// やホストのオリジンは相手サイトに
 *     渡らない**
 *   - `<meta name="referrer" content="no-referrer">` + fallback link の
 *     `rel="noreferrer noopener"` で referrer 送出を二重に遮断
 *   - 自動遷移は `location.replace`(履歴にリダイレクトページを残さない)。
 *     スクリプト無効環境用に手動リンクと meta refresh も併設
 *
 * pure module: browser API 非使用(文字列生成のみ)。encode は adapter 側。
 */

/** タイルにできる URL か(http / https のみ。javascript: 等は拒否)。 */
export function isLaunchableUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** JS 文字列リテラルとして安全に埋め込む(</script> 分断も防ぐ)。 */
function toJsString(s: string): string {
  return JSON.stringify(s).replace(/<\//g, '<\\/');
}

/**
 * 擬似リダイレクトページ HTML を生成する。URL が不正なら null。
 */
export function buildUrlRedirectHtml(opts: { url: string; title?: string }): string | null {
  const url = opts.url.trim();
  if (!isLaunchableUrl(url)) return null;
  const title = (opts.title ?? '').trim() || url;
  const escUrl = escapeHtml(url);
  const escTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escTitle}</title>
<meta http-equiv="refresh" content="1;url=${escUrl}">
<style>
  html,body{margin:0;height:100%;display:grid;place-items:center;background:#14171a;color:#d5dce3;font:15px/1.7 system-ui,sans-serif}
  main{text-align:center;padding:24px}
  a{color:#4c8dd8;word-break:break-all}
  .t{font-weight:600;margin-bottom:6px}
  .hint{color:#8a97a5;font-size:.8rem;margin-top:10px}
</style>
</head>
<body>
<main>
  <div class="t">${escTitle}</div>
  <div>移動しています… <a href="${escUrl}" rel="noreferrer noopener">${escUrl}</a></div>
  <div class="hint">PKC2 URL タイル — このページは referrer を送らずにジャンプします</div>
</main>
<script>location.replace(${toJsString(url)});</script>
</body>
</html>
`;
}

/**
 * タイル名から添付ファイル名を作る(拡張子 .url.html で由来を可視化)。
 */
export function urlTileFilename(title: string): string {
  const slug = title.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug || 'url-tile'}.url.html`;
}
