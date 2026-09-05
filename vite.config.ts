import { defineConfig } from 'vite';
export default defineConfig({
  optimizeDeps: { exclude: ['three'] },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
