# 依存ライブラリ + サプライチェーン baseline(2026-05-17、主権モード再設計)

**Status**: 主権モード再設計完了(Renovate dashboard 採用)
**Trigger**: user 方針(2026-05-17)「Dependabot は何でもかんでも最新化が違う気がする。
更新は知りたいけど、それをいつ飛びつくかは主権的になりたい」
**Previous**: Phase 1(2026-05-17 朝、PR #455)で Dependabot 自動 PR を導入 → user 指摘で
**主権モード**(Renovate dashboard)に方針転換、Dependabot は撤退

---

## §1 結論サマリ

PKC2 の supply chain 対策は **「自動 PR を作らせず、user 主権で採用する」** に統一。
Dependabot を撤退し、Renovate の `dependencyDashboard` モードで運用。各 update は
**checkbox 明示 approve** で初めて PR 化される。0-day 攻撃の脆弱性 window を
**7 日 cooldown** で回避。

- **方針**:常に最新化は不採用。LTS 切れ / 高速化 / 新機能 / CVE が出た時に user が個別判断
- **依存最小化維持**:prod deps 4 件のみ(docx / markdown-it / markdown-it-footnote /
  pptxgenjs)、全件 latest 一致で当面不変
- **defensive layers**:Renovate cooldown 7 日 + dashboard approval + npm audit CI gate +
  GitHub Dependabot alerts(security tab、PR 生成なし)

---

## §2 設計思想:「常に最新化」が逆に危険な理由

Dependabot / Renovate の素の運用(`prCreation` がデフォルト)= **「公開された即時に
自動 PR」**。これは以下の supply chain 攻撃に対して **逆効果**:

| 攻撃 | 仕組み | 「即時自動 PR」の被害 |
|---|---|---|
| メンテナーアカウント乗っ取り | 攻撃者が npm publish 権限を奪取し malicious version を publish | 公開数分後に自動 PR、merge で侵害 |
| メンテナー自身による sabotage(`event-stream` / `colors.js` 等) | 維持者が突発的に破壊コード追加 | 同上 |
| typosquat / supply chain injection(transitive dep) | 偽パッケージ / lockfile 改竄 | 公開と同時に PR、依存先に伝播 |
| 0-day CVE(GHSA 登録前) | 既知になる前の脆弱性 | 既存 version からの逸脱を加速 |

これらは npm に publish された瞬間から **GHSA 登録までの timing window**(通常 24-72h、
時に数週間)で被害が出る。**最速で更新 = 最速で侵害** という逆効果。

対策:**release から N 日経過するまで自動 PR しない**(=「他人が先に踏む」を活用)。

---

## §3 主権モード設計(本 wave)

### §3.1 Renovate 設定(`renovate.json`)

```json
{
  "dependencyDashboard": true,
  "dependencyDashboardApproval": true,
  "minimumReleaseAge": "7 days",
  "schedule": ["before 6am on monday"],
  "prConcurrentLimit": 10
}
```

主要 behavior:
- **週 1 回(月曜朝 6 時 JST)に dashboard 更新**
- **release 公開から 7 日経過した update のみ dashboard に表示**(cooldown)
- **dashboard の checkbox を user が check するまで PR は作成されない**(approval)
- **CVE 通知も approval 経由**(緊急判断は user に委ねる)

### §3.2 残置される CVE 通知経路

GitHub の repo settings で以下は引き続き受信:
- **Dependabot alerts**(Security tab、PR 生成なし):GHSA 登録時に通知
- 通知のみで自動 PR は生成されない(本 wave で `.github/dependabot.yml` 削除済)

### §3.3 CI gate 維持

`.github/workflows/ci.yml` の `Supply chain audit (npm audit, high+ severity blocking)`
step は **維持**。high/critical CVE が PR を blocking、低 severity は noise として除外。

---

## §4 baseline(2026-05-17 時点)

### §4.1 production deps(4 件、bundle.js に焼き込み = エンドユーザー配布)

| package | current | latest | license | use-case |
|---|---|---|---|---|
| `docx` | 9.6.1 | 9.6.1 | MIT | Word 出力(W14+ AST 経由) |
| `markdown-it` | 14.1.1 | 14.1.1 | MIT | markdown render(3 surface 全部) |
| `markdown-it-footnote` | 4.0.0 | 4.0.0 | MIT | footnote 拡張(W18 で ESM 化) |
| `pptxgenjs` | 4.0.1 | 4.0.1 | MIT | PowerPoint 出力(W14+) |

**全件 latest 一致**。配布物影響 = エンドユーザー全員、最も慎重 review 対象。

### §4.2 dev deps(13 件、build/test のみ、配布物に影響なし)

| package | current | latest |
|---|---|---|
| `@playwright/test` | 1.60.0 | 1.60.0 ✅ |
| `@types/markdown-it` | 14.1.2 | 14.1.2 ✅ |
| `@types/node` | 25.8.0 | 25.8.0 ✅ |
| `@typescript-eslint/eslint-plugin` | 8.59.3 | 8.59.3 ✅ |
| `@typescript-eslint/parser` | 8.59.3 | 8.59.3 ✅ |
| `@vitest/coverage-v8` | 3.2.4 | 4.1.6(major 1)|
| `eslint` | 8.57.1 | 10.4.0(major 2)|
| `happy-dom` | 20.9.0 | 20.9.0 ✅ |
| `terser` | 5.47.1 | 5.47.1 ✅ |
| `tsx` | 4.22.1 | 4.22.1 ✅ |
| `typescript` | 5.9.3 | 6.0.3(major 1)|
| `vite` | 6.4.2 | 8.0.13(major 2)|
| `vitest` | 3.2.4 | 4.1.6(major 1)|

major bump 5 件は **当面採用しない**(動作不要、user 判断で個別 dashboard approval)。

### §4.3 npm audit(2026-05-17 時点)

```
found 0 vulnerabilities  (prod 37 / dev 324 / optional 80 / total 360)
```

---

## §5 update を採用する判断基準(主権ガイドライン)

dashboard を見たとき、以下のいずれかが **trigger** なら採用検討:

1. **LTS / サポート切れ通知**(eslint 8 EOL 等):security backport が止まる前に migration
2. **CVE 該当**(`vulnerabilityAlerts` label 付き):severity と reachability を評価
3. **新機能が明確に PKC2 に寄与**(release note で確認):benefit > migration cost なら採用
4. **高速化 / バンドルサイズ削減**:測定可能な改善なら採用
5. **dependency drift が大きすぎる**(2 major 以上溜まる):そろそろ片付けないと migration cost
   増大

不要な trigger:
- 「latest だから」「Dependabot が PR 出してきたから」「色々皆更新してるから」

採用方法:
1. Dashboard issue で対象 dep の checkbox を check
2. Renovate が PR 生成(7 日 cooldown 後)
3. CI green / 手動 review を経て user が merge 判断

---

## §6 Renovate GitHub App セットアップ(user 操作必須)

本 PR merge 後、user 自身で以下を実施:

1. <https://github.com/apps/renovate> にアクセス
2. **Install** → sm06224/PKC2 repo を選択して権限付与
3. 数分後 Renovate が初回 onboarding PR(自動)を起こす場合あり → 内容確認して close
4. `renovate.json` が自動 detect され、最初の dashboard issue が `📦 Dependency Dashboard — 主権モード`
   タイトルで開く
5. 以降、毎週月曜朝 6 時 JST(設定値)に dashboard が自動更新される

私(Claude)には GitHub App を install する権限がないため、この step は user 操作になります。

---

## §7 未対応(将来 wave 候補)

### §7.1 強化候補(Phase 2/3)

- **postinstall scripts 禁止**(`.npmrc` に `ignore-scripts=true`):build machine 攻撃の
  最大 vector を封殺、ただし legitimate な install script(playwright 等)を要 audit
- **npm provenance verify**(`npm install --provenance`、npm 9.5+):sigstore attestation を
  検証、公式 publisher のみ通す。対応未済 dep 多数(段階適用)
- **CycloneDX SBOM 生成**:release artifact に SBOM 同梱、user の vulnerability scan 容易化
- **GitHub Dependency Review action**:PR の依存 diff を gate(blocking)

### §7.2 段階適用候補(major bump)

dashboard で user が approve したら個別 PR で対応:

| package | bump | migration scope |
|---|---|---|
| `vitest` 3 → 4 | major | test typing changes(`'fetch' as never` 等)、`restoreMocks: true`、coverage threshold 再 baseline |
| `@vitest/coverage-v8` 3 → 4 | major | vitest 4 とペア |
| `typescript` 5 → 6 | major | tsc 挙動変化、src 全体 + types |
| `vite` 6 → 8 | 2 major | build pipeline、plugin API |
| `eslint` 8 → 10 | 2 major | flat config 移行必須(`.eslintrc.cjs` → `eslint.config.js`) |

---

## §8 history

| date | event |
|---|---|
| 2026-05-17 朝 | **Phase 1**(PR #455 merged):minor/patch 一括 + npm audit gate + Dependabot config(自動 PR 機構) |
| 2026-05-17 昼 | Dependabot が major bump 2 PR 自動生成(#460 / #461)、user が「常に最新は違う」と指摘 |
| 2026-05-17 昼 | **主権モード再設計**:Dependabot 撤退、Renovate dashboard 採用。PR #460/#461/#462 全 close、本 wave の PR で Renovate に切替 |
| TBD | Renovate GitHub App install(user 操作必須、本 PR description にて手順案内) |

---

## §9 関連 doc

- `renovate.json`(本 PR で新規):Renovate dashboard 設定
- `.github/workflows/ci.yml`:npm audit CI gate(Supply chain audit step)
- `feature-requests-2026-04-28-roadmap.md`:領域 11 未追記(将来候補)
- `../release/CHANGELOG_v2.2.0.md`:本 wave クローズ後に追記予定
