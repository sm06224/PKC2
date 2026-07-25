/**
 * Visual regression レポート生成ヘルパ(playwright-visual skill / demo モード)。
 *
 * 画像比較(比較基準 baseline / 比較対象 candidate / 比較結果 diff)を
 * **ブラウザ内 canvas** で行う(OpenCV の absdiff 相当。ピクセル差を赤く
 * ハイライト + mismatch 率を算出)。node 側に PNG デコード依存を持ち込まない
 * ため、Playwright のバージョンズレに影響されない。
 *
 * 出力は base64 画像を埋め込んだ**自己完結 HTML**(baseline | candidate |
 * diff | 説明 | 判定 の表)。外部リソース参照ゼロなので、そのまま共有できる。
 */
import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

export interface DiffResult {
  /** 差分ピクセル数 / 全ピクセル数(0=完全一致)。 */
  readonly mismatchRatio: number;
  readonly width: number;
  readonly height: number;
  /** 差分を赤ハイライトした PNG(base64、data: prefix なし)。 */
  readonly diffB64: string;
}

/**
 * baseline / candidate(PNG base64、prefix なし)をブラウザ内で比較する。
 * サイズが違う場合は大きい方に合わせ、はみ出しは差分扱い。
 *
 * @param threshold チャンネルごとの許容差(0-255)。既定 12(JPEG/AA 揺らぎ吸収)
 */
export async function diffImagesInBrowser(
  page: Page,
  baselineB64: string,
  candidateB64: string,
  threshold = 12,
): Promise<DiffResult> {
  return page.evaluate(
    async ({ a, b, thr }: { a: string; b: string; thr: number }) => {
      const load = (b64: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = (): void => res(img);
          img.onerror = (): void => rej(new Error('image decode failed'));
          img.src = `data:image/png;base64,${b64}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const draw = (img: HTMLImageElement): ImageData => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h);
      };
      const da = draw(ia).data;
      const db = draw(ib).data;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const octx = out.getContext('2d')!;
      const diff = octx.createImageData(w, h);
      const dd = diff.data;
      let mismatched = 0;
      const total = w * h;
      for (let i = 0; i < da.length; i += 4) {
        const dr = Math.abs(da[i]! - db[i]!);
        const dg = Math.abs(da[i + 1]! - db[i + 1]!);
        const dbl = Math.abs(da[i + 2]! - db[i + 2]!);
        const dal = Math.abs(da[i + 3]! - db[i + 3]!);
        const changed = dr > thr || dg > thr || dbl > thr || dal > thr;
        if (changed) {
          mismatched++;
          dd[i] = 255;
          dd[i + 1] = 0;
          dd[i + 2] = 80;
          dd[i + 3] = 255;
        } else {
          // 一致部は candidate を淡色で下敷きにして差分箇所を読みやすく。
          dd[i] = da[i]!;
          dd[i + 1] = da[i + 1]!;
          dd[i + 2] = da[i + 2]!;
          dd[i + 3] = 60;
        }
      }
      octx.putImageData(diff, 0, 0);
      const diffB64 = out.toDataURL('image/png').split(',')[1] ?? '';
      return { mismatchRatio: total ? mismatched / total : 0, width: w, height: h, diffB64 };
    },
    { a: baselineB64, b: candidateB64, thr: threshold },
  );
}

export interface VisualRow {
  readonly label: string;
  readonly description: string;
  readonly baselineB64: string;
  readonly candidateB64: string;
  readonly diff: DiffResult;
  /**
   * 判定のしきい値。
   * - 既定(`expectChange` 無し / false)= regression 用。**上限**として扱い、
   *   `mismatchRatio <= tolerance` で PASS(= 変わっていないこと)
   * - `expectChange: true` = 修正の before/after 用。**下限**として扱い、
   *   `mismatchRatio >= tolerance` で PASS(= ちゃんと変わったこと)
   */
  readonly tolerance: number;
  /**
   * 「差分が出ていること」を合格とする(修正前 / 修正後の比較レポート)。
   * 通常の visual regression とは判定の向きが逆になるので明示フラグにする ──
   * 比率を反転して渡す小細工をすると、表に出る数値まで反転して読めなくなる。
   */
  readonly expectChange?: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** base64 画像 3 枚 + 説明 + 判定の表を自己完結 HTML で書き出す。 */
export function writeVisualReport(
  rows: VisualRow[],
  outPath: string,
  opts: { title: string; viewport: string },
): { pass: number; fail: number } {
  let pass = 0;
  let fail = 0;
  const body = rows
    .map((r) => {
      const ok = r.expectChange
        ? r.diff.mismatchRatio >= r.tolerance
        : r.diff.mismatchRatio <= r.tolerance;
      if (ok) pass++;
      else fail++;
      const pct = (r.diff.mismatchRatio * 100).toFixed(3);
      const tolPct = (r.tolerance * 100).toFixed(3);
      const tolText = r.expectChange ? `要 ≥ ${tolPct}%` : `許容 ≤ ${tolPct}%`;
      const verdictText = r.expectChange
        ? (ok ? '修正あり' : '変化なし')
        : (ok ? 'PASS' : 'FAIL');
      const img = (b64: string): string =>
        `<img loading="lazy" src="data:image/png;base64,${b64}" alt="">`;
      return `
      <tr class="${ok ? 'ok' : 'ng'}">
        <td class="label">${esc(r.label)}</td>
        <td class="shot">${img(r.baselineB64)}<div class="cap">比較基準 baseline</div></td>
        <td class="shot">${img(r.candidateB64)}<div class="cap">比較対象 candidate</div></td>
        <td class="shot">${img(r.diff.diffB64)}<div class="cap">比較結果 diff（差分=赤）</div></td>
        <td class="desc">${esc(r.description)}</td>
        <td class="verdict">
          <div class="badge ${ok ? 'badge-ok' : 'badge-ng'}">${esc(verdictText)}</div>
          <div class="metric">差分 ${pct}%<br><span class="tol">${esc(tolText)}</span></div>
          <div class="metric dim">${r.diff.width}×${r.diff.height}px</div>
        </td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<title>${esc(opts.title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif;
    margin: 0; padding: 24px; background: #f6f7f9; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background: #14161a; color: #e6e6e6; } }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 13px; color: #666; margin-bottom: 16px; }
  @media (prefers-color-scheme: dark) { .meta { color: #999; } }
  .summary { display: inline-flex; gap: 12px; margin-bottom: 16px; font-size: 14px; }
  .s-ok { color: #157f3b; font-weight: 700; }
  .s-ng { color: #c0331f; font-weight: 700; }
  table { border-collapse: collapse; width: 100%; background: #fff; table-layout: fixed; }
  @media (prefers-color-scheme: dark) { table { background: #1c1f26; } }
  th, td { border: 1px solid #d9dde3; padding: 8px; vertical-align: top; text-align: left; }
  @media (prefers-color-scheme: dark) { th, td { border-color: #333a45; } }
  th { background: #eef1f5; font-size: 13px; position: sticky; top: 0; }
  @media (prefers-color-scheme: dark) { th { background: #232833; } }
  col.c-label { width: 96px; } col.c-shot { width: 24%; }
  col.c-desc { width: 260px; } col.c-verdict { width: 128px; }
  td.label { font-weight: 700; font-size: 13px; white-space: pre-line; word-break: break-word; }
  td.desc { font-size: 13px; line-height: 1.6; word-break: normal; overflow-wrap: anywhere; }
  td.shot img { width: 100%; height: auto; display: block; border: 1px solid #ccc; border-radius: 4px; }
  .cap { font-size: 11px; color: #777; margin-top: 3px; }
  td.verdict { width: 130px; text-align: center; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-weight: 700; font-size: 13px; }
  .badge-ok { background: rgba(21,127,59,.14); color: #157f3b; }
  .badge-ng { background: rgba(192,51,31,.14); color: #c0331f; }
  .metric { font-size: 12px; margin-top: 6px; }
  .metric.dim, .tol { color: #888; font-size: 11px; }
  tr.ng td.label { box-shadow: inset 3px 0 0 #c0331f; }
</style></head>
<body>
  <h1>${esc(opts.title)}</h1>
  <div class="meta">viewport: ${esc(opts.viewport)} ・ 画像比較: ブラウザ canvas absdiff（赤=差分） ・ すべて base64 埋め込みの自己完結 HTML</div>
  <div class="summary"><span class="s-ok">PASS ${pass}</span><span class="s-ng">FAIL ${fail}</span></div>
  <table>
    <colgroup>
      <col class="c-label"><col class="c-shot"><col class="c-shot"><col class="c-shot"><col class="c-desc"><col class="c-verdict">
    </colgroup>
    <thead><tr>
      <th>項目</th><th>比較基準</th><th>比較対象</th><th>比較結果</th><th>説明</th><th>判定</th>
    </tr></thead>
    <tbody>${body}
    </tbody>
  </table>
</body></html>`;
  writeFileSync(outPath, html, 'utf-8');
  return { pass, fail };
}
