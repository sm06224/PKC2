// 人間の手 — マウスは曲線を描き、キーには緩急がある
//
// locator.click() のような瞬間移動はしない。
// カーソルは今いる場所から目標まで、少し膨らんだ軌道を緩急をつけて運ばれ、
// 押す前にはかならず「そこに本当に見えているか」(elementFromPoint)を確かめる。
// 見えていない・覆われている要素は、人間には押せない。テストでも押せてはいけない。

import { sleep, mulberry32 } from './util.js';

const KEYDEFS = {
  Enter:      { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab:        { key: 'Tab', code: 'Tab', keyCode: 9 },
  Backspace:  { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Escape:     { key: 'Escape', code: 'Escape', keyCode: 27 },
  ArrowUp:    { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown:  { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft:  { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
};

export class Human {
  /** @param {import('./page.js').VisualPage} page */
  constructor(page, rng = mulberry32(0x7e57)) {
    this.page = page;
    this.rng = rng;
    this.x = 40;
    this.y = 40;
  }

  #jitter(n) {
    return (this.rng() - 0.5) * 2 * n;
  }

  async #rest(base, spread = base * 0.6) {
    await sleep(Math.max(1, base + this.#jitter(spread)));
  }

  #mouse(type, params = {}) {
    return this.page.cdp.send('Input.dispatchMouseEvent', {
      type,
      x: this.x,
      y: this.y,
      button: 'none',
      ...params,
    }, this.page.sessionId);
  }

  #key(params) {
    return this.page.cdp.send('Input.dispatchKeyEvent', params, this.page.sessionId);
  }

  /** 目標へ、脇に膨らむ 2 次ベジェ + ease-in-out で手を運ぶ */
  async moveTo(tx, ty) {
    const sx = this.x, sy = this.y;
    const dist = Math.hypot(tx - sx, ty - sy);
    if (dist < 1) return;
    const steps = Math.max(6, Math.min(36, Math.round(dist / 18)));
    const bulge = Math.min(60, dist * 0.18);
    const mx = (sx + tx) / 2 + this.#jitter(bulge);
    const my = (sy + ty) / 2 + this.#jitter(bulge);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.x = (1 - e) ** 2 * sx + 2 * (1 - e) * e * mx + e ** 2 * tx;
      this.y = (1 - e) ** 2 * sy + 2 * (1 - e) * e * my + e ** 2 * ty;
      await this.#mouse('mouseMoved');
      await this.#rest(4, 3);
    }
    this.x = tx;
    this.y = ty;
    await this.#mouse('mouseMoved');
  }

  async clickAt(x, y, { button = 'left', clickCount = 1 } = {}) {
    await this.moveTo(x, y);
    await this.#rest(60);
    await this.#mouse('mousePressed', { button, buttons: 1, clickCount });
    await this.#rest(55);
    await this.#mouse('mouseReleased', { button, buttons: 0, clickCount });
  }

  /**
   * 到達可能性の吟味 = この手法の核。
   * DOM に在る、では足りない。その座標で最前面に「見えている」こと。
   */
  async reach(selector) {
    return await this.page.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'DOM に存在しない' };
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { ok: false, reason: '大きさゼロ(描かれていない)' };
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
        return { ok: false, cx, cy, w: r.width, h: r.height, reason: 'viewport の外' };
      }
      const hit = document.elementFromPoint(cx, cy);
      const ok = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      const name = hit
        ? hit.tagName + (hit.id ? '#' + hit.id : '') +
          (typeof hit.className === 'string' && hit.className ? '.' + hit.className.trim().split(/\\s+/).join('.') : '')
        : 'なし';
      return { ok, cx, cy, w: r.width, h: r.height, reason: ok ? '' : '別の要素に覆われている: ' + name };
    })()`);
  }

  /** 見えていることを確かめてから、中央付近(ど真ん中は避ける)を押す */
  async click(selector, opts = {}) {
    const probe = await this.reach(selector);
    if (!probe.ok) throw new Error(`「${selector}」は押せない: ${probe.reason}`);
    const px = probe.cx + this.#jitter(Math.min(probe.w * 0.18, 12));
    const py = probe.cy + this.#jitter(Math.min(probe.h * 0.18, 12));
    await this.clickAt(px, py, opts);
    return probe;
  }

  /** 目的の要素が見えるまでホイールで探しにいく(人間はそうする) */
  async bringIntoView(selector, { maxWheels = 30 } = {}) {
    const vh = this.page.size.height;
    for (let i = 0; i < maxWheels; i++) {
      const probe = await this.reach(selector);
      if (probe.ok) return probe;
      const r = await this.page.rect(selector);
      if (!r) throw new Error(`「${selector}」が DOM に現れない`);
      const center = r.y + r.height / 2;
      if (center > vh * 0.75) await this.wheel(Math.min(center - vh * 0.5, 600));
      else if (center < vh * 0.25) await this.wheel(Math.max(center - vh * 0.5, -600));
      else return probe; // 画面内なのに届かない = 覆われている。そのまま返して見立てを伝える
      await this.page.settle(80);
    }
    return await this.reach(selector);
  }

  /** ホイールを刻んで回す(一気に 1 万 px 飛ぶ人間はいない) */
  async wheel(deltaY, { x, y } = {}) {
    const px = x ?? this.x;
    const py = y ?? this.y;
    let remaining = deltaY;
    while (Math.abs(remaining) > 1) {
      const step = Math.sign(remaining) * Math.min(Math.abs(remaining), 110 + Math.abs(this.#jitter(40)));
      await this.page.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: px, y: py, deltaX: 0, deltaY: step, button: 'none',
      }, this.page.sessionId);
      remaining -= step;
      await this.#rest(18);
    }
  }

  /** いまの位置でボタンを押し込む(離すまで押しっぱなし) */
  async buttonDown() {
    await this.#mouse('mousePressed', { button: 'left', buttons: 1, clickCount: 1 });
  }

  /** いまの位置でボタンを離す */
  async buttonUp() {
    await this.#mouse('mouseReleased', { button: 'left', buttons: 0, clickCount: 1 });
  }

  /** 押したまま運んで放す */
  async drag(x1, y1, x2, y2, { steps = 14 } = {}) {
    await this.moveTo(x1, y1);
    await this.#mouse('mousePressed', { button: 'left', buttons: 1, clickCount: 1 });
    await this.#rest(40);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.x = x1 + (x2 - x1) * t + this.#jitter(2);
      this.y = y1 + (y2 - y1) * t + this.#jitter(2);
      await this.#mouse('mouseMoved', { button: 'left', buttons: 1 });
      await this.#rest(12);
    }
    this.x = x2;
    this.y = y2;
    await this.#mouse('mouseMoved', { button: 'left', buttons: 1 });
    await this.#rest(40);
    await this.#mouse('mouseReleased', { button: 'left', buttons: 0, clickCount: 1 });
  }

  /**
   * 打鍵。ASCII はキーイベント(keydown → keyup)、
   * 非 ASCII は IME 確定と同じ経路(insertText)— 日本語入力も本物の入り方で。
   */
  async type(text) {
    for (const ch of text) {
      if (ch === '\n') {
        await this.press('Enter');
        continue;
      }
      if (ch.charCodeAt(0) < 128) {
        await this.#key({ type: 'keyDown', key: ch, text: ch });
        await this.#key({ type: 'keyUp', key: ch });
      } else {
        await this.page.cdp.send('Input.insertText', { text: ch }, this.page.sessionId);
      }
      await this.#rest(34, 26);
    }
  }

  async press(name) {
    const def = KEYDEFS[name];
    if (!def) throw new Error(`未知のキー: ${name}`);
    const base = {
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.keyCode,
      nativeVirtualKeyCode: def.keyCode,
    };
    await this.#key({ type: 'keyDown', ...base, ...(def.text ? { text: def.text } : {}) });
    await this.#rest(30);
    await this.#key({ type: 'keyUp', ...base });
  }
}
