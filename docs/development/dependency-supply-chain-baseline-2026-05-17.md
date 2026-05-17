# 依存ライブラリ + サプライチェーン baseline(2026-05-17、Wave deps Phase 1)

**Status**: 着地済(Phase 1 完了)
**Trigger**: user direction「依存ライブラリの整理と最新版への更新は次のwaveです。
最近特にサプライチェーン攻撃が頻発化していますし、これは必須ですね」
**Wave**: v2.3.0 release-締め(Wave Z)直後の継続 wave

---

## §1 結論サマリ

PKC2 v2.3.0 直後の依存状況は **健全**(脆弱性 0 件、minor/patch drift 7 件のみ)。
本 Phase 1 で以下 3 件を着地、major bump 5 件は **個別 follow-up PR** に
分割して順次評価予定。

- **PR の scope**:minor/patch 一括更新 + supply chain audit gate + Dependabot config
- **不変**:src / dist / bundle / 機能 / contract いずれも触らず
- **方針**:Postel's Law(寛容に受け取り、厳密に送る)の dependency 版 — minor/patch は
  group PR で軽く流し、major は individual で重く評価

---

## §2 baseline(2026-05-17 時点)

### §2.1 production deps(4 件)

| package | current | wanted | latest | license | use-case |
|---|---|---|---|---|---|
| `docx` | 9.6.1 | 9.6.1 | 9.6.1 | MIT | Word 出力(W14+ AST 経由) |
| `markdown-it` | 14.1.1 | 14.1.1 | 14.1.1 | MIT | markdown render(3 surface 全部) |
| `markdown-it-footnote` | 4.0.0 | 4.0.0 | 4.0.0 | MIT | footnote 拡張(W18 で ESM 化) |
| `pptxgenjs` | 4.0.1 | 4.0.1 | 4.0.1 | MIT | PowerPoint 出力(W14+) |

**全件 latest 一致**。production 4 deps は変更なし。

### §2.2 dev deps(13 件)

| package | current | wanted | latest | 更新区分 |
|---|---|---|---|---|
| `@playwright/test` | 1.56.1 → **1.60.0** | 1.60.0 | 1.60.0 | ✅ Phase 1 |
| `@types/markdown-it` | 14.1.2 | 14.1.2 | 14.1.2 | — |
| `@types/node` | 25.5.2 → **25.8.0** | 25.8.0 | 25.8.0 | ✅ Phase 1 |
| `@typescript-eslint/eslint-plugin` | 8.58.0 → **8.59.3** | 8.59.3 | 8.59.3 | ✅ Phase 1 |
| `@typescript-eslint/parser` | 8.58.0 → **8.59.3** | 8.59.3 | 8.59.3 | ✅ Phase 1 |
| `@vitest/coverage-v8` | 3.2.4 | 3.2.4 | 4.1.6 | ⚠️ major、Phase 2 candidate |
| `eslint` | 8.57.1 | 8.57.1 | 10.4.0 | ⚠️ 2 major、Phase 2/3 candidate |
| `happy-dom` | 20.8.9 → **20.9.0** | 20.9.0 | 20.9.0 | ✅ Phase 1 |
| `terser` | 5.46.1 → **5.47.1** | 5.47.1 | 5.47.1 | ✅ Phase 1 |
| `tsx` | 4.21.0 → **4.22.1** | 4.22.1 | 4.22.1 | ✅ Phase 1 |
| `typescript` | 5.9.3 | 5.9.3 | 6.0.3 | ⚠️ major、Phase 2 candidate |
| `vite` | 6.4.2 | 6.4.2 | 8.0.13 | ⚠️ 2 major、Phase 2/3 candidate |
| `vitest` | 3.2.4 | 3.2.4 | 4.1.6 | ⚠️ major、Phase 2 candidate |

### §2.3 npm audit(2026-05-17 時点)

```
$ npm audit
found 0 vulnerabilities

  metadata:
    info: 0
    low: 0
    moderate: 0
    high: 0
    critical: 0
    total: 0
    dependencies:
      prod: 37
      dev: 324
      optional: 80
      total: 360
```

---

## §3 Phase 1 着地内容

### §3.1 minor/patch 一括更新(`npm update`)

7 件:`@playwright/test` / `@types/node` / `@typescript-eslint/{eslint-plugin,parser}` /
`happy-dom` / `terser` / `tsx` を `wanted` 範囲内で latest patch/minor へ。

**検証**:
- typecheck clean / lint clean
- vitest 8067/8067 pass
- bundle 不変(1872 KB JS / 163 KB CSS)
- size-budget OK

### §3.2 npm audit gate(CI verify job)

`.github/workflows/ci.yml` の `Install dependencies` 直後に追加:

```yaml
- name: Supply chain audit (npm audit, high+ severity blocking)
  run: npm audit --audit-level=high
```

**閾値選定根拠**:
- `low` / `moderate` を blocking にすると false-positive noise が増える(transitive dep の
  deprecation 警告まで CI red 化)
- `high` / `critical` は実 exploitable な攻撃面、即対応の discipline を保つため blocking
- 既存 `auto_gitleaks-scan.yml`(secret scan)+ 本 audit gate で supply chain 多層防衛

### §3.3 Dependabot config(`.github/dependabot.yml`)

週次 Monday 09:00 JST に 2 ecosystem(npm + github-actions)を scan、`minor-and-patch` は
group PR で集約、`security-updates` は最優先で individual PR。

**design 根拠**:
- **weekly cadence**:毎日 PR 洪水を避けつつ、攻撃登録から最大 1 週間で気付ける
- **group PR for minor/patch**:review burden 削減、まとめて検証 → merge
- **individual PR for major + security**:慎重 review が必要、独立 evaluation

---

## §4 未対応(Phase 2/3 candidate)

### §4.1 major bump 5 件

| package | 現 → 候補 | 影響範囲 | 推奨着手 |
|---|---|---|---|
| `vitest` 3 → 4 | test runner / config schema 変更可能性 | 全 test 8067 件 | Phase 2 個別 |
| `@vitest/coverage-v8` 3 → 4 | vitest 4 と pair 更新 | coverage gate | vitest と同 PR |
| `typescript` 5 → 6 | language version、`tsc --noEmit` 挙動変化 | src 全体 + types | Phase 3 個別、慎重 |
| `vite` 6 → 8(2 major)| build tooling、Vite plugin API 変更 | build pipeline | Phase 2 個別 |
| `eslint` 8 → 10(2 major)| flat config 移行必須 | lint config | Phase 3 個別、設計 doc 先行 |

### §4.2 supply chain 強化案(Phase 2/3)

- **npm provenance verify**:`npm install --provenance`(npm 9.5+ 機能)で sigstore
  attestation を CI で検証 → 本 wave Phase 2 候補
- **`package.json` 完全 pin**:`^` を外して exact version pinning(npm-shrinkwrap 等価)
  → 過剰な hardening、PR-W19 doctrine と相談
- **CycloneDX SBOM 生成**:`cyclonedx-npm` で release artifact に SBOM 同梱 → 利用者の
  vulnerability scan 容易化
- **GitHub Dependency Review action**:PR の依存 diff を gate(`actions/dependency-review-action`)
  → Phase 2 候補

---

## §5 doctrine 反映

### §5.1 PR-W19 doctrine 継続

- `retries: 0` を維持(flake を retry で隠さず diagnose)
- 本 Phase 1 着地時点で smoke flake hotfix(同 PR 内)で実際 3 spec を root-fix

### §5.2 Wave 規律(CLAUDE.md §10)

- Phase 1 は **deps minor/patch 一括 + supply chain gate 追加** に scope 制限
- major bump は **individual PR** で 1 つずつ評価(scope drift 防止)
- 本 wave は ~3 PR 想定(Phase 1 + Phase 2 + Phase 3)、wave 規律「30〜50 PR で打ち止め」
  の遥か手前

### §5.3 PKC MD = HTML 不変式(Wave Z 確立)

deps 更新は markdown-it / docx / pptxgenjs のいずれも触らず、PKC MD ↔ HTML の supreme
invariant に影響なし。production deps を **触らない**(全件 latest 一致)ことで invariant
は完全保護。

---

## §6 関連 doc

- [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md):
  領域 11 として本 wave を追加候補(本 doc 完成後の roadmap update)
- [`../release/CHANGELOG_v2.2.0.md`](../release/CHANGELOG_v2.2.0.md):
  Wave Z final の「次 wave 候補」section で本 wave を予告済
- [`pr-review-checklist.md`](./pr-review-checklist.md) §2.x:
  本 wave 着地後、項目「§2.12 supply chain audit」を追加候補

---

## §7 history

| date | event |
|---|---|
| 2026-05-17 | **Phase 1 着地**:minor/patch 7 件 + audit gate + Dependabot config |
| 2026-05-17 | Smoke flake hotfix(同 PR 内、sidebar-scroll + textlog-deeplink 3 spec) |
| TBD | Phase 2 候補:vitest 4 + @vitest/coverage-v8 4 + vite 8 |
| TBD | Phase 3 候補:typescript 6 + eslint 10(flat config 移行) |
