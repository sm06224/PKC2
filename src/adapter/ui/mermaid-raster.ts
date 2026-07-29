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
 * 🔴 **ラスタ化してよいのは viewport に収まる図だけ**(2026-07-29、実測で確定)。
 *
 * ## 損得の境界は「面積の絶対値」ではなく「viewport に収まるか」
 *
 * 決め手は **SVG が既に「見えている分だけ焼く」機構を持っている**ことである。
 * compositor は SVG を**可視タイルだけ**ラスタする。ラスタ化はその機構を
 * **捨てて全体を焼く**行為なので:
 *
 * - 図が viewport **より大きい** → SVG の利点が効く。ラスタは必ず負ける
 * - 図が viewport **に収まる** → 「見えている分」= 「全体」で SVG の利点が消え、
 *   DOM が減るぶんラスタが勝つ(実測 blink_gc −1.8MB / 要素 898 → 13)
 *
 * ## 縮小してもダメだった(user 提起②への回答)
 *
 * 「canvas を定めずに無制限にレスポンシブさせるからメモリを食う」という診断は
 * **正しい**。上限画素を振ると renderer USS は単調に下がる:
 *
 * | ラスタ寸法 | renderer USS(svg 比) |
 * |---|---|
 * | 260×6310(内在) | +18.2 MB |
 * | 144×3483 | +7.7 MB |
 * | 72×1742 | +6.4 MB |
 * | 36×871 | **+5.1 MB** |
 *
 * **しかしどこまで縮めても SVG を下回らない。** 理由は 2 つ:
 *   1. 出力を縮めても **中間の `img.decode()` は SVG の内在サイズのまま**
 *      展開する(この実装も含め、縮小は `drawImage` の段でしか効かない)
 *   2. PNG blob / canvas / エンコードの固定費が乗る
 *
 * ⇒ **大きい図はラスタ化しない**。縮小して延命する道は無い。
 *
 * ## 倍率
 *
 * 1.0 = 「viewport に収まる図だけ」。1 画面に収まらない図は、そもそも
 * user がスクロールして見るものであり、SVG のタイル描画が正しい。
 */
export const MERMAID_RASTER_VIEWPORT_FACTOR = 1;

/**
 * ラスタ化してよいか(純関数)。viewport が測れなければ **false**
 * ── 測れないものを変換しない(この製品の計測規律と同じ向き)。
 */
export function fitsInViewport(
  cssW: number,
  cssH: number,
  viewW: number,
  viewH: number,
  factor = MERMAID_RASTER_VIEWPORT_FACTOR,
): boolean {
  if (!(viewW > 0) || !(viewH > 0)) return false;
  return cssW * cssH <= viewW * viewH * factor;
}

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
  // 🔴 viewport に収まる図だけ変換する。超える図は SVG のタイル描画のほうが
  //   軽い(上の doc を参照)。「大きい図こそ効きそう」は直感の罠だった。
  if (!fitsInViewport(cssW, cssH, view.innerWidth, view.innerHeight)) return false;

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
