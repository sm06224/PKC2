# Security Policy

## Reporting a Vulnerability

PKC2 の脆弱性を発見した場合は、**GitHub Security Advisories** から非公開で報告してください:

- リポジトリの **"Security" タブ → "Report a vulnerability"** から提出
- URL: <https://github.com/sm06224/PKC2/security/advisories/new>

公開 issue / PR / discussion での報告は **避けてください**(まだ修正されていない脆弱性が公開される可能性があるため)。

## Supported Versions

PKC2 は **単一 HTML として配布** されており、利用者は `dist/pkc2.html` を手元にダウンロードして使う運用が想定されています。

| Version | Status |
|---|---|
| `main` ブランチ HEAD | ✅ 最新の修正が入る、推奨 |
| 過去 release tag | ❌ patch backport なし、最新 main に upgrade してください |
| ユーザが手元で改変したコピー | ❌ サポート対象外 |

PKC2 は実質 1 名運営の OSS プロジェクトであり、商用 LTS のような version-by-version の patch backport は提供しません。脆弱性修正は **main にのみ landing** します。

## Response Expectations

- 報告から **初期応答**: best effort(目安: 1 週間以内)
- 修正までの期間: 内容の重大度と修正コストによる(致命的なら最優先、軽微なら次の wave に組み込み)
- 公開タイミング: 修正 commit の merge 後に Security Advisory を publish

solo dev 運営のため SLA は提示できませんが、誠実に対応します。

## Scope

PKC2 本体(`src/` / `dist/` 配下のコード、`build/` の release builder、`PKC2-Extensions/`)が対象です。以下は **scope 外**:

- 第三者の Extension(別リポジトリで開発される AI 協働 Extension など)
- 利用者が手元で実行している node / npm / browser の脆弱性
- 利用者が改変した container / 第三者から受け取った container ファイルの内容

## License

PKC2 は **AGPL-3.0** ライセンスです。脆弱性修正の patch を contribute する場合、AGPL-3.0 でライセンスされることに同意したと見なされます(詳細は `CONTRIBUTING.md` を参照)。
