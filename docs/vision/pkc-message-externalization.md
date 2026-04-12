# PKC Message Externalization

Status: VISION
Created: 2026-04-12
Category: D. Long-Term Vision

---

## 1. 短い結論

PKC2 instance 間で「entry / container の断片を message として送受信」できる仕組みを構想する。
email / chat / postMessage 等 transport を抽象化し、
PKC2 を「個人 KB だけでなく、他者と情報をやり取りする node」にする。

---

## 2. 背景 / 問題

現状の PKC2 は single-user / single-container の閉じたシステム。
個人の knowledge base としては成立するが、
他者への共有は export file の受け渡しでしかない。
日常的な「この entry を共有したい」に応える手段が欠けている。

---

## 3. ユーザ価値

- entry 単位 / 断片単位の共有が簡単になる
- 他者からの断片を自分の container に取り込める
- 「PKC2 = KB + messaging」として日常ツール化する
- email / chat 等既存 transport を利用するため、特別なサーバ不要

---

## 4. 最小スコープ（vision 段階）

- message 単位の schema 定義（entry の subset を運搬可能な format）
- transport 抽象（postMessage / file export / future WebRTC）
- 受信側での「取り込む / 無視 / preview」UX
- 送信側では export 拡張として実装（まず file 経由）
- 既存 container の一部を message 化する切り出し経路

---

## 5. やらないこと

- 独自 transport server の構築
- リアルタイム共同編集
- 認証 / 権限モデル
- 大規模 mesh network
- end-to-end 暗号化の自前実装

---

## 6. 設計の方向性

- message format は既存 container export format の subset を再利用
- transport は adapter 層の拡張点として isolate（core は触らない）
- 取り込みは relation / revision と衝突しないよう新 ID 付与
- 「PKC2 文書を PKC2 ユーザに送る」基本経路をまず設計
- transport 層の plug 化（後に D-3 WebRTC とも共通化）

---

## 7. リスク / 未確定事項

- schema の forward / backward compatibility
- 取り込み時の重複 entry / relation の解決
- asset（base64）のサイズ上限
- spam / 悪意ある message への対処
- email transport の MIME / encoding 制約
- user identity（誰が送ったか）の表現

---

## 8. 将来拡張の余地

- D-2 multi-window / D-3 WebRTC との transport 共通基盤化
- end-to-end 暗号化
- signed message（送信者検証）
- public PKC2 feed（RSS 的用途）
- サードパーティ app との protocol 共通化
