import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        // HTML files as entry points (Vite's preferred approach)
        devtools: resolve(__dirname, 'src/devtools/devtools.html'),
        panel: resolve(__dirname, 'src/devtools/panel.html'),
        // Service worker as separate JavaScript entry
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts')
      },
      output: {
        // Keep simple filenames to match manifest.json references
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
        // Important: Don't code-split for Chrome extensions
        manualChunks: undefined
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true, // Enable debugging in Chrome DevTools
    minify: false, // Keep readable for development
    target: 'es2020'
  },
  // Copy public assets (icons, manifest) to dist
  publicDir: 'public'
});

