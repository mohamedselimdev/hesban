import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import { buildCsp } from './src/main/csp';

/** Injects the strict production CSP as a meta tag (file:// pages receive no headers). */
function productionCsp(): Plugin {
  return {
    name: 'hesban-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp('production')}" />`;
      return html.replace('<head>', `<head>\n    ${meta}`);
    },
  };
}

// UI checks build a second variant (with the component gallery) into another folder.
const outRoot = resolve(__dirname, process.env['HESBAN_OUT_DIR'] ?? 'out');

export default defineConfig({
  main: {
    build: {
      outDir: resolve(outRoot, 'main'),
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      outDir: resolve(outRoot, 'preload'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), productionCsp()],
    build: {
      outDir: resolve(outRoot, 'renderer'),
      emptyOutDir: true,
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
});
