// `vite build --mode library` builds the package into dist/. Every other mode serves or builds the demo from src/.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

const library = {
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: { index: resolve(root, 'src/index.ts'), 'react/index': resolve(root, 'src/react/index.ts') },
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) => id.startsWith('@videojs/') || id === 'hls.js' || id === 'react' || id.startsWith('react/'),
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
};

const demo = {
  root: resolve(root, 'demo'),
  base: process.env.VITE_BASE || '/',
  resolve: {
    alias: { 'videojs-hlsjs-live-timeline': resolve(root, 'src/index.ts') },
  },
  // Pre-bundled up front: discovering them per page triggers a reload mid-test.
  optimizeDeps: {
    include: [
      'hls.js',
      '@videojs/html',
      '@videojs/core/dom',
      '@videojs/element/context',
      'videojs-hlsjs-iframe-thumbnail',
    ],
  },
  server: { port: 5175, strictPort: true },
  build: {
    outDir: resolve(root, 'dist-demo'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      input: {
        index: resolve(root, 'demo/index.html'),
      },
    },
  },
};

export default defineConfig(({ mode }) => (mode === 'library' ? library : demo));
