import { defineConfig } from 'vite';

// violating fixture: alias 对象形式 + @/custom 在 @ 之后 → alias_array_form + alias_order fail
export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
      '@/custom': '/src/custom',
    },
  },
  server: {
    proxy: {
      '/api': {
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    minify: false,
    sourcemap: true,
  },
});
