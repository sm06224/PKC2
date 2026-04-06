import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@adapter': resolve(__dirname, 'src/adapter'),
      '@features': resolve(__dirname, 'src/features'),
      '@runtime': resolve(__dirname, 'src/runtime'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['iife'],
      name: 'PKC2',
      fileName: () => 'bundle.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'bundle[extname]',
      },
    },
    cssCodeSplit: false,
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2 },
      mangle: { toplevel: true },
    },
  },
});
