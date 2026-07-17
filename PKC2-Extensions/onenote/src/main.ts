/**
 * PKC2 OneNote 送信拡張 — main(UI + pkc-ext child channel + Graph 送信)。
 *
 * 設計正本: host repo `docs/development/onenote-export-extension-design-2026-07.md`
 *
 * フロー:
 *   1. PKC2 で本拡張(単一 HTML 添付)を「PKC-Extension として扱う」+ 紐付け
 *   2. 会議メモ entry を右クリック「🧩 送る ▸」→ 本拡張が deliver で受領
 *      (本文中の `asset:` 参照添付 = 録音・画像も、同様に個別に送る)
 *   3. アクセストークン(Graph Explorer 等で取得、scope Notes.ReadWrite)を
 *      貼り付け → セクション読込 → 送信
 *   4. 成功したら OneNote ページの URL を表示(Copilot Notebooks の参照に追加)
 *
 * 認証 v0 はトークン手貼り(1 時間有効)。本格 OAuth(Entra app)は設計 doc
 * の Open Question 2 が決まってから。トークンはメモリ内のみ・保存しない。
 */

import {
  buildOneNotePage,
  buildMultipart,
  type DeliveredAsset,
  type OneNotePage,
} from './onenote-payload';
import './page.css';

const PKC_EXT = 'pkc-ext';
const PKC_EXT_V = 1;

interface DeliverPayload {
  kind: 'asset' | 'entry';
  lid?: string;
  asset_key?: string;
  mime?: string;
  filename?: string;
  body?: string;
  data_base64?: string;
}

/* ── state ── */
let memo: { lid: string; body: string } | null = null;
const assets = new Map<string, DeliveredAsset>();
let lastPage: OneNotePage | null = null;

/* ── DOM helpers ── */
function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}
function setStatus(text: string, kind: 'info' | 'warn' | 'error' | 'ok' = 'info'): void {
  const el = $('status');
  el.textContent = text;
  el.setAttribute('data-kind', kind);
}

/* ── pkc-ext child channel(TOFU: 最初の host push で source+nonce を pin)── */
let hostNonce: string | null = null;
let hostSource: MessageEventSource | null = null;

function startChannel(): void {
  const sendTo = (window.opener as Window | null)
    ?? (window.parent !== window ? window.parent : null);
  if (!sendTo) {
    setStatus('スタンドアロン起動です(PKC2 から拡張として開くと entry を受け取れます)', 'warn');
    return;
  }
  window.addEventListener('message', (ev) => {
    const d = ev.data as Record<string, unknown> | null;
    if (!d || d.pkc !== PKC_EXT || d.v !== PKC_EXT_V) return;
    if (hostSource === null && typeof d.nonce === 'string') {
      hostSource = ev.source;
      hostNonce = d.nonce;
    }
    if (ev.source !== hostSource || d.nonce !== hostNonce) return;
    if (d.t === 'deliver') onDeliver(d.payload as DeliverPayload);
  });
  try {
    sendTo.postMessage({ pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' }, '*');
  } catch { /* host gone */ }
}

function onDeliver(p: DeliverPayload): void {
  if (!p) return;
  if (p.kind === 'entry' && typeof p.body === 'string') {
    memo = { lid: p.lid ?? '', body: p.body };
    ($('memo-preview') as HTMLTextAreaElement).value = p.body;
    setStatus(`メモを受領しました(${p.lid ?? '?'})。不足添付があれば下の警告に出ます`, 'ok');
  } else if (p.kind === 'asset' && p.asset_key && typeof p.data_base64 === 'string') {
    assets.set(p.asset_key, {
      mime: p.mime ?? 'application/octet-stream',
      filename: p.filename ?? p.asset_key,
      base64: p.data_base64,
    });
    setStatus(`添付を受領しました: ${p.filename ?? p.asset_key}(計 ${assets.size} 件)`, 'ok');
  }
  refreshPreview();
}

/* ── preview / warnings ── */
function refreshPreview(): void {
  if (!memo) return;
  lastPage = buildOneNotePage({
    title: ($('page-title') as HTMLInputElement).value || 'PKC2 メモ',
    markdown: memo.body,
    assets,
    createdIso: new Date().toISOString(),
  });
  const warn = $('warnings');
  warn.innerHTML = '';
  for (const w of lastPage.warnings) {
    const li = document.createElement('li');
    li.textContent = w;
    warn.appendChild(li);
  }
  $('part-summary').textContent =
    `parts: 本文 + 画像 ${lastPage.parts.filter((p) => p.name.startsWith('img')).length} / `
    + `添付 ${lastPage.parts.filter((p) => p.name.startsWith('file')).length}`;
  ($('xhtml-preview') as HTMLTextAreaElement).value = lastPage.xhtml;
}

/* ── Graph API ── */
const GRAPH = 'https://graph.microsoft.com/v1.0';

function token(): string {
  return ($('token') as HTMLInputElement).value.trim();
}

async function loadSections(): Promise<void> {
  if (!token()) { setStatus('先にアクセストークンを貼り付けてください', 'warn'); return; }
  setStatus('セクション一覧を取得中…');
  try {
    const res = await fetch(
      `${GRAPH}/me/onenote/sections?$select=id,displayName&$expand=parentNotebook($select=displayName)&$top=100`,
      { headers: { Authorization: `Bearer ${token()}` } },
    );
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const json = await res.json() as { value: { id: string; displayName: string; parentNotebook?: { displayName?: string } }[] };
    const sel = $('section') as HTMLSelectElement;
    sel.innerHTML = '';
    for (const s of json.value) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.parentNotebook?.displayName ?? '?'} / ${s.displayName}`;
      sel.appendChild(opt);
    }
    setStatus(`セクション ${json.value.length} 件を読み込みました`, 'ok');
  } catch (err) {
    setStatus(`セクション取得に失敗: ${(err as Error).message}`, 'error');
  }
}

async function sendPage(): Promise<void> {
  if (!memo || !lastPage) { setStatus('先に PKC2 からメモを送ってください', 'warn'); return; }
  if (!token()) { setStatus('アクセストークンを貼り付けてください', 'warn'); return; }
  const sectionId = ($('section') as HTMLSelectElement).value;
  if (!sectionId) { setStatus('送信先セクションを選んでください', 'warn'); return; }

  refreshPreview(); // 最新タイトル・添付で組み直し
  const { contentType, bodyParts } = buildMultipart(lastPage!);
  setStatus('OneNote へ送信中…');
  try {
    const res = await fetch(`${GRAPH}/me/onenote/sections/${encodeURIComponent(sectionId)}/pages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': contentType },
      body: new Blob(bodyParts as BlobPart[]),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const json = await res.json() as { links?: { oneNoteWebUrl?: { href?: string } } };
    const url = json.links?.oneNoteWebUrl?.href ?? '';
    const link = $('result-link') as HTMLAnchorElement;
    if (url) {
      link.href = url;
      link.textContent = '📓 作成したページを OneNote で開く(Copilot Notebook の参照に追加できます)';
      link.style.display = 'inline';
    }
    setStatus('✅ OneNote ページを作成しました', 'ok');
  } catch (err) {
    setStatus(`送信に失敗: ${(err as Error).message}`, 'error');
  }
}

/* ── boot ── */
function boot(): void {
  $('load-sections').addEventListener('click', () => { void loadSections(); });
  $('send').addEventListener('click', () => { void sendPage(); });
  $('page-title').addEventListener('input', refreshPreview);
  startChannel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
