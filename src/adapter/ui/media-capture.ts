/**
 * 録音・画面収録 → asset 化(#922、user 要望 2026-07-16)。
 *
 * 「録音と画面収録をマルチメディアで埋め込めるようにする。PKC でも録画と
 *  録音をできるようにしたい。これで、会議メモをうまく残せるはず」
 *
 * 設計(issue #922):
 *   - 🎙 録音: `getUserMedia({audio})` → MediaRecorder(webm/opus 優先)
 *   - 🖥 画面収録: `getDisplayMedia({video, audio})` → MediaRecorder。
 *     ブラウザ側の「共有を停止」でも正しく終了する(track ended 監視)
 *   - 収録中は fixed オーバーレイ(経過時間 + 概算サイズ + 停止 / 破棄)
 *   - 停止 → blob → base64 → 既存 `PASTE_ATTACHMENT` 経路で attachment
 *     entry + asset 化(dedupe / 配置は既存 reducer に委譲)
 *   - 参照挿入: 選択中の TEXT は本文末尾へ、TEXTLOG はログ 1 件として
 *     `[name](asset:key)` を追記(#921 の埋め込みプレーヤーで即再生可)。
 *     編集中(editing、対象 entry の body textarea がある)ならカーソル位置
 *     へ挿入。その他 archetype は attachment 作成のみ + toast 案内
 *   - サイズ保護: hard reject(既定 250MB flag)の 80% で警告 toast、
 *     100% 到達で自動停止(それまでの収録分は保存される)
 *   - 非対応ブラウザ / 権限拒否は安全に no-op + toast 案内
 *
 * 同時収録は 1 本のみ(2 本目の開始要求は toast で案内)。
 */

import type { Dispatcher } from '../state/dispatcher';
import { showToast } from './toast';
import { attachmentRejectHardBytes } from './guardrails';
import { parseTextlogBody, serializeTextlogBody, appendLogEntry } from '../../features/textlog/textlog-body';

/** テスト注入用の縫い目(MediaRecorder / getUserMedia / getDisplayMedia)。 */
export interface MediaCaptureDeps {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** MediaRecorder コンストラクタ(テストで fake に差し替え)。 */
  recorderCtor?: typeof MediaRecorder;
  /** サイズ上限 bytes(既定 = attachment hard reject flag)。 */
  maxBytes?: number;
}

interface ActiveSession {
  kind: 'audio' | 'screen';
  recorder: { stop: () => void; state?: string };
  stream: { getTracks: () => { stop: () => void }[] };
  overlay: HTMLElement;
  timer: ReturnType<typeof setInterval>;
  discarded: boolean;
}

let active: ActiveSession | null = null;

/** 収録中か(palette 二重起動ガード / テスト観測用)。 */
export function isCapturing(): boolean {
  return active !== null;
}

function pickMimeType(
  ctor: { isTypeSupported?: (t: string) => boolean } | undefined,
  kind: 'audio' | 'screen',
): string {
  const candidates = kind === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  if (ctor && typeof ctor.isTypeSupported === 'function') {
    for (const c of candidates) {
      if (ctor.isTypeSupported(c)) return c;
    }
  }
  return kind === 'audio' ? 'audio/webm' : 'video/webm';
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * 収録結果の参照 `[name](asset:key)` を文脈へ挿入する。
 * 優先順: 編集中 body textarea(カーソル位置)→ TEXT 本文末尾 →
 * TEXTLOG ログ追記 → 挿入なし(false)。
 */
export function insertRecordingReference(
  dispatcher: Dispatcher,
  contextLid: string,
  ref: string,
): boolean {
  const state = dispatcher.getState();
  const entry = state.container?.entries.find((e) => e.lid === contextLid);
  if (!entry) return false;

  // 編集中(当該 entry)なら body textarea のカーソル位置へ。
  if (state.phase === 'editing' && state.editingLid === contextLid) {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (ta) {
      const pos = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, pos) + ref + ta.value.slice(pos);
      const next = pos + ref.length;
      ta.setSelectionRange(next, next);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  }

  if (entry.archetype === 'text') {
    const sep = entry.body.trim() === '' ? '' : '\n\n';
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: contextLid, body: entry.body + sep + ref });
    return true;
  }
  if (entry.archetype === 'textlog') {
    const log = parseTextlogBody(entry.body);
    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: contextLid,
      body: serializeTextlogBody(appendLogEntry(log, ref)),
    });
    return true;
  }
  return false;
}

function buildOverlay(
  kind: 'audio' | 'screen',
  onStop: () => void,
  onDiscard: () => void,
): { overlay: HTMLElement; elapsedEl: HTMLElement; sizeEl: HTMLElement } {
  document.querySelector('[data-pkc-region="media-capture-overlay"]')?.remove();
  const overlay = document.createElement('div');
  overlay.setAttribute('data-pkc-region', 'media-capture-overlay');
  overlay.className = 'pkc-media-capture-overlay';

  const dot = document.createElement('span');
  dot.className = 'pkc-media-capture-dot';
  dot.textContent = '●';
  overlay.appendChild(dot);

  const label = document.createElement('span');
  label.className = 'pkc-media-capture-label';
  label.textContent = kind === 'audio' ? '🎙 録音中' : '🖥 画面収録中';
  overlay.appendChild(label);

  const elapsedEl = document.createElement('span');
  elapsedEl.className = 'pkc-media-capture-elapsed';
  elapsedEl.setAttribute('data-pkc-region', 'media-capture-elapsed');
  elapsedEl.textContent = '00:00';
  overlay.appendChild(elapsedEl);

  const sizeEl = document.createElement('span');
  sizeEl.className = 'pkc-media-capture-size';
  sizeEl.setAttribute('data-pkc-region', 'media-capture-size');
  sizeEl.textContent = '0 KB';
  overlay.appendChild(sizeEl);

  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'pkc-btn pkc-media-capture-stop';
  stopBtn.setAttribute('data-pkc-action', 'media-capture-stop');
  stopBtn.textContent = '⏹ 停止して保存';
  stopBtn.addEventListener('click', onStop);
  overlay.appendChild(stopBtn);

  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.className = 'pkc-btn pkc-media-capture-discard';
  discardBtn.setAttribute('data-pkc-action', 'media-capture-discard');
  discardBtn.setAttribute('title', '保存せず収録を破棄');
  discardBtn.textContent = '✕';
  discardBtn.addEventListener('click', onDiscard);
  overlay.appendChild(discardBtn);

  document.body.appendChild(overlay);
  return { overlay, elapsedEl, sizeEl };
}

function teardown(session: ActiveSession): void {
  clearInterval(session.timer);
  session.overlay.remove();
  try {
    for (const t of session.stream.getTracks()) t.stop();
  } catch { /* already stopped */ }
  if (active === session) active = null;
}

/** blob → base64(data: prefix なし)。 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

async function startCapture(
  dispatcher: Dispatcher,
  kind: 'audio' | 'screen',
  deps: MediaCaptureDeps,
): Promise<void> {
  if (active) {
    showToast({ message: 'すでに収録中です(オーバーレイの ⏹ で停止してから開始してください)', kind: 'warn' });
    return;
  }
  const state = dispatcher.getState();
  if (state.readonly || !state.container) {
    showToast({ message: '読み取り専用コンテナでは収録できません', kind: 'warn' });
    return;
  }
  const contextLid = state.editingLid ?? state.selectedLid;

  const md = (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);
  const getStream = kind === 'audio'
    ? (deps.getUserMedia ?? (md?.getUserMedia ? md.getUserMedia.bind(md) : undefined))
    : (deps.getDisplayMedia ?? (md?.getDisplayMedia ? md.getDisplayMedia.bind(md) : undefined));
  const RecorderCtor = deps.recorderCtor
    ?? (typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined);
  if (!getStream || !RecorderCtor) {
    showToast({
      message: kind === 'audio'
        ? 'このブラウザは録音(MediaRecorder)に対応していません'
        : 'このブラウザは画面収録(getDisplayMedia)に対応していません(モバイルでは使えません)',
      kind: 'warn',
    });
    return;
  }

  let stream: MediaStream;
  try {
    stream = await getStream(kind === 'audio' ? { audio: true } : { video: true, audio: true });
  } catch {
    showToast({
      message: kind === 'audio'
        ? 'マイクへのアクセスが許可されませんでした'
        : '画面共有がキャンセルされました',
      kind: 'warn',
    });
    return;
  }

  const mimeType = pickMimeType(RecorderCtor as unknown as { isTypeSupported?: (t: string) => boolean }, kind);
  let recorder: MediaRecorder;
  try {
    recorder = new RecorderCtor(stream, { mimeType });
  } catch {
    try {
      recorder = new RecorderCtor(stream);
    } catch {
      for (const t of stream.getTracks()) t.stop();
      showToast({ message: '収録を開始できませんでした(MediaRecorder 初期化失敗)', kind: 'error' });
      return;
    }
  }

  const maxBytes = deps.maxBytes ?? attachmentRejectHardBytes();
  const warnBytes = Math.floor(maxBytes * 0.8);
  const chunks: Blob[] = [];
  let totalBytes = 0;
  let warned = false;
  const startedAt = Date.now();

  const session: ActiveSession = {
    kind,
    recorder,
    stream,
    overlay: null as unknown as HTMLElement,
    timer: 0 as unknown as ReturnType<typeof setInterval>,
    discarded: false,
  };

  const requestStop = (): void => {
    try {
      recorder.stop();
    } catch { /* already inactive */ }
  };
  const requestDiscard = (): void => {
    session.discarded = true;
    requestStop();
  };

  const { overlay, elapsedEl, sizeEl } = buildOverlay(kind, requestStop, requestDiscard);
  session.overlay = overlay;
  session.timer = setInterval(() => {
    elapsedEl.textContent = formatElapsed(Date.now() - startedAt);
    sizeEl.textContent = `≈ ${formatBytes(totalBytes)}`;
  }, 500);
  active = session;

  recorder.ondataavailable = (e: BlobEvent): void => {
    if (!e.data || e.data.size === 0) return;
    chunks.push(e.data);
    totalBytes += e.data.size;
    if (!warned && totalBytes >= warnBytes) {
      warned = true;
      showToast({
        message: `収録サイズが上限(${formatBytes(maxBytes)})の 80% に達しました。まもなく自動停止します`,
        kind: 'warn',
      });
    }
    if (totalBytes >= maxBytes) {
      showToast({ message: '収録サイズが上限に達したため自動停止しました(それまでの収録分は保存されます)', kind: 'warn' });
      requestStop();
    }
  };

  // ブラウザ UI の「共有を停止」等で track が終わった場合も保存経路へ。
  try {
    for (const t of stream.getTracks()) {
      (t as MediaStreamTrack).addEventListener?.('ended', requestStop);
    }
  } catch { /* stub streams in tests may not support this */ }

  recorder.onstop = (): void => {
    void (async () => {
      teardown(session);
      if (session.discarded) {
        showToast({ message: '収録を破棄しました', kind: 'info' });
        return;
      }
      if (chunks.length === 0) {
        showToast({ message: '収録データがありませんでした', kind: 'warn' });
        return;
      }
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      let base64: string;
      try {
        base64 = await blobToBase64(blob);
      } catch (err) {
        showToast({ message: `収録の保存に失敗しました: ${(err as Error).message ?? 'read error'}`, kind: 'error' });
        return;
      }

      const ts = new Date(startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const name = kind === 'audio' ? `recording-${ts}.${ext}` : `screen-${ts}.${ext}`;
      const assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // context が消えている(entry 削除等)場合も attachment 単体としては残す。
      const nowState = dispatcher.getState();
      const lid = contextLid && nowState.container?.entries.some((e) => e.lid === contextLid)
        ? contextLid
        : nowState.selectedLid ?? nowState.container?.entries[0]?.lid ?? '';

      dispatcher.dispatch({
        type: 'PASTE_ATTACHMENT',
        name,
        mime: mimeType.split(';')[0]!,
        size: blob.size,
        assetKey,
        assetData: base64,
        contextLid: lid,
      });

      const ref = `[${name}](asset:${assetKey})`;
      const inserted = lid ? insertRecordingReference(dispatcher, lid, ref) : false;
      showToast({
        message: inserted
          ? `収録を保存し、参照を挿入しました(${name} / ${formatBytes(blob.size)})`
          : `収録を attachment として保存しました(${name} / ${formatBytes(blob.size)})。本文に埋め込むには [名前](asset:${assetKey}) を貼り付けてください`,
        kind: 'info',
      });
    })();
  };

  try {
    // timeslice 1s: 長時間収録でもメモリに 1 blob 巨大化せず、サイズ監視も逐次。
    recorder.start(1000);
  } catch {
    teardown(session);
    showToast({ message: '収録を開始できませんでした', kind: 'error' });
    return;
  }
  showToast({
    message: kind === 'audio'
      ? '🎙 録音を開始しました(右下のオーバーレイで停止できます)'
      : '🖥 画面収録を開始しました(右下のオーバーレイ、またはブラウザの「共有を停止」で終了)',
    kind: 'info',
  });
}

/** 🎙 録音を開始(palette コマンドの実体)。 */
export function startAudioRecording(dispatcher: Dispatcher, deps: MediaCaptureDeps = {}): Promise<void> {
  return startCapture(dispatcher, 'audio', deps);
}

/** 🖥 画面収録を開始(palette コマンドの実体)。 */
export function startScreenRecording(dispatcher: Dispatcher, deps: MediaCaptureDeps = {}): Promise<void> {
  return startCapture(dispatcher, 'screen', deps);
}
