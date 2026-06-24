// 派生构建配置(inject 生成,已 gitignore)。勿手改,改 inject.mjs。
import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import upstream from '/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/vite.config.ts';

const upstreamCfg =
  typeof upstream === 'function'
    ? upstream({ command: 'serve', mode: 'development' })
    : upstream;

export default mergeConfig(
  upstreamCfg,
  defineConfig({
    // 关键:覆盖上游的相对 root/packages/client,改为绝对上游路径。
    // 上游 config 用相对路径,mergeConfig 后会被当作相对 overlay 解析(错)。
    root: '/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/packages/client',
    publicDir: resolve('/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/packages/client', 'public'),
    resolve: {
      // 用数组形式 alias(保证顺序:更具体的前缀先匹配)。
      // Vite 对象形式 alias 不保证顺序;数组形式按声明顺序匹配,故 '@/custom' 必须在 '@' 前。
      alias: [
        // /src/main.ts(index.html 的入口)→ overlay entry shim(复制上游 main.ts 启动序列 + A 类注册)。
        // 用字符串精确匹配 index.html 里的 /src/main.ts,使 Vite 以 index.html 为入口、
        // 但把 main 重定向到 overlay shim(保留 HTML 处理,生成 index.html)。
        // (字符串 find 做精确匹配;正则在模板插值里转义易错,故不用 RegExp。)
        { find: '/src/main.ts', replacement: '/Volumes/nvme2230/lab/ncwk/overlay/registries/client/entry.mts' },
        { find: '@/custom', replacement: '/Volumes/nvme2230/lab/ncwk/overlay/custom/client' },
        { find: '@custom', replacement: '/Volumes/nvme2230/lab/ncwk/overlay/custom/client' },
        { find: '@registries', replacement: '/Volumes/nvme2230/lab/ncwk/overlay/registries' },
        // @ 兜底指向上游 client src(@/api、@/views、@/components 等解析到上游)
        { find: '@', replacement: '/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/packages/client/src' },
      ],
    },
    // outDir 必须显式覆盖为上游 dist/client 的绝对路径——上游 config 用相对
    // '../../dist/client',mergeConfig 后会相对 overlay 解析(错)。desktop 构建读此目录。
    // input 显式指向上游 index.html:覆盖 root 后,Vite 默认从 <root>/index.html 发现入口
    // 可能失效,显式 input 保证 HTML 被处理、生成 dist/client/index.html。
    build: {
      outDir: '/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/dist/client',
      rollupOptions: { input: resolve('/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/packages/client', 'index.html') },
    },
    server: {
      proxy: {
        '/agent-health': {
          target: 'http://127.0.0.1:8650',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/agent-health/, '/health'),
        },
      },
    },
  })
);
