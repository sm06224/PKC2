// PKC2 — 起動して、人間の手でエントリを 1 件作る
//
// PKC2 での本スキルの立ち位置は「可搬ハーネスのお手本」(本格的な網羅は
// tests/smoke/ の Playwright parity 群が担う)。ここでは:
//   - boot 正本シグナル(window.PKC.bootReady)で待つ(boot-ready helper と同じ契約)
//   - 実打鍵(日本語タイトルは IME 確定経路)でエントリ作成
//   - dead interaction 検出と、裏の例外の取り立て
//   - 耳: PKC2 は無音のはず — 「静寂であること」も観測して確かめる

export default {
  name: 'PKC2 — 起動と、人間の手による最初のエントリ',

  async run(t) {
    await t.goto('/dist/pkc2.html');
    await t.page.waitFor('!!(window.PKC && window.PKC.bootReady)', { timeout: 15000, label: 'PKC.bootReady の露出' });
    await t.page.eval('PKC.bootReady.then(() => true)');
    await t.page.settle(300);
    await t.shot('起動直後');

    // 新規テキストエントリ → 編集フェーズへ(画面が変わらなければ dead click)
    await t.act('新規エントリ作成で編集画面が開く', { expect: 'change' }, async () => {
      await t.human.click('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
      await t.page.waitFor(
        `document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`,
        { label: '編集フェーズへの遷移' },
      );
    });

    // 実打鍵でタイトルと本文(「官能」は IME 確定経路で入る)。
    // タイトル欄には既定値(日付 Note)が入っている — 人間の常套手段どおり
    // トリプルクリックで全選択してから打って置き換える
    await t.human.click('[data-pkc-field="title"]', { clickCount: 3 });
    await t.human.type('官能 Probe');
    await t.human.click('[data-pkc-field="body"]');
    await t.human.type('shinsatsu skill probe\n');

    // 確定 → ready へ戻り、書いたタイトルが画面に見えている
    await t.human.click('[data-pkc-action="commit-edit"]');
    await t.page.waitFor(
      `document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`,
      { label: 'ready フェーズへの復帰' },
    );
    await t.page.settle(300);
    const visible = await t.page.eval(`document.body.textContent.includes('官能 Probe')`);
    t.expect(visible, '打鍵したタイトル「官能 Probe」が画面に見えている');
    await t.shot('エントリ作成後');

    // 耳: PKC2 は音を出さない設計 — 静寂であることも観測して確かめる
    const s = await t.listen.record('起動後の静寂(音は無いはず)', 800);
    t.expect(s === null, 'AudioContext は作られていない(PKC2 は無音の道具)');
  },
};
