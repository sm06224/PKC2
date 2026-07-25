// Chrome DevTools Protocol を素の WebSocket で話す — 依存ゼロ(Node 22 内蔵 WebSocket)
//
// Playwright / Puppeteer が下でやっていることの、このテストに要る分だけ。
// ブラウザと JSON を往復させる電話線であり、それ以上ではない。

export class Cdp {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #listeners = [];

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (ev) => this.#onMessage(String(ev.data)));
    ws.addEventListener('close', () => {
      for (const [, p] of this.#pending) p.reject(new Error('CDP 接続が閉じた'));
      this.#pending.clear();
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new Cdp(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error(`CDP に接続できない: ${url}`)), { once: true });
    });
  }

  #onMessage(text) {
    const msg = JSON.parse(text);
    if (msg.id !== undefined) {
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
      return;
    }
    for (const l of [...this.#listeners]) {
      if (l.method === msg.method && (l.sessionId === undefined || l.sessionId === msg.sessionId)) {
        l.fn(msg.params, msg.sessionId);
      }
    }
  }

  /** コマンドを送る。sessionId を渡すとそのタブ(セッション)宛て。 */
  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.#ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.#pending.set(id, { method, resolve, reject }));
  }

  /** イベント購読。戻り値は解除関数。 */
  on(method, fn, sessionId) {
    const l = { method, fn, sessionId };
    this.#listeners.push(l);
    return () => {
      const i = this.#listeners.indexOf(l);
      if (i >= 0) this.#listeners.splice(i, 1);
    };
  }

  /** イベントを 1 回だけ待つ。 */
  waitFor(method, sessionId, { timeout = 20000, filter } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`${method} を ${timeout}ms 待っても来ない`));
      }, timeout);
      const off = this.on(method, (params) => {
        if (filter && !filter(params)) return;
        clearTimeout(timer);
        off();
        resolve(params);
      }, sessionId);
    });
  }

  close() {
    try { this.#ws.close(); } catch { /* 幕引きの失敗は問わない */ }
  }
}
