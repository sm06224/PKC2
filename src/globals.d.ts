/**
 * Ambient 宣言。TypeScript 6 は未知モジュールの side-effect import
 * (`import './styles/base.css'`)に型宣言を要求するため、CSS を含む
 * ビルド時アセット import の module 宣言をここに集約する(vite が実体を処理)。
 */
declare module '*.css';
