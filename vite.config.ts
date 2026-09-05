import { defineConfig } from 'vite';
export default defineConfig({
  optimizeDeps: { exclude: ['three'] },
  build: {
    rollupOptions: {
      input: {
        home: 'index.html',
        deepfield: 'games/deepfield/index.html',
        neonSplit: 'games/neon-split/index.html',
        orbitalScrapyard: 'games/orbital-scrapyard/index.html',
      },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
