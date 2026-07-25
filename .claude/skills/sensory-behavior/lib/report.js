// 自己完結 HTML レポート — 画像は base64 で埋め込み、これ 1 枚で持ち運べる

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const img = (b64, alt) => b64
  ? `<a href="data:image/png;base64,${b64}" target="_blank"><img loading="lazy" src="data:image/png;base64,${b64}" alt="${esc(alt)}"></a>`
  : '<span class="none">—</span>';

function stepHtml(step) {
  switch (step.type) {
    case 'note':
      return `<div class="step note">${esc(step.text)}</div>`;
    case 'expect':
      return `<div class="step expect ${step.ok ? 'ok' : 'ng'}"><span class="mark">${step.ok ? '✓' : '✗'}</span> ${esc(step.text)}</div>`;
    case 'shot':
      return `<div class="step shot"><div class="label">📷 ${esc(step.label)}</div><div class="imgs">${img(step.b64, step.label)}</div></div>`;
    case 'diff':
      return `<div class="step act"><div class="label">🔍 ${esc(step.label)} — 差分 ${(step.ratio * 100).toFixed(3)}%${step.sizeMismatch ? `(寸法不一致 ${esc(step.sizeMismatch)})` : ''}</div>
        <div class="imgs three">
          <figure>${img(step.a, '比較元')}<figcaption>比較元</figcaption></figure>
          <figure>${img(step.b, '比較先')}<figcaption>比較先</figcaption></figure>
          <figure>${img(step.d, '差分')}<figcaption>差分(赤 = 変化)</figcaption></figure>
        </div></div>`;
    case 'audio':
      return `<div class="step act"><div class="label">👂 ${esc(step.label)} — ${esc(step.summary)}<br>
        <span class="fine">原音: <code>${esc(step.wavFile)}</code>(耳での官能評価はこの .wav で)</span></div>
        <div class="imgs three">
          <figure>${img(step.wave, '波形')}<figcaption>波形</figcaption></figure>
          <figure>${img(step.spec, 'スペクトログラム')}<figcaption>スペクトログラム(下=低音)</figcaption></figure>
        </div></div>`;
    case 'act': {
      const verdict = step.verdict === 'pass' ? '<span class="ok">期待どおり</span>'
        : step.verdict === 'fail' ? '<span class="ng">よくない動き</span>' : '記録のみ';
      return `<div class="step act"><div class="label">🖱 ${esc(step.label)} — 差分 ${(step.ratio * 100).toFixed(3)}% / ${verdict}</div>
        <div class="imgs three">
          <figure>${img(step.before, '操作前')}<figcaption>操作前</figcaption></figure>
          <figure>${img(step.after, '操作後')}<figcaption>操作後</figcaption></figure>
          <figure>${img(step.diff, '差分')}<figcaption>差分(赤 = 変化)</figcaption></figure>
        </div></div>`;
    }
    default:
      return '';
  }
}

export function buildReport({ results, meta = {} }) {
  const fails = results.filter((r) => r.status === 'fail').length;
  const sections = results.map((r) => `
  <section class="${r.status}">
    <h2><span class="badge ${r.status}">${r.status === 'pass' ? 'PASS' : 'FAIL'}</span> ${esc(r.name)} <span class="dur">${(r.durationMs / 1000).toFixed(1)}s</span></h2>
    ${r.findings.length ? `<ul class="findings">${r.findings.map((f) => `<li class="${f.severity}">[${esc(f.kind)}] ${esc(f.message)}</li>`).join('')}</ul>` : ''}
    <div class="steps">${r.steps.map(stepHtml).join('\n')}</div>
  </section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>視聴覚動作テスト — 報告</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2rem clamp(1rem, 4vw, 3rem); background: #f6f2e9; color: #232019;
         font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif; line-height: 1.7; }
  h1 { font-weight: 600; letter-spacing: .06em; }
  h1 .sub { font-size: .55em; color: #8a8272; font-weight: 400; margin-left: .8em; }
  .summary { margin: .4rem 0 2rem; color: #55503f; }
  .summary b.ok { color: #2c7a4b; } .summary b.ng { color: #b3372f; }
  section { background: #fffdf7; border: 1px solid #e5ddc9; border-radius: 10px; padding: 1rem 1.4rem; margin: 1.2rem 0; }
  section.fail { border-color: #d9a09a; }
  h2 { font-size: 1.05rem; font-weight: 600; margin: .2rem 0 .8rem; }
  .badge { font-size: .72rem; letter-spacing: .12em; padding: .15em .6em; border-radius: 4px; vertical-align: 2px; margin-right: .5em; }
  .badge.pass { background: #dff0e4; color: #2c7a4b; }
  .badge.fail { background: #f7ddda; color: #b3372f; }
  .dur { font-size: .75rem; color: #a49a83; font-weight: 400; margin-left: .6em; }
  .findings { background: #fbf1ef; border-radius: 6px; padding: .6rem 1rem .6rem 2rem; }
  .findings li.fail { color: #b3372f; }
  .findings li.warn { color: #9a6b12; }
  .step { margin: .55rem 0; }
  .step.note { color: #6d6552; }
  .step.expect .mark { display: inline-block; width: 1.3em; text-align: center; border-radius: 50%; font-size: .85em; }
  .step.expect.ok .mark { color: #2c7a4b; } .step.expect.ng { color: #b3372f; font-weight: 600; }
  .step .label { font-size: .88rem; color: #55503f; margin-bottom: .3rem; }
  .imgs img { max-width: min(560px, 100%); max-height: 340px; border: 1px solid #d8cfba; border-radius: 6px; background: #fff; }
  .imgs.three { display: flex; gap: .8rem; flex-wrap: wrap; }
  .imgs.three figure { margin: 0; flex: 1 1 240px; max-width: 380px; }
  .imgs.three img { width: 100%; max-height: 280px; object-fit: contain; }
  figcaption { font-size: .75rem; color: #8a8272; text-align: center; margin-top: .2rem; }
  .fine { font-size: .78rem; color: #8a8272; }
  .ok { color: #2c7a4b; } .ng { color: #b3372f; font-weight: 600; }
  .none { color: #bbb; }
  footer { margin-top: 2.5rem; font-size: .8rem; color: #a49a83; }
</style>
</head>
<body>
<h1>視聴覚動作テスト<span class="sub">人間のように触り、画面と音で確かめる</span></h1>
<p class="summary">${results.length} 本のうち <b class="ok">${results.length - fails} PASS</b> / <b class="ng">${fails} FAIL</b>
${meta.browser ? ` · ${esc(meta.browser)}` : ''}${meta.startedAt ? ` · ${esc(meta.startedAt)}` : ''}</p>
${sections}
<footer>依存ゼロの CDP ハーネス(tests/visual)による自動報告。画像はこのファイルに埋め込み済み — この 1 枚だけで証跡が完結する。</footer>
</body>
</html>`;
}
