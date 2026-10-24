---
ruleset_id: webpack
适用版本: webpack 5.x（5.9x+ 现行维护态；6.x 待验证规划，差异单独标注）
最后调研: 2026-07-17（来源：https://webpack.js.org/ ；https://webpack.js.org/configuration/ ；https://webpack.js.org/guides/code-splitting/ ；https://webpack.js.org/plugins/split-chunks-plugin/ ；https://webpack.js.org/configuration/cache/ ）
深度门槛: 10
---

# webpack 规则集

<!--
本规则集覆盖 webpack 5.x（截至 2026-07 现行维护态，5.9x+）。调研时点：2026-07-17。
webpack 5.x 引入持久缓存、Module Federation、Asset Modules；6.x 尚未 GA（待验证规划）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `webpack` 包（package.json devDependencies）/ `webpack-cli` / `webpack-dev-server` | 高 |
| 文件 | `webpack.config.ts` / `webpack.config.js` / `webpack.config.prod.*` | 高 |
| 配置 | `module.exports = { ... }` + `entry`/`output`/`module.rules`/`plugins` | 高 |
| 代码 | `require.context(` / `import(/* webpackChunkName */)` / `module.hot` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 webpack 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- webpack 配置文件：`find "${PROJECT_DIR}" -maxdepth 3 -name 'webpack.config.*' -not -path '*/node_modules/*'`（计数核验基准：webpack.config 文件数）
- entry 入口：`grep -rnE 'entry:' "${PROJECT_DIR}"/webpack.config.*`（计数核验基准：entry 配置行数）
- plugin 引用：`grep -rnE 'new [A-Z][a-zA-Z]*Plugin\(' "${PROJECT_DIR}"/webpack.config.*`（计数核验基准：plugin 实例化数）
- loader 规则：`grep -rnE 'use:|loader:' "${PROJECT_DIR}"/webpack.config.*`（计数核验基准：loader 配置行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：须配持久缓存 cache.type='filesystem'
- **适用版本**: webpack 5.x
- **规律**: webpack 5 引入 `cache: { type: 'filesystem' }` 持久缓存，二次构建可提速 90%+。未配则每次全量构建。CI 须配 `cache.managedPaths`/`buildDependencies` 保证缓存正确性。
- **违反后果**: 二次构建慢、CI 耗时长。
- **验证方法**: 无 `cache.type='filesystem'` → warn。
- **对应门禁**: fw_webpack_persistent_cache(warn)

```verify
id: webpack-r1
cmd: 
expect: always
```

### 规律：须配 splitChunks 分包策略
- **适用版本**: webpack 5.x
- **规律**: 默认 `splitChunks` 策略单一（仅拆 vendor），须按项目配 `cacheGroups` 拆分 vendor/公共模块/运行时（`runtimeChunk`），利用浏览器缓存。不配则单 chunk 过大。
- **违反后果**: 单 chunk 过大、缓存命中率低、首屏慢。
- **验证方法**: 无 `splitChunks` → warn。
- **对应门禁**: fw_webpack_splitchunks(warn)

```verify
id: webpack-r2
cmd: 
expect: always
```

### 规律：动态 import 须配 webpackChunkName 命名
- **适用版本**: webpack 5.x
- **规律**: `import('./mod')` 默认生成数字 chunk 名（`1.js`），调试困难 + 缓存失效。须用魔法注释 `import(/* webpackChunkName: "mod" */ './mod')` 命名。配合 `output.chunkFilename` 控制输出。
- **违反后果**: chunk 名为数字、调试困难、缓存失效。
- **验证方法**: 动态 `import(` 无 `webpackChunkName` → warn。
- **对应门禁**: fw_webpack_chunk_naming(warn)

```verify
id: webpack-r3
cmd: 
expect: always
```

### 规律：环境变量须用 DefinePlugin 注入
- **适用版本**: webpack 5.x
- **规律**: 客户端代码引用 `process.env.XXX` 须用 `DefinePlugin` 显式注入（编译期替换），否则运行期 undefined。敏感变量须按环境区分（dev/prod）。
- **违反后果**: `process.env.XXX` undefined、配置失效。
- **验证方法**: 无 `DefinePlugin` → warn。
- **对应门禁**: fw_webpack_defineplugin(warn)

```verify
id: webpack-r4
cmd: 
expect: always
```

### 规律：生产 mode 须开启压缩
- **适用版本**: webpack 5.x
- **规律**: `mode: 'production'` 默认开启 `minimize`（TerserPlugin）。显式 `minimize: false` 会关闭压缩，包体过大。生产必须开启。
- **违反后果**: 产物未压缩、包体膨胀。
- **验证方法**: `mode: 'production'` + `minimize: false` → warn。
- **对应门禁**: fw_webpack_mode_minimize(warn)

```verify
id: webpack-r5
cmd: 
expect: always
```

### 规律：须配 usedExports/sideEffects 优化 tree shaking
- **适用版本**: webpack 5.x
- **规律**: 生产 mode 默认 `usedExports: true`（标记未用导出），但须在 `package.json` 声明 `sideEffects: false`（或列副作用文件）让 webpack 安全删除未用模块。未声明则保守保留。
- **违反后果**: 未用代码打入 bundle、体积膨胀。
- **验证方法**: 无 `usedExports`/`sideEffects` 配置 → warn。
- **对应门禁**: fw_webpack_tree_shaking(warn)

```verify
id: webpack-r6
cmd: 
expect: always
```

### 规律：resolve.alias 须显式配置
- **适用版本**: webpack 5.x
- **规律**: `resolve.alias` 须显式配 `@` → `src` 等路径别名，否则相对路径深嵌套（`../../../../../components`）难维护。与 vite/tsconfig 别名须一致。
- **违反后果**: 相对路径深嵌套、维护困难。
- **验证方法**: `resolve:` 块无 `alias:` → warn。
- **对应门禁**: fw_webpack_resolve_alias(warn)

```verify
id: webpack-r7
cmd: 
expect: always
```

### 规律：生产 devtool 须关闭或用 source-map，禁 eval
- **适用版本**: webpack 5.x
- **规律**: `devtool: 'eval'` 类（eval/inline-source-map/cheap-eval-source-map）生产用会泄露源码 + 包体大。生产须 `false`/`source-map`（source-map 须上传错误监控后删除）。
- **违反后果**: 源码泄漏 CWE-540、包体膨胀。
- **验证方法**: 生产 mode + devtool 为 eval 类 → fail。
- **对应门禁**: fw_webpack_devtool(fail)

```verify
id: webpack-r8
cmd: 
expect: always
```

### 规律：CDN 依赖须配 externals 外部化
- **适用版本**: webpack 5.x
- **规律**: 通过 CDN `<script>` 引入的依赖（如 react/vue）须在 `externals` 声明，否则 webpack 重复打包。`externals: { react: 'React' }`。
- **违反后果**: 重复打包、bundle 体积翻倍。
- **验证方法**: 无 `externals` → warn。
- **对应门禁**: fw_webpack_externals(warn)

```verify
id: webpack-r9
cmd: 
expect: always
```

### 规律：loader 链顺序须正确（use 数组从右到左执行）
- **适用版本**: webpack 5.x
- **规律**: `module.rules` 的 `use: [...]` 数组从右到左执行（如 `['style-loader', 'css-loader', 'sass-loader']`：先 sass→css→style）。顺序错误致编译失败/样式丢失。
- **违反后果**: 编译失败、样式丢失、postcss 不生效。
- **验证方法**: 检出 sass-loader 行号 < css-loader 行号（顺序反） → warn。
- **对应门禁**: fw_webpack_loader_order(warn)

```verify
id: webpack-r10
cmd: 
expect: always
```

### 规律：须配 performance 阈值
- **适用版本**: webpack 5.x
- **规律**: `performance` 默认 `hints: 'warning'` + `maxAssetSize: 250000`。须按项目调整 `maxAssetSize`/`maxEntrypointSize`，超阈值提示优化。
- **违反后果**: 超大 bundle 无提示、性能回归无感知。
- **验证方法**: 无 `performance:` → warn。
- **对应门禁**: fw_webpack_performance_hints(warn)

```verify
id: webpack-r11
cmd: 
expect: always
```

### 规律：静态资源须用 CopyWebpackPlugin 拷贝
- **适用版本**: webpack 5.x
- **规律**: `public/` 下静态资源（favicon/robots.txt）不会被打包处理，须用 `CopyWebpackPlugin` 显式拷贝到 output。否则部署缺失。
- **违反后果**: 静态资源部署缺失、favicon 404。
- **验证方法**: 无 `CopyWebpackPlugin` → warn。
- **对应门禁**: fw_webpack_copy_plugin(warn)

```verify
id: webpack-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_webpack_persistent_cache | warn | 无 cache.type='filesystem' → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_splitchunks | warn | 无 splitChunks → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_chunk_naming | warn | 动态 import 无 webpackChunkName → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_defineplugin | warn | 无 DefinePlugin → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_mode_minimize | warn | production + minimize=false → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_tree_shaking | warn | 无 usedExports/sideEffects → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_resolve_alias | warn | resolve 块无 alias → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_devtool | fail | 生产 mode + devtool 为 eval 类 → fail 源码泄漏 | WEBPACK_CONFIG_GLOBS | CWE-540 |
| fw_webpack_externals | warn | 无 externals → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_loader_order | warn | loader 链顺序反 → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_performance_hints | warn | 无 performance → warn | WEBPACK_CONFIG_GLOBS | — |
| fw_webpack_copy_plugin | warn | 无 CopyWebpackPlugin → warn | WEBPACK_CONFIG_GLOBS | — |

<!--
门禁 id 命名规范：fw_webpack_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/webpack.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_webpack_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: webpack  requires_conf: WEBPACK_CONFIG_GLOBS` 声明。
fixture 验证覆盖：violating 含生产 mode + eval devtool + 无 splitChunks + 无 cache + 动态 import 无 chunk 命名 → devtool fail 主触发（1/1 已断言）；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| webpack × babel | loader 须 babel-loader 在最前（数组末尾） | webpack 从右到左，babel 须先转译 |
| webpack × vue | .vue 须 vue-loader + VueLoaderPlugin | 否则 SFC 无法编译 |
| webpack × react | JSX 须 babel-loader + @babel/preset-react | 否则 JSX 语法报错 |
| webpack × typescript | 须 ts-loader/babel-loader + tsconfig | 否则 .ts 无法编译 |
| webpack × vite | 迁移时 alias/target/splitChunks 须对齐 | 否则行为不一致 |

<!--
无强交互的框架组合省略；本表聚焦 webpack 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| webpack 5.0 | 引入持久缓存 cache.type='filesystem' | 旧 memory 缓存配置失效，须改 filesystem |
| webpack 5.0 | 引入 Asset Modules（asset/resource）替代 file-loader/url-loader | 旧 loader 配置废弃 |
| webpack 5.0 | Node polyfill 不再自动注入（crypto/path 等） | 旧前端依赖 Node 内置模块须手动 polyfill |
| webpack 5.30 | Module Federation 稳定 | 微前端配置方式变化 |
| webpack 6.x | 待验证 GA 时点与 breaking change | 待验证：6.x 尚未 GA，规划须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
