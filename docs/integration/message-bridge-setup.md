# PKC-Message Bridge Setup — Integration Guide

**Status**: Accepted (2026-04-26)
**Audience**: 別プロジェクト「PKCにAIを住まわせる会」implementer + 将来の Extension / iframe sender 実装者
**Scope**: PKC2 を host とする PKC-Message v1 integration の実装ガイド

PKC2 を **PKC-Message v1**(`docs/spec/pkc-message-api-v1.md`)の receiver host として使うための実用ガイド。既存実装(`src/adapter/transport/`)が canonical reference になっているので、本書はそれを踏まえた **「最初に読むべき integration manual」** の位置付け。

> 参照 spec(順序通り):
>
> 1. `docs/spec/pkc-message-api-v1.md`(canonical PKC-Message v1)
> 2. `docs/spec/record-offer-capture-profile.md`(record:offer 詳細)
> 3. `docs/development/pkc-message-implementation-gap-audit-2026-04-26.md`(現状実装と spec の整合 audit)

## 1. Purpose

別 PRJ implementer が PKC2 と PKC-Message 経由で通信するクライアント(Extension / iframe / launcher 等)を作る際に、**PKC2 側のセットアップ + 想定 sender flow + よく踏む落とし穴** を 1 ドキュメントで把握できるようにする。

## 2. Quick start

最短経路。companion(sender)を PKC2(host)の iframe として load し、postMessage 経由でやり取りする想定:

```html
<!-- companion(sender)側、minimal -->
<script>
  window.parent.postMessage({
    protocol: 'pkc-message',
    version: 1,
    type: 'ping',
    source_id: 'companion-quickstart',
    target_id: null,
    payload: {},
    timestamp: new Date().toISOString(),
  }, '*');

  window.addEventListener('message', (ev) => {
    // PKC2 からの pong / record:reject / export:result を受信
    if (ev.source !== window.parent) return;
    if (ev.data?.protocol !== 'pkc-message') return;
    console.log('inbound:', ev.data.type, ev.data.payload);
  });
</script>
```

PKC2 側は `src/main.ts` で既に `mountMessageBridge(...)` 呼び出し済みで、record:offer / export:request handler 登録済み。default deployment(PKC2 が iframe を host)では追加設定なしで上記 ping が通る。

特殊 deployment(別 origin / chrome-extension://)の場合は §4 を参照。

## 3. Basic setup(host 側 = PKC2)

PKC2 内部で `mountMessageBridge` をどう呼ぶかは `src/main.ts:393` 周辺で実装済み。再掲・抜粋:

```ts
import { mountMessageBridge } from '@adapter/transport/message-bridge';
import { createHandlerRegistry } from '@adapter/transport/message-handler';
import { recordOfferHandler, /* ... */ } from '@adapter/transport/record-offer-handler';
import { exportHandler } from '@adapter/transport/export-handler';
import { buildPongProfile } from '@adapter/transport/profile';

const registry = createHandlerRegistry();
registry.register('record:offer', recordOfferHandler);
registry.register('export:request', exportHandler);

const bridgeHandle = mountMessageBridge({
  containerId: getActiveContainer().container_id,
  allowedOrigins: [window.location.origin], // §4 で詳述
  pongProfile: () => buildPongProfile({
    version: VERSION,
    embedded: detectEmbedContext().embedded,
  }),
  onMessage: (envelope, _origin, sourceWindow) => {
    // capability gate(`canHandleMessage`) → registry.route
    if (!canHandleMessage(envelope.type, isEmbedded)) return;
    registry.route(envelope, { sourceWindow, dispatcher, sender, ... });
  },
  onReject: (data, reason) => {
    console.warn('[PKC2] inbound rejected:', reason);
  },
});

// teardown(SPA navigation 等)
window.addEventListener('beforeunload', () => bridgeHandle.destroy());
```

実際の wiring は `src/main.ts` を canonical reference とする。本書は **そこにない選択肢(allowedOrigins の provider 形式 / null origin opt-in 等)** を補完する位置付け。

### handler 登録のルール

- `record:offer` は **`mode='any'`**(`MESSAGE_RULES`)、standalone でも embedded でも受理
- `export:request` は **`mode='embedded-only'`**、standalone では capability gate で reject
- `ping` / `pong` は bridge 内部で完結、handler 不要
- `navigate` / `custom` は spec §7.6 / §7.7 で「handler 任意登録」、PKC2 v1 では未登録(送信されると silent drop)

PongProfile.capabilities は **`MESSAGE_RULES` から派生**(`MESSAGE_CAPABILITIES`、`src/adapter/transport/capability.ts:73-92`)、PKC2 v1 では `['record:offer', 'export:request']` を advertise。詳細は §6。

## 4. `allowedOrigins` configuration

`BridgeOptions.allowedOrigins` は **2 form** をサポート(PR-B / 2026-04-26 で provider 形式追加):

### 4.1 Static array form(default、backward-compat)

```ts
mountMessageBridge({
  allowedOrigins: [
    'https://pkc.example.com',
    'chrome-extension://xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  ],
  // ...
});
```

- 空配列 / `['*']` で **accept-all-except-null**(default)
- 明示 origin list を渡すと、その list 外は reject(`onReject` で audit signal)
- `'null'` を含めると `file://` / sandboxed iframe / opaque origin の opt-in 受理
- production deployment は **明示 list を必ず渡す**(record-offer-capture-profile.md §9.1)

### 4.2 Provider function form(2026-04-26 PR-B 追加)

```ts
mountMessageBridge({
  allowedOrigins: () => loadAllowedOriginsFromSettings(),
  // ...
});

function loadAllowedOriginsFromSettings(): string[] {
  // localStorage / settings entry / env / 任意の動的 source
  const raw = localStorage.getItem('pkc2-allowed-origins') ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
```

- **各 inbound message ごとに resolve**(re-mount 不要で動的設定対応)
- provider が throw → `onReject(null, 'allowedOrigins provider threw: <msg>')` で audit signal、`[]` fallback(accept-all-except-null fail-safe)
- provider が `null` / `undefined` を返す → `[]` 扱い(同上)
- deployment author が **fail-closed を望むなら provider 内で空配列の代わりに `['__no-allow__']` 等の sentinel を返す** ような明示拒否ロジックを書く(または mount 時に static array で渡す)

### 4.3 Production patterns

| pattern | 用途 | trade-off |
|---|---|---|
| static array(`['https://pkc.example.com']`)| 単一 deployment | 単純、再 deploy なしで変更不可 |
| provider + env var | CI / multi-environment | env 変数の管理が必要 |
| provider + `__settings__` entry | user-editable | UI 経由で trusted Extension origin を追加できる |
| provider + remote config | enterprise | 外部 fetch 失敗時の fallback policy が要 |

PKC2 本体は default で **`[window.location.origin]`** の static array(`src/main.ts:402`)を渡す。本 default は将来 PR で provider 経由に置換する候補(§7.5)。

### 4.4 null origin opt-in checklist

`'null'` origin(file:// / sandboxed iframe / opaque)を allow する場合の audit checklist:

1. **本当に必要か**(`<iframe sandbox>` 経由の captureツールを受け入れる場合のみ正当化される)
2. **静的 list で許可する**(provider で動的に追加すると audit trail が消える)
3. boot 時に **console.warn で記録**(別 PR で `'null'` 受理時の警告 helper を追加候補)
4. provider 内で時刻ベースの auto-revoke を考える(ad-hoc capture 終了後に削除)

## 5. Typical sender flows

### 5.1 Flow 1 — ping/pong handshake(capability discovery)

```ts
// sender 側
function probePkc2(): Promise<PongProfile> {
  return new Promise((resolve, reject) => {
    const correlationId = `probe-${Date.now()}`;
    const timeout = setTimeout(() => reject(new Error('pong timeout')), 3000);

    const listener = (ev: MessageEvent) => {
      if (ev.source !== window.parent) return;
      if (ev.data?.type !== 'pong') return;
      clearTimeout(timeout);
      window.removeEventListener('message', listener);
      resolve(ev.data.payload);
    };
    window.addEventListener('message', listener);

    window.parent.postMessage({
      protocol: 'pkc-message', version: 1, type: 'ping',
      source_id: correlationId, target_id: null,
      payload: {}, timestamp: new Date().toISOString(),
    }, '*');
  });
}

const profile = await probePkc2();
console.log('PKC2:', profile.app_id, profile.version,
  'supports:', profile.capabilities);
// → ['record:offer', 'export:request']
```

`profile.capabilities.includes('record:offer')` を **gate** にして次の type を送る判定をする。spec §5.2.1 で vocabulary が固定されているので message-type 名(colon-separated)で素直にチェック可能。

### 5.2 Flow 2 — record:offer + accept/dismiss

最重要 flow。AI summary の 1-click capture 等。

```ts
window.parent.postMessage({
  protocol: 'pkc-message', version: 1, type: 'record:offer',
  source_id: 'companion-v0', target_id: null,
  payload: {
    title: 'Daily summary 2026-04-26',
    body: '## Highlights\n- ...',
    archetype: 'text',                           // optional
    source_url: 'https://example.com/source',    // optional, body header に注入
    captured_at: new Date().toISOString(),       // optional, body header に注入
  },
  timestamp: new Date().toISOString(),
}, '*');
```

**応答無し** が spec(§7.2 / §8.3)、user が PKC2 UI で accept / dismiss するまで非同期。sender は **fire-and-forget で UI を user に見せる** 設計に倒す。

#### dismiss されたとき(record:reject 受信)

```ts
window.addEventListener('message', (ev) => {
  if (ev.source !== window.parent) return;
  if (ev.data?.type !== 'record:reject') return;
  console.log('dismissed:', ev.data.payload.offer_id, ev.data.payload.reason);
});
```

PR-C(2026-04-26)で **PKC2 が source window に直接送る** ようになったので、この listener は standard PKC2-hosts-iframe deployment で確実に発火する(従来は PKC2 が `window.parent` 固定で送って届かない bug があった)。

#### accept された場合

**応答無し**(spec §7.3)。PKC2 UI で entry が新規に作成される。sender 側で「accept された」を確認したい use case がある場合は、§11.3 deferred、または export:request で snapshot を取って差分を見る運用。

### 5.3 Flow 3 — export:request(snapshot 取得、embedded-only)

```ts
window.parent.postMessage({
  protocol: 'pkc-message', version: 1, type: 'export:request',
  source_id: 'companion-v0', target_id: null,
  payload: { filename: 'snapshot.html' /* optional */ },
  timestamp: new Date().toISOString(),
}, '*');

window.addEventListener('message', (ev) => {
  if (ev.source !== window.parent) return;
  if (ev.data?.type !== 'export:result') return;
  const html: string = ev.data.payload.html;
  // html を Blob 化 / sender 側 storage / 表示処理 へ
});
```

**embedded-only**(`MESSAGE_RULES`)= PKC2 が standalone で開かれているとき capability gate で **silent drop**(`pong.payload.embedded` が false なので sender 側は事前 check で送るのを止めるべき)。

```ts
if (!profile.embedded) {
  console.warn('PKC2 is standalone — export:request will be silently dropped');
}
```

## 6. Capability negotiation(canonical rule)

spec §5.2.1 normative rule(2026-04-26 確定):

1. `PongProfile.capabilities` の各 element は **message-type 名**(colon-separated、`KNOWN_TYPES` の部分集合)
2. **handler が登録されている、または bridge 層で完結している** type のみ列挙
3. **protocol primitive(`ping` / `pong`)は列挙しない**(常時利用可能)

**PKC2 v1 canonical advertised** = `['record:offer', 'export:request']`(2 件)。

### sender 側 judge logic

```ts
const profile = await probePkc2();

// gate: 送る前に必ず capabilities を check
if (profile.capabilities.includes('record:offer')) {
  // record:offer を送ってよい
}
if (profile.capabilities.includes('export:request') && profile.embedded) {
  // export:request を送ってよい
}
// future v2+ で 'hook:subscribe' が advertise されたら同じ pattern で判定
```

**禁止 pattern**:
- ❌ 内部 feature flag(`'core'` / `'idb'` 等、build-side `BUILD_FEATURES` の値)を expectation に入れる(separate vocabulary、§5.2.1)
- ❌ `'ping'` / `'pong'` を capabilities に期待する(常時利用可能、advertise 不要)
- ❌ KNOWN_TYPES 全列挙を期待する(handler 未登録 type は advertise されない)

## 7. Common pitfalls

### 7.1 Origin mismatch

**症状**: ping 送信して pong が返ってこない。
**原因**: PKC2 host の `allowedOrigins` に sender origin が含まれていない、または `'null'` opt-in なしで file://から送信。
**対処**: §4.1 / §4.2 で provider pattern を使い deployment 環境ごとに動的設定。`onReject` callback で reject reason を確認可能。

### 7.2 Body size cap(256 KiB)

**症状**: record:offer 送信して PendingOffer が UI に出ない。
**原因**: body が 262144 bytes(`BODY_SIZE_CAP_BYTES`)を超過、`record-offer-handler.ts:127` で reject。
**対処**: sender 側で事前に `new Blob([body]).size <= 262144` check。長い body は分割 / asset-style 添付(v1 では asset embed 禁止、v2+ で別経路)。

### 7.3 embedded-only types(`export:request`)

**症状**: standalone PKC2 に export:request 送信しても `export:result` が返らない。
**原因**: capability gate(`canHandleMessage('export:request', false)`)で reject。
**対処**: sender 側で `profile.embedded === true` のときのみ送信(§5.3)。

### 7.4 null origin opt-in が消えた

**症状**: file:// 経由の bookmarklet / 共有シートからの record:offer が突然 reject されるようになった。
**原因**: PKC2 host の `allowedOrigins` から `'null'` が落ちた、または provider が空 array を返した。
**対処**: §4.4 audit checklist 通り、static list で `'null'` を保持。`onReject` の log で `Origin rejected: null (explicit opt-in required)` を観測。

### 7.5 record:reject が届かない(PR-C 以前のバグ)

**症状**: companion iframe で dismiss しても record:reject の listener が発火しない。
**原因**: PR-C(2026-04-26)以前の PKC2 は `record:reject` を `window.parent` 固定で送るため、PKC2 が top-level だと自己ループしていた。
**対処**: PR-C 以降は **MessageEvent.source(= sender window)に直送**。companion 側は `addEventListener('message', ...)` で受信、特別な対応不要。`ev.source !== window.parent` filter は引き続き有効(PKC2 = companion から見た window.parent なので filter pass)。

### 7.6 Non-PKC envelope の混入

**症状**: PKC2 の `onReject` が他 framework の postMessage を拾ってしまう。
**原因**: `isPkcMessage` filter は `data.protocol === 'pkc-message'` のみで判定、PKC envelope **でない** message は **silent ignore**。filter は `onReject` を起こさないため、reject log に PKC2 envelope の reject だけが残る設計。
**対処**: 別 framework の message を sender が同 window に流す場合、`{ kind: '...' }` のような non-envelope 形(別PRJ Companion mockup の `'sender-ready'` と同じ pattern)を使えば PKC2 から interferenced されない。

### 7.7 capabilities vocabulary の誤読

**症状**: pong の `capabilities` を見て「PKC2 は record-offer をサポート」と判定するロジックが false 返す。
**原因**: 古い PKC2(PR-B' / 2026-04-26 以前)は `'record-offer'`(kebab-case)を返していたが、現行は spec §5.2.1 通り `'record:offer'`(colon-separated)。
**対処**: sender 側は spec §5.2.1 vocabulary 通り colon 区切り message-type 名でチェック。古い PKC2 と互換を取りたい場合は `caps.includes('record:offer') || caps.includes('record-offer')` の OR で fallback(将来 v2 で削除予定)。

## 8. References

### 8.1 Canonical specs
- `docs/spec/pkc-message-api-v1.md`(PKC-Message v1 canonical、§5.2.1 capabilities vocabulary normative rule)
- `docs/spec/record-offer-capture-profile.md`(record:offer payload + capture rule、§9.1 origin policy / §9.3 size cap / §10.4 body header injection)

### 8.2 Implementation source(行 ref)
- `src/adapter/transport/message-bridge.ts:101`(`mountMessageBridge`、PR-B で provider 形式追加)
- `src/adapter/transport/capability.ts:73-92`(`MESSAGE_CAPABILITIES`、PR-B' で `MESSAGE_RULES` 派生に変更)
- `src/adapter/transport/profile.ts:55-63`(`buildPongProfile`、PR-B' で MESSAGE_CAPABILITIES に switch)
- `src/adapter/transport/record-offer-handler.ts`(PR-C で `replyWindowRegistry` 追加)
- `src/main.ts:393-460`(bridge mount + handler registration + dismiss/accept event hookup、PR-C で sourceWindow threading)
- `src/runtime/release-meta.ts:104-141`(`BUILD_FEATURES` + `CAPABILITIES` deprecated alias、PR-B')
- `src/adapter/state/app-state.ts:570`(`injectCaptureHeader`、PR-A で location 明文化)
- `src/adapter/state/app-state.ts:1190`(ACCEPT_OFFER reducer case、PR-A 同)

### 8.3 Audit + decisions
- `docs/development/pkc-message-implementation-gap-audit-2026-04-26.md`(PR #160、PR-E1 で §7 mockup-driven gap 追補)
- `docs/development/transport-record-reject-decision.md`(record:reject sender-only Option A の経緯)
- `docs/development/pkc-message-hook-subscription-decision.md`(hook subscription Defer 決定、v2+)

### 8.4 Reference mockup(別 PRJ)
- 別プロジェクト「PKCにAIを住まわせる会」の **PKC-Message Companion v0** が integration テスト用 mockup として提供されている(2026-04-26 受領、本 guide はその受領分析を反映)。本 repo には同梱しないが、`docs/development/pkc-message-implementation-gap-audit-2026-04-26.md` §7.1-§7.4 で mockup 構成と integration findings を documented 化済み。

### 8.5 PR landing 順序(本 guide 着地時点)
| PR | 日付 | 内容 |
|---|---|---|
| #160 | 2026-04-26 | implementation gap audit baseline |
| #161 | 2026-04-26 | PR-E1 audit §7 + spec §5.2.1 capabilities vocabulary |
| #162 | 2026-04-26 | PR-B' Must-3 CAPABILITIES vocabulary alignment(D1-D4 実装)|
| #163 | 2026-04-26 | PR-A body header injection 実装 location 明文化 |
| #164 | 2026-04-26 | PR-C Must-2 record:reject reply-window threading |
| #165 | 2026-04-26 | PR-B Must-1 allowedOrigins provider 形式追加 |
| (本 PR)| 2026-04-26 | PR-D integration guide(本 doc)|

---

**Status footer**: 本 guide は PKC-Message wave PR-A(#163)〜 PR-B(#165)着地後に書かれており、`['record:offer', 'export:request']` の v1 advertised capabilities + provider 形式 allowedOrigins + sourceWindow threading + body header injection 全部を反映済み。
