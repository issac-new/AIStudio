// 派生构建配置(inject 生成,已 gitignore)。勿手改,改 inject.mjs。
import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import upstream from "/Volumes/nvme2230/lab/.wxwork/upstream-iso-20261001/hermes-studio/vite.config.ts";

const upstreamCfg =
  typeof upstream === 'function'
    ? upstream({ command: 'serve', mode: 'development' })
    : upstream;

// 环境级根治(B3)：compiler-sfc 解析 <script setup> 导入类型(defineProps<NodeProps<..>> 等)
// 时默认取 ts.sys;本仓 typescript 是 7.x 预览版,compiler-sfc 3.5.x 的 ts.sys 自动探测在其
// 模块结构下失效 → 抛 "No fs option ... non-Node environment",全量构建在 WorkflowAgentNode
// 处断裂。此处显式注入 node:fs 适配器替代 ts.sys 自动探测,一次性覆盖全仓导入类型 defineProps。
// (上游 vite.config 的 vue() 为裸调用无选项,故原位替换不丢配置;若上游日后加选项需同步合并。)
const sfcFs = {
  fileExists: (f) => { try { return existsSync(f); } catch { return false; } },
  readFile: (f) => { try { return readFileSync(f, 'utf8'); } catch { return undefined; } },
  realpath: (f) => { try { return realpathSync(f); } catch { return f; } },
};
const withVueFs = (cfg) => ({
  ...cfg,
  plugins: (cfg.plugins ?? []).map((p) =>
    p && p.name === 'vite:vue' ? vue({ script: { fs: sfcFs } }) : p,
  ),
});

export default mergeConfig(
  withVueFs(upstreamCfg),
  defineConfig({
    cacheDir: "/tmp/vite-cache-iso-8651",
    // 关键:覆盖上游的相对 root/packages/client,改为绝对上游路径。
    // 上游 config 用相对路径,mergeConfig 后会被当作相对 overlay 解析(错)。
    root: "/Volumes/nvme2230/lab/.wxwork/upstream-iso-20261001/hermes-studio/packages/client",
    publicDir: resolve("/Volumes/nvme2230/lab/.wxwork/upstream-iso-20261001/hermes-studio/packages/client", 'public'),
    resolve: {
      // 防双实例（2026-09-29 隔离构建实锤：overlay 软链 node_modules 与上游自身 node_modules
      // 各解析一份 pinia → getActivePinia()._s undefined，SPA 启动即崩、body 全空）——单仓不触发，隔离/独立 clone 必配。
      dedupe: ['vue', 'pinia', 'vue-router', 'vue-i18n', 'naive-ui'],
      // 用数组形式 alias(保证顺序:更具体的前缀先匹配)。
      // Vite 对象形式 alias 不保证顺序;数组形式按声明顺序匹配,故 '@/custom' 必须在 '@' 前。
      alias: [
        // /src/main.ts(index.html 的入口)→ overlay entry shim(复制上游 main.ts 启动序列 + A 类注册)。
        // 用字符串精确匹配 index.html 里的 /src/main.ts,使 Vite 以 index.html 为入口、
        // 但把 main 重定向到 overlay shim(保留 HTML 处理,生成 index.html)。
        // (字符串 find 做精确匹配;正则在模板插值里转义易错,故不用 RegExp。)
        { find: '/src/main.ts', replacement: "/Volumes/nvme2230/lab/ncwk/overlay/registries/client/entry.mts" },
        { find: '@/custom', replacement: "/Volumes/nvme2230/lab/ncwk/overlay/custom/client" },
        { find: '@custom', replacement: "/Volumes/nvme2230/lab/ncwk/overlay/custom/client" },
        { find: '@registries', replacement: "/Volumes/nvme2230/lab/ncwk/overlay/registries" },
        // @ 兜底指向上游 client src(@/api、@/views、@/components 等解析到上游)
        { find: '@', replacement: "/Volumes/nvme2230/lab/.wxwork/upstream-iso-20261001/hermes-studio/packages/client/src" },
      ],
    },
    // outDir 必须显式覆盖为上游 dist/client 的绝对路径——上游 config 用相对
    // '../../dist/client',mergeConfig 后会相对 overlay 解析(错)。desktop 构建读此目录。
    // input 显式指向上游 index.html:覆盖 root 后,Vite 默认从 <root>/index.html 发现入口
    // 可能失效,显式 input 保证 HTML 被处理、生成 dist/client/index.html。
    build: {
      outDir: "/Volumes/nvme2230/lab/.wxwork/upstream-iso-20261001/hermes-studio/dist/client",
      rollupOptions: { input: resolve("/Volumes/nvme2230/lab/.wxwork/upstream-iso-20261001/hermes-studio/packages/client", 'index.html') },
    },
    server: {
      // fs.allow 显式双根（V4 轮实锤）：root 指到 upstream 后 vite 默认
      // searchForWorkspaceRoot 只放行 upstream 树——alias 解析出的 overlay
      // /@fs 模块（entry shim/custom 全部 A 类资产）被 403，A 类注册链路死，
      // 应用以上游裸模式启动（ia2 路由缺失 → #/app 命中 catch-all 重定向环）。
      // 显式放行 overlay 根 + upstream 根 + workspace 外层（node_modules 归属）。
      fs: {
        allow: [
          "/Volumes/nvme2230/lab/ncwk/overlay",
          "/Volumes/nvme2230/lab/ncwk/upstream",
          "/Volumes/nvme2230/lab/.wxwork/upstream-iso-20261001/hermes-studio",
        ],
      },
      proxy: {
        // G3 威胁面收口：vite dev 代理默认不带 X-Forwarded-For，经代理的 LAN 请求与
        // 本机直连在后端字节级不可区分，gateway-credentials 的回环闸会被本机代理放大。
        // 这里给上游代理键补 xfwd（mergeConfig 深合并，保留上游 target/configure）：
        // 代理如实转发客户端 IP，后端 routes.ts 的 XFF 闸即可拒绝非回环来源。
        '/api': { xfwd: true },
        '/v1': { xfwd: true },
        '/health': { xfwd: true },
        '/upload': { xfwd: true },
        '/socket.io': { xfwd: true },
        '/agent-health': {
          target: 'http://127.0.0.1:8650',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/agent-health/, '/health'),
          // hermes-agent v0.18.0 的 /health/detailed 需要 API_SERVER_KEY 认证。
          // 运行时从 ~/.hermes/.env 读取 key（gateway 启动也读同一文件），注入 Authorization header。
          configure: (proxy) => {
            let key = process.env.API_SERVER_KEY || ''
            if (!key) {
              try {
                const fs = require('fs')
                const envPath = require('path').join(require('os').homedir(), '.hermes', '.env')
                const m = fs.readFileSync(envPath, 'utf8').match(/^API_SERVER_KEY=(.+)$/m)
                if (m) key = m[1].trim()
              } catch { /* .env 不存在或读失败，忽略 */ }
            }
            proxy.on('proxyReq', (proxyReq) => {
              if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`)
            })
          },
        },
      },
    },
  })
);
