/**
 * 視覚デモの「空振り」検出ガード。
 *
 * demo モードは pass/fail を持たないため、**操作が効かなくても「撮れた」ように
 * 見える**。2026-07-25 の全画面監査では 30 枚中 4 枚が boot 直後と完全同一
 * ハッシュだった(tree 展開 / 深い階層 breadcrumb / command palette / tab 切替
 * ── いずれも selector 不一致で操作が届いておらず、起動画面をもう一度撮って
 * いただけ)。原因は helper が「見つからなければ false を返して素通り」する
 * 設計だったこと。
 *
 * ここで提供するのは 2 つ:
 *
 * 1. `ShotGuard` — 撮った png の SHA-256 を記録し、**同一ハッシュが 2 回出たら
 *    その場で throw** する。「操作が効いていないショット」は必ず前のショットと
 *    バイト一致するので、これで確実に捕まる。
 * 2. `mustClick` / `mustSee` — 見つからない・変化しない場合に **黙って skip せず
 *    throw** する。silent skip は「撮れた枚数」を水増しするだけで害しかない。
 *
 * 参照: docs/development/visual-audit-2026-07-25.md §4(C 群)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';

export interface ShotRecord {
  readonly name: string;
  readonly sha: string;
}

/**
 * 1 test 分のスクリーンショットを追跡し、重複(= 操作が効いていない)を検出する。
 *
 * `allowDuplicate` は「同じ画面をわざと 2 回撮る」正当な用途のための逃げ道。
 * 使うときは理由をコメントに書くこと。
 */
export class ShotGuard {
  private readonly shots: ShotRecord[] = [];
  private readonly seen = new Map<string, string>(); // sha -> name

  constructor(
    private readonly dir: string,
    private readonly page: Page,
  ) {}

  /** 撮って記録。直前までのどれかとバイト一致したら throw。 */
  async shot(name: string, opts: { allowDuplicate?: boolean; fullPage?: boolean } = {}): Promise<void> {
    const path = `${this.dir}/${name}.png`;
    await this.page.screenshot({ path, fullPage: opts.fullPage ?? false });
    this.record(name, path, opts.allowDuplicate ?? false);
  }

  /** 別 page(popup 等)で撮ったファイルを事後登録する。 */
  register(name: string, path: string, allowDuplicate = false): void {
    this.record(name, path, allowDuplicate);
  }

  private record(name: string, path: string, allowDuplicate: boolean): void {
    const sha = createHash('sha256').update(readFileSync(path)).digest('hex');
    const prior = this.seen.get(sha);
    if (prior !== undefined && !allowDuplicate) {
      throw new Error(
        `[shot-guard] "${name}" が "${prior}" とバイト単位で同一です。` +
          `操作が画面に届いていません(selector 不一致 / 再 render で element が detach / ` +
          `キーバインドが存在しない のいずれか)。撮る前に画面の観測点を待つこと。`,
      );
    }
    this.seen.set(sha, name);
    this.shots.push({ name, sha });
  }

  get taken(): readonly ShotRecord[] {
    return this.shots;
  }
}

/**
 * click できなければ throw。`count() === 0` を握りつぶさない。
 *
 * `expectAfter` を渡すと **click 後にその locator が現れるまで待つ** ので、
 * 「押せたが何も起きていない」も検出できる(dead command 対策)。
 */
export async function mustClick(
  target: Locator,
  what: string,
  opts: { expectAfter?: Locator; timeout?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? 5_000;
  if ((await target.count()) === 0) {
    throw new Error(`[must-click] ${what} が見つかりません(selector 不一致)`);
  }
  await target.first().click({ timeout });
  if (opts.expectAfter) {
    await opts.expectAfter.first().waitFor({ state: 'visible', timeout });
  }
}

/** 見えるまで待つ。見えなければ理由付きで throw。 */
export async function mustSee(target: Locator, what: string, timeout = 5_000): Promise<void> {
  try {
    await target.first().waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(`[must-see] ${what} が表示されません(count=${await target.count()})`);
  }
}
