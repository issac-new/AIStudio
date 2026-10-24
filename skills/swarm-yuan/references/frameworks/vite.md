---
ruleset_id: vite
适用版本: Vite 8.x（8.x 现行，Rolldown 集成待验证 GA 时点）/ 7.x（差异单独标注）
最后调研: 2026-07-17（来源：https://vite.dev/ ；https://vite.dev/config/ ；https://vite.dev/guide/build.html ；https://vite.dev/guide/env-and-mode.html ；https://vite.dev/guide/features.html ）
深度门槛: 10
---

# Vite 规则集

<!--
本规则集覆盖 Vite 8.x（截至 2026-07 现行，Rolldown 后端集成待验证 GA 时点）与 7.x（差异单独标注）。调研时点：2026-07-17。
Vite 8 起逐步引入 Rolldown 作为打包后端（待验证默认启用时点），配置层 API 大体兼容。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `vite` 包（package.json devDependencies）/ `@vitejs/plugin-vue` / `@vitejs/plugin-react` | 高 |
| 文件 | `vite.config.ts` / `vite.config.js` / `vite.config.mts` | 高 |
| 配置 | `defineConfig(` / `rollupOptions` / `optimizeDeps` / `server.proxy` | 高 |
| 代码 | `import.meta.env.VITE_` / `import.meta.glob(` / `__VITE_` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 vite 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Vite 配置文件：`find "${PROJECT_DIR}" -maxdepth 3 -name 'vite.config.*' -not -path '*/node_modules/*'`（计数核验基准：vite.config 文件数）
- 环境变量引用：`grep -rnE "import\.meta\.env\.VITE_" "${PROJECT_DIR}" --include='*.ts' --include='*.vue'`（计数核验基准：VITE_ 引用行数）
- alias 配置：`grep -rnE 'alias:' "${PROJECT_DIR}"/vite.config.*`（计数核验基准：alias 配置行数）
- 插件配置：`grep -rnE 'plugins:' "${PROJECT_DIR}"/vite.config.*`（计数核验基准：plugins 配置数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：alias 配置须可解析；数组形式保证顺序，@/custom 须在 @ 之前
- **适用版本**: Vite 5.x+/8.x
- **规律**: `resolve.alias` 对象形式合法但不保证声明顺序（Vite 内部按 key 序处理），当 `@/custom` 与 `@` 同时存在时 `@` 会先吞掉 `@/custom`。使用别名时推荐数组形式 `[{ find: '@/custom', replacement: ... }, { find: '@', replacement: ... }]`，`@/custom` 排在 `@` 之前；项目完全不使用别名也是合法状态。
- **违反后果**: alias 解析错乱、`@/custom/xxx` 被 `@` 误匹配、模块解析 404。
- **验证方法**: `alias:` 存在但非数组/对象形态 → fail；对象形式 → warn（顺序不保证）；未配置 alias → pass；`@/custom` 行号 ≥ `@` 行号 → warn。
- **对应门禁**: fw_vite_alias_array_form(warn) / fw_vite_alias_order(warn)

```verify
id: vite-r1
cmd: 
expect: always
```

### 规律：inject 脚本须支持 --clean 回滚
- **适用版本**: Vite 全版本（ncwk 定制 inject.mjs）
- **规律**: ncwk 用 inject.mjs 向产物注入定制代码，须支持 `--clean` 回滚分支，避免重复注入导致产物污染。
- **违反后果**: 重复注入致产物污染、回滚失败。
- **验证方法**: inject.mjs 无 `--clean` 分支 → fail。
- **对应门禁**: fw_vite_inject_clean(warn)

```verify
id: vite-r2
cmd: 
expect: always
```

### 规律：环境变量须 VITE_ 前缀，防敏感配置泄漏客户端
- **适用版本**: Vite 5.x+/8.x
- **规律**: Vite 仅注入 `VITE_` 前缀的环境变量到客户端 `import.meta.env`。后端密钥（PASSWORD/SECRET/API_KEY/TOKEN）禁用 VITE_ 前缀，须放服务端。`process.env.XXX`（非 VITE_）在客户端为 undefined，引用即配置泄漏误用。
- **违反后果**: 敏感密钥打包进客户端、源码泄漏 CWE-540 / CWE-312。
- **验证方法**: 检出 `process.env.XXX`/`import.meta.env.XXX`（非 VITE_/内置）或 .env 含敏感 key → warn。
- **对应门禁**: fw_vite_env_prefix(warn)

```verify
id: vite-r3
cmd: 
expect: always
```

### 规律：构建须配 manualChunks 分包
- **适用版本**: Vite 5.x+/8.x
- **规律**: 默认 Rollup 按依赖关系分 chunk，单 chunk 可能过大（vendor 全打一起）。须配 `build.rollupOptions.output.manualChunks` 按路由/依赖维度拆分（如 vendor、router、ui-lib），利用浏览器缓存。
- **违反后果**: 单 chunk 过大、首屏加载慢、缓存命中率低。
- **验证方法**: 无 `manualChunks`/`rollupOptions` → warn。
- **对应门禁**: fw_vite_manual_chunks(warn)

```verify
id: vite-r4
cmd: 
expect: always
```

### 规律：build.target 须显式配置浏览器兼容
- **适用版本**: Vite 5.x+/8.x
- **规律**: Vite 5+ 默认 `target: 'baseline-widely-available'`（8.x 待验证默认值）。须按项目兼容性需求显式声明 `target: ['es2020', 'chrome88']` 等，避免默认值变化导致兼容性回退。
- **违反后果**: 默认 target 变化致旧浏览器语法不兼容、运行期报错。
- **验证方法**: 无 `target:` 配置 → warn。
- **对应门禁**: fw_vite_build_target(warn)

```verify
id: vite-r5
cmd: 
expect: always
```

### 规律：生产构建须关闭 sourcemap
- **适用版本**: Vite 5.x+/8.x
- **规律**: 生产 `sourcemap: true` 会把源码 map 上传，泄露业务源码。须 `sourcemap: false` 或按环境判断（`sourcemap: isProd ? false : true`）。确需 sourcemap 须用 hidden + 上传到错误监控后删除。
- **违反后果**: 源码泄漏 CWE-540、业务逻辑暴露。
- **验证方法**: `sourcemap: true` 且无环境判断 → warn。
- **对应门禁**: fw_vite_sourcemap_prod(warn)

```verify
id: vite-r6
cmd: 
expect: always
```

### 规律：base 路径须显式配置（部署子路径）
- **适用版本**: Vite 5.x+/8.x
- **规律**: `base` 默认 `'/'`，部署到子路径（如 `https://cdn.example.com/app/`）时资源路径 404。须显式 `base: '/app/'`。
- **违反后果**: 子路径部署资源 404、白屏。
- **验证方法**: 无 `base:` 配置 → warn。
- **对应门禁**: fw_vite_base_path(warn)

```verify
id: vite-r7
cmd: 
expect: always
```

### 规律：预构建缓存须显式管理 optimizeDeps
- **适用版本**: Vite 5.x+/8.x
- **规律**: CommonJS 依赖（如 lodash）须在 `optimizeDeps.include` 显式声明预构建，否则 dev 启动时 Vite 重复全量预构建、页面刷新卡顿。大型依赖预构建可加速 dev。
- **违反后果**: dev 启动慢、页面刷新卡顿、CJS 依赖运行期报错。
- **验证方法**: 无 `optimizeDeps` → warn。
- **对应门禁**: fw_vite_optimize_deps(warn)

```verify
id: vite-r8
cmd: 
expect: always
```

### 规律：server.proxy 须配 target，禁裸 rewrite
- **适用版本**: Vite 5.x+/8.x
- **规律**: `server.proxy` 须显式 `target` 指向后端地址，仅配 `rewrite` 无 `target` 转发无效。
- **违反后果**: 代理转发无效、dev 跨域失败。
- **验证方法**: 检出 `proxy:` 但无 `target:` → warn。
- **对应门禁**: fw_vite_proxy_target(warn)

```verify
id: vite-r9
cmd: 
expect: always
```

### 规律：生产压缩须 esbuild/minify，禁关闭
- **适用版本**: Vite 5.x+/8.x
- **规律**: Vite 默认 `minify: 'esbuild'`，关闭 minify（`minify: false`）致产物未压缩、包体过大。确需调试可临时关闭，生产必须开启。
- **违反后果**: 产物未压缩、包体膨胀、加载慢。
- **验证方法**: `minify: false`/`'none'` → warn。
- **对应门禁**: fw_vite_esbuild_minify(warn)

```verify
id: vite-r10
cmd: 
expect: always
```

<!--
共 11 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_vite_alias_array_form | warn | alias 形态无法识别 → fail；对象形式 warn；未配置 pass | VITE_CONFIG_FILE | — |
| fw_vite_alias_order | warn | @/custom 不在 @ 之前 → fail | VITE_CONFIG_FILE | — |
| fw_vite_inject_clean | warn | inject.mjs 无 --clean 回滚 → fail | VITE_INJECT_SCRIPT | — |
| fw_vite_env_prefix | warn | 非 VITE_ 前缀敏感环境变量 → warn 泄漏 | VITE_CONFIG_FILE | CWE-540 / CWE-312 |
| fw_vite_manual_chunks | warn | 无 manualChunks 分包 → warn | VITE_CONFIG_FILE | — |
| fw_vite_build_target | warn | 无 build.target → warn | VITE_CONFIG_FILE | — |
| fw_vite_sourcemap_prod | warn | sourcemap 开启无环境判断 → warn | VITE_CONFIG_FILE | CWE-540 |
| fw_vite_base_path | warn | 无 base 路径 → warn | VITE_CONFIG_FILE | — |
| fw_vite_optimize_deps | warn | 无 optimizeDeps → warn | VITE_CONFIG_FILE | — |
| fw_vite_proxy_target | warn | proxy 无 target → warn | VITE_CONFIG_FILE | — |
| fw_vite_esbuild_minify | warn | minify 关闭 → warn | VITE_CONFIG_FILE | — |

<!--
门禁 id 命名规范：fw_vite_<rule>（rule 全小写下划线）。
本表 11 条 id 须在 assets/framework-gates/vite.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_vite_<rule>(fail/warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: vite  requires_conf: VITE_CONFIG_FILE VITE_INJECT_SCRIPT` 声明。
fixture 验证覆盖：violating 含 alias 对象形式 + @/custom 在 @ 之后 + inject.mjs 无 --clean 回滚
→ alias_array_form + alias_order + inject_clean fail 主触发（3/3 已断言）；compliant 全 pass。
2026-07-20 唤醒登记：inject_clean 原 conf VITE_INJECT_SCRIPT="" 静默跳过，violating 配置指向新增 inject.mjs 后命中（门禁脚本未动）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| vite × vue | Vue SFC 须配 @vitejs/plugin-vue | 否则 .vue 文件无法编译 |
| vite × element/antd/naiveui | 按需引入须配 unplugin-vue-components + 对应 Resolver | 否则全量引入或组件未注册 |
| vite × vitest | vitest.config 须复用 vite alias（或独立配置一致） | 否则测试内 alias 解析与构建不一致 |
| vite × tailwind | 须用 @tailwindcss/vite 插件（4.x）或 postcss | 4.x 推荐原生 Vite 插件，PostCSS 为旧方案 |

<!--
无强交互的框架组合省略；本表聚焦 vite 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Vite 5.0 | 默认 build.target 改为 'baseline-widely-available' | 旧默认 'esnext' 项目须显式声明 target |
| Vite 5.0 | CJS Node API 废弃，仅 ESM | `require('vite')` 失效，须改 import |
| Vite 6.0 | Environment API（多环境构建）引入 | SSR/RSC 配置方式变化 |
| Vite 7.0 | Node 20+ 要求 | 旧 Node 版本不兼容 |
| Vite 8.0 | Rolldown 后端集成（待验证默认启用时点） | 待验证：Rolldown 默认启用后 rollupOptions 兼容性须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
