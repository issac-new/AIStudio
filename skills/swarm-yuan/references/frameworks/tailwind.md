---
ruleset_id: tailwind
适用版本: Tailwind CSS 4.x（4.x 现行 CSS-first 配置）/ 3.x（差异单独标注）
最后调研: 2026-07-17（来源：https://tailwindcss.com/ ；https://tailwindcss.com/docs/configuration ；https://tailwindcss.com/docs/content-configuration ；https://tailwindcss.com/docs/dark-mode ；https://tailwindcss.com/docs/hover-focus-and-other-states ）
深度门槛: 10
---

# Tailwind CSS 规则集

<!--
本规则集覆盖 Tailwind CSS 4.x（CSS-first 配置，@theme 替代 tailwind.config.js）与 3.x（JS 配置，差异单独标注）。调研时点：2026-07-17。
Tailwind 4.x 推荐 @tailwindcss/vite / @tailwindcss/postcss 插件，配置迁移至 CSS @theme。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `tailwindcss` 包（package.json devDependencies）/ `@tailwindcss/vite` / `@tailwindcss/postcss` | 高 |
| 文件 | `tailwind.config.{js,ts,cjs,mjs}` / `postcss.config.*` 含 `tailwindcss` / `app.css` 含 `@import "tailwindcss"` | 高 |
| 代码 | `class="[^"]*\b(flex|grid|p-[0-9]|text-[a-z]+|bg-[a-z]+)` / `@apply` / `@theme` | 高 |
| 配置 | `content:` / `theme.extend` / `darkMode:` / `@source` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 tailwind 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 配置文件：`find "${PROJECT_DIR}" -maxdepth 3 \( -name 'tailwind.config.*' -o -name 'postcss.config.*' \) -not -path '*/node_modules/*'`（计数核验基准：配置文件数）
- utility 类使用：`grep -rlE 'class="[^"]*(flex|grid|p-|m-|text-)' "${PROJECT_DIR}" --include='*.vue' --include='*.tsx' --include='*.html'`（计数核验基准：使用 utility 类的文件数）
- @apply 调用：`grep -rnE '@apply' "${PROJECT_DIR}" --include='*.css' --include='*.scss'`（计数核验基准：@apply 行数）
- 任意值使用：`grep -rnE '\[[a-zA-Z0-9_#-]+:[^\]]+\]' "${PROJECT_DIR}" --include='*.vue' --include='*.tsx'`（计数核验基准：任意值使用次数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：content 扫描路径须完整
- **适用版本**: Tailwind 3.x/4.x
- **规律**: `content` 须覆盖所有使用 utility 类的文件（.vue/.tsx/.html/.ts），漏扫致 JIT 不生成对应类样式（运行期样式丢失）。须用 `**/*.{vue,tsx,ts,html}` 通配。4.x 用 `@source` 声明。
- **违反后果**: 漏扫文件样式丢失、生产环境白屏。
- **验证方法**: 无 `content`/`@source` → fail；content 无 `**` 通配 → fail。
- **对应门禁**: fw_tailwind_content_scan(fail)

```verify
id: tailwind-r1
cmd: 
expect: always
```

### 规律：4.x 须用 @theme CSS-first 配置
- **适用版本**: Tailwind 4.x
- **规律**: 4.x 推荐 `@theme { --color-brand: #...; }` CSS-first 配置替代 `tailwind.config.js`。混用（@import tailwindcss + 旧 config.js 无 @theme）会导致配置碎片化。
- **违反后果**: 配置碎片化、4.x 特性未利用。
- **验证方法**: 4.x @import 但仍用 config.js 无 @theme → warn。
- **对应门禁**: fw_tailwind_css_first_config(warn)

```verify
id: tailwind-r2
cmd: 
expect: always
```

### 规律：任意值不可过度滥用
- **适用版本**: Tailwind 3.x/4.x
- **规律**: 任意值 `[padding:13px]` 用于一次性特殊值合理，但单文件 >5 处任意值说明应抽自定义 CSS 或 `@apply` 组件类。滥用降低可读性 + 无法统一调整。
- **违反后果**: 模板臃肿、可读性差、无法统一调整。
- **验证方法**: 单文件任意值 ≥5 处 → warn。
- **对应门禁**: fw_tailwind_arbitrary_abuse(warn)

```verify
id: tailwind-r3
cmd: 
expect: always
```

### 规律：与组件库混用须配 prefix 隔离
- **适用版本**: Tailwind 3.x/4.x
- **规律**: 与 element/antd/naiveui 混用时，tailwind Preflight 会重置组件库默认样式（如 button 背景被清空）。须配 `prefix: 'tw-'` 或 `@layer` 隔离，或关闭 Preflight。
- **违反后果**: 组件库样式被重置、button/input 背景丢失。
- **验证方法**: 与组件库混用但无 prefix → warn。
- **对应门禁**: fw_tailwind_prefix_isolate(warn)

```verify
id: tailwind-r4
cmd: 
expect: always
```

### 规律：暗色模式须显式配置 darkMode 策略
- **适用版本**: Tailwind 3.x/4.x
- **规律**: `darkMode` 默认 `media`（跟随系统），须按项目声明 `class`（手动切换）或 `selector`。4.x 用 `@custom-variant dark`。未声明则暗色切换不可控。
- **违反后果**: 暗色切换不可控、与组件库 darkTheme 不一致。
- **验证方法**: 无 `darkMode:`/`@custom-variant dark` → warn。
- **对应门禁**: fw_tailwind_dark_mode(warn)

```verify
id: tailwind-r5
cmd: 
expect: always
```

### 规律：group-hover 须配父级 group 类
- **适用版本**: Tailwind 3.x/4.x
- **规律**: `group-hover:` 须父级元素标 `group` 类才生效。漏标 group 则 group-hover 失效。
- **违反后果**: group-hover 不生效、交互缺失。
- **验证方法**: 检出 `group-hover:` → warn 提示须父级 group。
- **对应门禁**: fw_tailwind_group_hover(warn)

```verify
id: tailwind-r6
cmd: 
expect: always
```

### 规律：重复类组合须用 @apply 抽组件类
- **适用版本**: Tailwind 3.x/4.x
- **规律**: 重复的类组合（如 `flex items-center justify-between`）应抽 `@apply` 组件类（`.btn { @apply flex items-center; }`），避免模板臃肿 + 统一调整。
- **违反后果**: 模板臃肿、类组合重复、难统一调整。
- **验证方法**: 无 `@apply` → warn。
- **对应门禁**: fw_tailwind_apply_reuse(warn)

```verify
id: tailwind-r7
cmd: 
expect: always
```

### 规律：PostCSS 插件顺序须 tailwindcss 在前
- **适用版本**: Tailwind 3.x（PostCSS 方案）
- **规律**: `postcss.config` 插件按数组顺序执行，`tailwindcss` 须在 `autoprefixer` 之前（tailwind 生成 utility 后 autoprefixer 加前缀）。顺序反致前缀丢失。
- **违反后果**: 浏览器前缀丢失、兼容性回退。
- **验证方法**: autoprefixer 行号 < tailwindcss 行号 → warn。
- **对应门禁**: fw_tailwind_postcss_order(warn)

```verify
id: tailwind-r8
cmd: 
expect: always
```

### 规律：Preflight 与组件库冲突须按需关闭
- **适用版本**: Tailwind 3.x/4.x
- **规律**: Preflight（base reset）重置默认样式（margin/padding/button 背景），与组件库混用会覆盖组件库默认。须 `corePlugins: { preflight: false }` 或 4.x `@layer` 隔离。
- **违反后果**: 组件库默认样式被重置、button 背景丢失。
- **验证方法**: 与组件库混用但未关 preflight → warn。
- **对应门禁**: fw_tailwind_preflight_conflict(warn)

```verify
id: tailwind-r9
cmd: 
expect: always
```

### 规律：自定义颜色须用 theme 配置，禁任意值硬编码
- **适用版本**: Tailwind 3.x/4.x
- **规律**: 品牌色等自定义颜色须在 `theme.colors`（3.x）或 `@theme { --color-* }`（4.x）声明，生成 `bg-brand` 等 utility。硬编码任意值 `bg-[#1890ff]` 无法统一调整。
- **违反后果**: 颜色硬编码、无法统一换肤。
- **验证方法**: 无 `colors:`/`@theme ... color` → warn。
- **对应门禁**: fw_tailwind_custom_color(warn)

```verify
id: tailwind-r10
cmd: 
expect: always
```

### 规律：响应式须用断点前缀，禁手写 @media
- **适用版本**: Tailwind 3.x/4.x
- **规律**: 响应式布局须用 `sm:/md:/lg:/xl:` 断点前缀，统一断点配置。手写 `@media (max-width: ...)` 绕过 tailwind 断点系统，断点不一致。
- **违反后果**: 断点不一致、响应式错位。
- **验证方法**: 手写 `@media`（非 prefers-color）→ warn。
- **对应门禁**: fw_tailwind_responsive_prefix(warn)

```verify
id: tailwind-r11
cmd: 
expect: always
```

### 规律：生产构建须 minify
- **适用版本**: Tailwind 3.x/4.x
- **规律**: Tailwind 生产默认 minify CSS，显式 `minify: false` 致 CSS 体积过大。生产必须开启。
- **违反后果**: CSS 未压缩、体积膨胀。
- **验证方法**: `minify: false` → warn。
- **对应门禁**: fw_tailwind_prod_minify(warn)

```verify
id: tailwind-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / CWE·GB 元数据）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_tailwind_content_scan | fail | 无 content/@source 或无 ** 通配 → fail 样式丢失 | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_css_first_config | warn | 4.x @import 但仍用 config.js 无 @theme → warn | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_arbitrary_abuse | warn | 单文件任意值 ≥5 处 → warn 滥用 | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_prefix_isolate | warn | 与组件库混用无 prefix → warn 冲突 | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_dark_mode | warn | 无 darkMode 配置 → warn | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_group_hover | warn | group-hover: 须父级 group → warn 提示 | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_apply_reuse | warn | 无 @apply 抽组件类 → warn | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_postcss_order | warn | PostCSS 顺序错 → warn 前缀丢失 | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_preflight_conflict | warn | 组件库混用未关 preflight → warn | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_custom_color | warn | 无 theme 自定义颜色 → warn | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_responsive_prefix | warn | 手写 @media → warn | TAILWIND_CONFIG_GLOBS | — |
| fw_tailwind_prod_minify | warn | minify 关闭 → warn | TAILWIND_CONFIG_GLOBS | — |

<!--
门禁 id 命名规范：fw_tailwind_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/tailwind.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_tailwind_<rule>(fail/warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: tailwind  requires_conf: TAILWIND_CONFIG_GLOBS` 声明。
fixture 验证覆盖：violating 含 content 漏扫 + 大量任意值 + 无 prefix 与组件库冲突 → content_scan fail 主触发（1/1）；compliant 全 pass。expected-fail-ids 已登记 1/1 fail id（2026-07-20 P1）。CWE/GB 映射列（同批补录）：本框架门禁均为工程规范/性能类，无直接安全语义，全行标 —。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| tailwind × element/antd/naiveui | 须用 prefix 或关闭 preflight | tailwind preflight 重置组件库默认样式 |
| tailwind × vite | 4.x 须用 @tailwindcss/vite 插件 | 4.x 推荐原生 Vite 插件，PostCSS 为旧方案 |
| tailwind × postcss | tailwindcss 须在 autoprefixer 之前 | 否则浏览器前缀丢失 |
| tailwind × webpack | 须 postcss-loader + tailwindcss | 否则 utility 类不被处理 |

<!--
无强交互的框架组合省略；本表聚焦 tailwind 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Tailwind 3.0 | JIT 模式默认（content 扫描） | 旧 purge 配置废弃，须改 content |
| Tailwind 3.3 | darkMode: 'selector' 引入 | class 策略推荐改 selector |
| Tailwind 4.0 | CSS-first 配置（@theme 替代 config.js） | 旧 JS 配置迁移至 @theme |
| Tailwind 4.0 | @tailwindcss/vite / @tailwindcss/postcss 插件 | 旧 postcss tailwindcss 插件废弃 |
| Tailwind 4.0 | content 改 @source 声明（待验证自动扫描范围） | 待验证：4.x 自动扫描是否覆盖全部文件须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
