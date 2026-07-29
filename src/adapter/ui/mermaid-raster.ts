/**
 * mermaid の**ラスタ表示**(C6-a、2026-07-29)。
 *
 * doc §4 の③「ユーザーのモニタや描画エリアサイズに適したレンダリングを行い
 * 低解像度キャッシング」の mermaid 版。描画済み SVG を**表示サイズ ×
 * devicePixelRatio** で 1 枚の PNG にして `<img>` へ差し替える。
 *
 * ## 🔴 詰まったのは `<foreignObject>` ではなく **Blob URL** だった
 *
 * mermaid の flowchart SVG は既定で HTML ラベル(`<foreignObject>`)を使う
 * (ノード 60 の図で 121 個)。当初これが原因で canvas が汚染されると判断したが、
 * **実測で 3 通り試したら切り分けが逆だった**:
 *
 * | 経路 | 結果 |
 * |---|---|
 * | Blob URL / `<foreignObject>` あり | 🔴 `The canvas has been tainted by cross-origin data.` |
 * | **Data URL** / `<foreignObject>` あり | ✅ 通る(PNG 95.2 KB) |
 * | Data URL / `<foreignObject>` 除去 | ✅ 通る(PNG 30.6 KB) |
 *
 * ラベル入り(Data URL)と除去版の**画素差は 2.58%** ── foreignObject の中身が
 * ちゃんと描けている。よって **`htmlLabels: false`(見た目が変わる)は不要**で、
 * 既存の図の見た目を 1 ピクセルも変えずにラスタ化できる。
 *
 * ⇒ **必ず Data URL を使うこと。** `URL.createObjectURL` に変えると
 *   `toBlob` / `getImageData` が SecurityError で落ちる。
 *
 * ## 失敗したら SVG のまま残す
 *
 * ラスタ化は**表示の最適化**であって、図の正本ではない。直列化・decode・
 * canvas・toBlob のどこで転んでも、**元の SVG を DOM に残したまま false を返す**
 * ── 「軽くしようとして図が消えた」は絶対に起こさない。
 */

/** ラスタ化を試みる最小の SVG 要素数(これ未満は元から軽く、変換の意味が無い)。 */
export const MERMAID_RASTER_MIN_ELEMENTS = 200;

/**
 * 🔴 **ラスタ化してよい表示面積の上限(画素)**。これを超える図は SVG のまま。
 *
 * ## なぜ要るか(実測。初稿の「メモリは減らない」を撤回した理由)
 *
 * ラスタ化の収支は**図の形で符号が変わる**。3 回反復の中央値:
 *
 * | 図 | 表示画素 | blink_gc | cc | 差引 |
 * |---|---|---|---|---|
 * | 縦長 260×6310 | 1.64M | −1.7 MB | **+4.5 MB** | **+2.8 MB(損)** |
 * | 横長 866×6 | 0.01M | −2.0 MB | ±0.0 MB | **−2.0 MB(得)** |
 *
 * 機構: **`<img>` は図全体の展開後ビットマップを持つ**が、SVG は compositor が
 * 見えているタイルだけラスタする。よって **cc の増分は画素面積にほぼ比例**し
 * (実測 ≒ 2.7 B/画素)、**blink_gc の節約(≒ 2MB)は要素数で決まり面積に依らない**。
 *
 * 損益分岐は 2MB ÷ 2.7 B/画素 ≒ **0.74M 画素**。安全側に倒して **0.5M 画素**
 * (例 1000×500 / 800×620)を上限にする ── 画面に収まる図はほぼ入り、
 * 「縦に延々と続く図」だけが除外される。
 *
 * ⚠ この値は**実測から出した**ものであって理屈だけの値ではない。
 *   変えるときは `tests/bench/mermaid-raster-probe.mjs` を回し直すこと。
 */
export const MERMAID_RASTER_MAX_AREA = 500_000;

/**
 * `<img>` に付ける印。
 * - `data-pkc-mermaid-raster` … ラスタ済みであることと、その時の css 幅
 * - `data-pkc-blob-url` … **既存の Blob URL 回収機構に乗せる**
 *   (`cleanupBlobUrls` / `center-block-controller` の revoke がそのまま効く)
 */
const RASTER_MARK = 'data-pkc-mermaid-raster';

/** すでに同じ幅でラスタ済みか(窓の描き替えで何度も走るので要る)。 */
export function isRasterUpToDate(wrap: HTMLElement, cssWidth: number): boolean {
  const img = wrap.querySelector<HTMLImageElement>(`img[${RASTER_MARK}]`);
  if (!img) return false;
  const had = Number(img.getAttribute(RASTER_MARK) ?? '-1');
  // 1px 未満のゆらぎで作り直さない(scrollbar の出入りで幅は微動する)。
  return Math.abs(had - cssWidth) < 1.5;
}

/**
 * `.pkc-mermaid-rendered` の中の `<svg>` を PNG の `<img>` に差し替える。
 *
 * @returns 差し替えたら true。**false でも SVG はそのまま残っている**
 */
export async function rasterizeMermaidWrap(wrap: HTMLElement): Promise<boolean> {
  const doc = wrap.ownerDocument;
  const view = doc?.defaultView;
  if (!doc || !view) return false;
  const svg = wrap.querySelector('svg');
  if (!svg) return false;

  const rect = svg.getBoundingClientRect();
  const cssW = Math.round(rect.width);
  const cssH = Math.round(rect.height);
  // layout 前(幅 0)では測れない ── 測れないものは変換しない。
  if (!(cssW > 0) || !(cssH > 0)) return false;
  if (isRasterUpToDate(wrap, cssW)) return true;
  if (svg.querySelectorAll('*').length < MERMAID_RASTER_MIN_ELEMENTS) return false;
  // 🔴 面積で足切りする。超える図は**ラスタ化しないほうがメモリが少ない**
  //   (上の表を参照)。「大きい図こそ効きそう」は直感の罠だった。
  if (cssW * cssH > MERMAID_RASTER_MAX_AREA) return false;

  const scale = view.devicePixelRatio || 1;

  let objectUrl: string | null = null;
  try {
    const clone = svg.cloneNode(true) as SVGElement;
    // 直列化した SVG は viewport を持たないので、明示的に寸法を与える。
    clone.setAttribute('width', String(cssW));
    clone.setAttribute('height', String(cssH));
    const xml = new XMLSerializer().serializeToString(clone);
    // 🔴 **Data URL で渡す**(上記のとおり Blob URL だと canvas が汚染される)。
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

    const loaded = new view.Image() as HTMLImageElement;
    loaded.src = src;
    await loaded.decode();

    const canvas = doc.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cssW * scale));
    canvas.height = Math.max(1, Math.round(cssH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(loaded, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/png');
      } catch {
        resolve(null); // 汚染されていた等 ── SVG のまま残す
      }
    });
    if (!blob) return false;

    objectUrl = view.URL.createObjectURL(blob);
    const out = doc.createElement('img');
    out.src = objectUrl;
    out.className = 'pkc-mermaid-raster';
    out.setAttribute(RASTER_MARK, String(cssW));
    // 既存の Blob URL 回収機構に乗せる(render cycle / 窓の描き替えの両方)。
    out.setAttribute('data-pkc-blob-url', objectUrl);
    out.setAttribute('alt', '');
    out.setAttribute('aria-hidden', 'true');
    out.style.width = `${cssW}px`;
    out.style.height = `${cssH}px`;
    out.style.maxWidth = '100%';
    // decode まで待ってから差し替える ── 差し替えた瞬間に空白が出ない。
    await out.decode().catch(() => { /* decode 失敗は下で握る */ });
    if (!svg.isConnected) {
      view.URL.revokeObjectURL(objectUrl);
      return false;
    }
    svg.replaceWith(out);
    return true;
  } catch {
    if (objectUrl) view.URL.revokeObjectURL(objectUrl);
    return false; // SVG はそのまま
  }
}
