/**
 * asset の「bytes 不在が確定した」事実の置き場(視覚監査 2026-07-25 A5/A4)。
 *
 * 背景:添付の presenter は「asset_key はあるが bytes が手元に無い」を
 *   - `trulyStripped`(Light export で意図的に除去された)
 *   - `pendingHydration`(まだ読み込んでいないだけ)
 * の 2 状態にしか分解していなかった。「**store にも実体が無い**」という
 * 第 3 の状態が型にも表示にも無いため、asset_key が実在しない添付は
 * 永久に「⏳ ファイル読み込み中…」のまま固まり、user には「重いのか壊れたのか」
 * が区別できなかった。
 *
 * その事実自体は working-set が既に持っている(`store.loadAsset()` が
 * clean な null を返した key)。ここはそれを **同期の render 経路から読める
 * 形**で保持するだけの module-level fact 置き場。`asset-miss-recorder.ts` と
 * 同じ流儀で features 層に置き、adapter/platform(記録側)と adapter/ui
 * (表示側)の双方から上向き import なしに参照できるようにする。
 *
 * 設計上の要点:
 * - **時間ベースの諦め(タイムアウト)を含まない**。「N 秒待っても来ない」は
 *   遅いだけかもしれず、誤検知は Light export の説明を消して user を不安に
 *   させる。判定源は store の応答だけ
 * - **throw は absence ではない**。一時的な I/O 障害を bytes 欠落と誤認しない
 * - container 差し替え(import / Rehydrate)では必ず `resetAssetAbsence()`。
 *   でないと新しいデータに古い嘘が残る
 */

const confirmedAbsent = new Set<string>();
let revision = 0;

/** store が clean な null を返した = bytes 不在が確定した key。 */
export function markAssetAbsent(key: string): void {
  if (!key || confirmedAbsent.has(key)) return;
  confirmedAbsent.add(key);
  revision++;
}

/** bytes が見つかった key。過去の absence 判定を取り消す。 */
export function markAssetPresent(key: string): void {
  if (!key || !confirmedAbsent.delete(key)) return;
  revision++;
}

/** render 経路から同期で読む述語。 */
export function isAssetConfirmedAbsent(key: string | null | undefined): boolean {
  return !!key && confirmedAbsent.has(key);
}

/**
 * 変更検知用の版数。working-set が「published map は同一だが absence が
 * 変わった」回に force publish するかどうかの判定に使う ── これが無いと
 * absence が確定した回に再 render 自体が起きず、⏳ が画面に残り続ける。
 */
export function assetAbsenceRevision(): number {
  return revision;
}

/** container 差し替え / test 用。 */
export function resetAssetAbsence(): void {
  if (confirmedAbsent.size === 0) return;
  confirmedAbsent.clear();
  revision++;
}

/** test / debug 用の覗き窓。 */
export function __confirmedAbsentKeys(): readonly string[] {
  return [...confirmedAbsent];
}
