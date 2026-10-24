import { defineConfig } from 'vite';

// compliant fixture: alias 数组形式 + @/custom 在 @ 前 + manualChunks + target + base + optimizeDeps
export default defineConfig({
  base: '/app/',
  resolve: {
    alias: [
      { find: '@/custom', replacement: '/src/custom' },
      { find: '@', replacement: '/src' },
    ],
  },
  optimizeDeps: {
    include: ['lodash'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    target: ['es2020', 'chrome88'],
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router'],
        },
      },
    },
  },
});
