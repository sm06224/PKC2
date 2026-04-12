# WebRTC P2P Collaboration

Status: VISION
Created: 2026-04-12
Category: D. Long-Term Vision

---

## 1. 短い結論

WebRTC data channel を使った PKC2 instance 間の直接通信を構想する。
中央 server を持たず、P2P で container / entry を同期・共有できる layer を追加する。

---

## 2. 背景 / 問題

PKC2 は「single HTML file として配布される個人 KB」として成立しているが、
他者との共同作業 / 共有においては：

- export file のやり取りしか手段が無い
- 同期的なやり取りができない
- 中央 server を立てると「personal KB」の単純さが壊れる

中央 server 不要で「知っている相手と直接繋ぐ」P2P はこの gap を埋める候補となる。

---

## 3. ユーザ価値

- server 不要で entry / container を即時共有できる
- 会議中に entry を相手に「届ける」ような使い方ができる
- offline / LAN 内でも動作する
- データが third-party server を経由しない

---

## 4. 最小スコープ（vision 段階）

- WebRTC signaling の最小実装（manual copy-paste SDP / signaling server optional）
- data channel 上で D-1 message format をやり取り
- 同期の単位は「手動送信」（自動 sync は後続）
- 受信側で取り込み / 無視を選択できる UX
- connection は single peer 限定（mesh は将来）

---

## 5. やらないこと

- 分散 consensus / CRDT の自前実装
- 大規模 mesh network
- video / audio call（data channel のみ）
- 中央 signaling server の運営
- 匿名化 / onion routing
- 本格的認証基盤

---

## 6. 設計の方向性

- adapter 層の transport plug として実装（D-1 と統合）
- data channel open / close / send は一般 interface で抽象
- signaling は初期は manual copy-paste（offer / answer string 交換）
- 受信 message は D-1 と同じ取り込み経路を再利用
- core / features は触らない

---

## 7. リスク / 未確定事項

- NAT traversal（STUN / TURN の依存）
- signaling UX の煩雑さ（手動 SDP 交換）
- browser 間互換性
- asset（base64 画像等）の転送サイズ
- セキュリティ（認証 / 改ざん検知）
- 接続切断時の partial state の扱い

---

## 8. 将来拡張の余地

- 自動 sync（変更 stream を継続送信）
- mesh / group 同期（複数 peer）
- CRDT 導入による conflict-free 共同編集
- signaling 用の shared server option
- D-2 multi-window との統合（local window 群も一種の P2P 配置）
- end-to-end 暗号化
