/**
 * Ambient 宣言。TypeScript 6 は未知モジュールの side-effect import
 * (`import './styles/base.css'`)に型宣言を要求するため、CSS を含む
 * ビルド時アセット import の module 宣言をここに集約する(vite が実体を処理)。
 */
declare module '*.css';

// sqlite3.wasm の静的焼き込み(P2)── vite `?inline` は data URL 文字列を返す。
// `.wasm` のままだと vite 8(rolldown)が特別扱いして落ちるため `.bin` 拡張子。
declare module '*.bin?inline' {
  const dataUrl: string;
  export default dataUrl;
}

// worker の inline 焼き込み(P2)── vite `?worker&inline` は worker script を
// bundle 内に base64 で埋め、Blob URL から起動する constructor を返す。
// 単一 HTML 哲学と両立する worker の唯一の形(実行時 fetch なし)。
declare module '*?worker&inline' {
  const workerFactory: new () => Worker;
  export default workerFactory;
}
