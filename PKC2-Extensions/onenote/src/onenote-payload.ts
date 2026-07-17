/**
 * OneNote ページ payload builder(pure、DOM 生成のみ・ネットワークなし)。
 *
 * 設計正本: host repo `docs/development/onenote-export-extension-design-2026-07.md`
 *
 * 入力: PKC2 から deliver された entry の markdown 本文 + 受領済み asset 群
 * 出力: OneNote API(`POST …/onenote/sections/{id}/pages`)へ渡す
 *        well-formed XHTML(Presentation part)+ binary parts + 警告
 *
 * 制約(Graph OneNote API):
 *   - `<img data-render-src="name:X">` の binary part は最大 5 / リクエスト
 *   - `<object data-attachment>` の binary part は最大 1 / リクエスト
 *   - script / style / form は API 側で除去。well-formed XHTML 必須
 *
 * markdown 変換は**会議メモ向けサブセット**(見出し / 段落 / リスト /
 * フェンスコード / 引用 / パイプ表 / リンク / 強調 / インラインコード)。
 * PKC 方言(:::format 等)は素の段落に落ちる(lossy、README に明記)。
 */

export interface DeliveredAsset {
  mime: string;
  filename: string;
  base64: string;
}

export interface OneNotePart {
  /** multipart part 名(imgN / fileN)。 */
  name: string;
  mime: string;
  filename: string;
  base64: string;
}

export interface OneNotePage {
  /** Presentation part(well-formed XHTML 全文)。 */
  xhtml: string;
  parts: OneNotePart[];
  warnings: string[];
}

export const MAX_IMAGE_PARTS = 5;
export const MAX_OBJECT_PARTS = 1;

/* ── markdown サブセット → block 構造 ─────────────────────────── */

type Block =
  | { kind: 'heading'; level: number; inline: string }
  | { kind: 'para'; inline: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; inline: string }
  | { kind: 'table'; rows: string[][] };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') { i++; continue; }

    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) { buf.push(lines[i]!); i++; }
      i++; // closing fence(EOF でも安全)
      blocks.push({ kind: 'code', lang: fence[1] ?? '', text: buf.join('\n') });
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length, inline: heading[2]! });
      i++;
      continue;
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        buf.push(lines[i]!.replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', inline: buf.join(' ') });
      continue;
    }

    if (/^\|.+\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i]!)) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        // separator 行(|---|---|)は捨てる
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length > 0) blocks.push({ kind: 'table', rows });
      continue;
    }

    // 段落: 連続する通常行を 1 段落に(改行は空白)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length
      && lines[i]!.trim() !== ''
      && !/^(#{1,6})\s/.test(lines[i]!)
      && !/^```/.test(lines[i]!)
      && !/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[i]!)
      && !/^>\s?/.test(lines[i]!)
      && !/^\|.+\|\s*$/.test(lines[i]!)
    ) {
      buf.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: 'para', inline: buf.join(' ') });
  }
  return blocks;
}

/* ── inline markdown → DOM ────────────────────────────────────── */

interface AssetSink {
  /** asset key → 挿入結果(再利用時に同じ part を指す)。 */
  imageEl(key: string, alt: string): Element | Text;
  objectEl(key: string, label: string): Element | Text;
}

const INLINE_RE =
  /(!?\[[^\]\n]*\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(`[^`\n]+`)/g;

function renderInline(doc: Document, text: string, sink: AssetSink): Node[] {
  const out: Node[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(doc.createTextNode(text.slice(last, idx)));
    const token = m[0]!;
    if (token.startsWith('`')) {
      const code = doc.createElement('code');
      code.textContent = token.slice(1, -1);
      out.push(code);
    } else if (token.startsWith('**')) {
      const b = doc.createElement('b');
      b.textContent = token.slice(2, -2);
      out.push(b);
    } else if (token.startsWith('*')) {
      const it = doc.createElement('i');
      it.textContent = token.slice(1, -1);
      out.push(it);
    } else {
      // [label](target) / ![alt](target)
      const isImage = token.startsWith('!');
      const lm = /^!?\[([^\]]*)\]\(([^)\s]+)\)$/.exec(token)!;
      const label = lm[1] ?? '';
      const target = lm[2] ?? '';
      if (target.startsWith('asset:')) {
        const key = target.slice('asset:'.length);
        out.push(isImage ? sink.imageEl(key, label) : sink.objectEl(key, label));
      } else if (isImage && target.startsWith('data:image/')) {
        const img = doc.createElement('img');
        img.setAttribute('src', target);
        if (label) img.setAttribute('alt', label);
        out.push(img);
      } else if (/^https?:\/\//.test(target)) {
        const a = doc.createElement('a');
        a.setAttribute('href', target);
        a.textContent = label || target;
        out.push(a);
      } else {
        out.push(doc.createTextNode(label || target));
      }
    }
    last = idx + token.length;
  }
  if (last < text.length) out.push(doc.createTextNode(text.slice(last)));
  return out;
}

/* ── page builder ─────────────────────────────────────────────── */

export function buildOneNotePage(opts: {
  title: string;
  markdown: string;
  assets: Map<string, DeliveredAsset>;
  /** ページ作成時刻(meta created)。省略時は未指定 = OneNote 側の受領時刻。 */
  createdIso?: string;
}): OneNotePage {
  const doc = document.implementation.createHTMLDocument('');
  const warnings: string[] = [];
  const parts: OneNotePart[] = [];
  const partByKey = new Map<string, OneNotePart | null>(); // null = 上限超過等で不採用

  let imgCount = 0;
  let objCount = 0;

  const sink: AssetSink = {
    imageEl(key, alt) {
      const known = opts.assets.get(key);
      if (!known || !known.mime.startsWith('image/')) {
        if (!known) warnings.push(`画像 asset 未受領: ${key}(この添付も拡張へ送ってください)`);
        return doc.createTextNode(alt ? `[画像: ${alt}]` : `[画像: ${key}]`);
      }
      let part = partByKey.get(key);
      if (part === undefined) {
        if (imgCount >= MAX_IMAGE_PARTS) {
          warnings.push(`画像は 1 ページ ${MAX_IMAGE_PARTS} 枚まで — ${known.filename} は省略しました`);
          part = null;
        } else {
          imgCount++;
          part = { name: `img${imgCount}`, mime: known.mime, filename: known.filename, base64: known.base64 };
          parts.push(part);
        }
        partByKey.set(key, part);
      }
      if (!part) return doc.createTextNode(`[画像(省略): ${known.filename}]`);
      const img = doc.createElement('img');
      img.setAttribute('data-render-src', `name:${part.name}`);
      if (alt) img.setAttribute('alt', alt);
      return img;
    },
    objectEl(key, label) {
      const known = opts.assets.get(key);
      if (!known) {
        warnings.push(`添付 asset 未受領: ${key}(この添付も拡張へ送ってください)`);
        return doc.createTextNode(label ? `[添付: ${label}]` : `[添付: ${key}]`);
      }
      let part = partByKey.get(key);
      if (part === undefined) {
        if (objCount >= MAX_OBJECT_PARTS) {
          warnings.push(`ファイル添付は 1 ページ ${MAX_OBJECT_PARTS} 個まで — ${known.filename} は省略しました`);
          part = null;
        } else {
          objCount++;
          part = { name: `file${objCount}`, mime: known.mime, filename: known.filename, base64: known.base64 };
          parts.push(part);
        }
        partByKey.set(key, part);
      }
      if (!part) return doc.createTextNode(`[添付(省略): ${known.filename}]`);
      const obj = doc.createElement('object');
      obj.setAttribute('data-attachment', part.filename);
      obj.setAttribute('data', `name:${part.name}`);
      obj.setAttribute('type', part.mime);
      return obj;
    },
  };

  const body = doc.body;
  for (const block of parseBlocks(opts.markdown)) {
    switch (block.kind) {
      case 'heading': {
        const h = doc.createElement(`h${Math.min(block.level, 6)}`);
        for (const n of renderInline(doc, block.inline, sink)) h.appendChild(n);
        body.appendChild(h);
        break;
      }
      case 'para': {
        const p = doc.createElement('p');
        for (const n of renderInline(doc, block.inline, sink)) p.appendChild(n);
        body.appendChild(p);
        break;
      }
      case 'list': {
        const list = doc.createElement(block.ordered ? 'ol' : 'ul');
        for (const item of block.items) {
          const li = doc.createElement('li');
          for (const n of renderInline(doc, item, sink)) li.appendChild(n);
          list.appendChild(li);
        }
        body.appendChild(list);
        break;
      }
      case 'code': {
        const pre = doc.createElement('pre');
        pre.textContent = block.text;
        body.appendChild(pre);
        break;
      }
      case 'quote': {
        // OneNote の blockquote 対応は限定的 → i 段落に縮約
        const p = doc.createElement('p');
        const it = doc.createElement('i');
        for (const n of renderInline(doc, block.inline, sink)) it.appendChild(n);
        p.appendChild(it);
        body.appendChild(p);
        break;
      }
      case 'table': {
        const table = doc.createElement('table');
        for (const row of block.rows) {
          const tr = doc.createElement('tr');
          for (const cell of row) {
            const td = doc.createElement('td');
            for (const n of renderInline(doc, cell, sink)) td.appendChild(n);
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
        body.appendChild(table);
        break;
      }
    }
  }

  const titleEl = doc.createElement('title');
  titleEl.textContent = opts.title;
  doc.head.appendChild(titleEl);
  if (opts.createdIso) {
    const meta = doc.createElement('meta');
    meta.setAttribute('name', 'created');
    meta.setAttribute('content', opts.createdIso);
    doc.head.appendChild(meta);
  }

  // well-formed XHTML 化(OneNote API 要件)。XMLSerializer は空要素を
  // self-closing にし、属性 quote を保証する。
  const xhtml = '<?xml version="1.0" encoding="utf-8" ?>\n'
    + new XMLSerializer().serializeToString(doc.documentElement);

  return { xhtml, parts, warnings };
}

/* ── multipart 組み立て ───────────────────────────────────────── */

export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * `POST pages` 用 multipart/form-data を組む。fetch(url, { body }) にそのまま
 * 渡せる BlobPart 配列と Content-Type を返す(pure — fetch はしない)。
 */
export function buildMultipart(
  page: OneNotePage,
  boundary = `pkc2onenote${Date.now().toString(36)}`,
): { contentType: string; bodyParts: (string | Uint8Array)[] } {
  const bodyParts: (string | Uint8Array)[] = [];
  bodyParts.push(
    `--${boundary}\r\n`
    + 'Content-Disposition: form-data; name="Presentation"\r\n'
    + 'Content-Type: application/xhtml+xml\r\n\r\n'
    + page.xhtml + '\r\n',
  );
  for (const part of page.parts) {
    bodyParts.push(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${part.name}"\r\n`
      + `Content-Type: ${part.mime}\r\n\r\n`,
    );
    bodyParts.push(base64ToBytes(part.base64));
    bodyParts.push('\r\n');
  }
  bodyParts.push(`--${boundary}--\r\n`);
  return { contentType: `multipart/form-data; boundary=${boundary}`, bodyParts };
}
