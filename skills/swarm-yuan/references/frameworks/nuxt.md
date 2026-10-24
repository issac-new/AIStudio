---
ruleset_id: nuxt
适用版本: Nuxt 4.x（现行稳定，待验证具体次版本号；差异单独标注）
最后调研: 2026-07-17（来源：https://nuxt.com/ ；https://nuxt.com/docs/api/composables/use-fetch ；https://nuxt.com/docs/guide/directory-structure/composables ；待验证：nuxt.com/blog 调研超时，次版本号未联网核实 ）
深度门槛: 10
---

# Nuxt 规则集

<!--
本规则集覆盖 Nuxt 4.x（截至 2026-07 现行 4.x，待验证具体次版本号——nuxt.com/blog 调研超时，次版本未联网核实，标待验证）。
调研时点：2026-07-17。Nuxt 4 基于 Vue 3.5+，srcDir 默认改为 `app/`（Nuxt 3 为根目录），auto-import 范围调整。
useFetch/useAsyncData 须显式/稳定 key 防缓存串；SSR 水合须一致；auto-import 须避命名冲突。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `nuxt` 包（package.json devDependencies）/ `#imports` / `@nuxt/` / `nuxt.config.ts` | 高 |
| 文件 | `nuxt.config.ts` / `app/app.vue` / `app/pages/**/*.vue` / `app/layouts/**/*.vue` / `app/middleware/**/*.ts` / `app/plugins/**/*.ts` / `app/composables/**/*.ts` | 高 |
| 代码 | `useFetch(` / `useAsyncData(` / `useState(` / `defineNuxtPlugin(` / `defineNuxtRouteMiddleware(` / `useSeoMeta(` | 高 |
| 配置 | `nuxt.config.ts` 的 `modules` / `runtimeConfig` / `app.head` / `nitro` | 高 |
| 目录 | `app/`（Nuxt 4 默认 srcDir）/ `server/`（nitro 服务端）/ `public/` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 nuxt 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 页面：`grep -rlE '<template' "${PROJECT_DIR}" --include='app/pages/**/*.vue'`（计数核验基准：app/pages 下 .vue 文件数）
- composable：`find "${PROJECT_DIR}" -path '*/composables/*.ts' -o -path '*/composables/*.js'`（计数核验基准：composables 文件数）
- 中间件：`find "${PROJECT_DIR}" -path '*/middleware/*.ts'`（计数核验基准：middleware 文件数）
- 插件：`find "${PROJECT_DIR}" -path '*/plugins/*.ts'`（计数核验基准：plugins 文件数）
- useFetch 调用：`grep -rnE 'useFetch\(' "${PROJECT_DIR}" --include='*.vue' --include='*.ts'`（计数核验基准：useFetch 调用行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：useFetch/useAsyncData 须显式稳定 key，禁依赖自动推导
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: `useFetch(url)` 默认用 url + 选项生成 key（序列化），但动态 url/复杂选项可能导致 key 冲突或串缓存（不同参数取到同一缓存）。生产须显式传 `key: 'unique-stable-key'`，key 须唯一且稳定（不随 render 变化）。`useAsyncData(fn)` 无 url 须必传 key，否则用文件名+行号推导（脆弱）。key 冲突会导致数据串（A 页取到 B 页数据）。
- **违反后果**: key 冲突/缺失 → 数据缓存串（不同请求取到错误数据）/ 重复请求 / 状态污染。
- **验证方法**: 检出 `useAsyncData(` 调用未含 `key:` 参数 → fail（无 url 须必传 key）；`useFetch(` 动态 url（含模板串/变量）未含 `key:` → warn。
- **对应门禁**: fw_nuxt_fetch_key(fail)

```verify
id: nuxt-r1
cmd: 
expect: always
```

### 规律：SSR 水合须一致，禁 render 阶段用 Date.now/随机/Math.random
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: SSR 渲染 HTML 与客户端 hydration 须一致，否则 hydration mismatch 警告/错误。render 阶段（setup 顶层同步）禁用 `Date.now()` / `Math.random()` / `uuid()` / `new Date()` 等每次调用返回不同值的 API（服务端渲染值 ≠ 客户端 hydration 值）。须在 `onMounted`（仅客户端）内调用，或用 `useState` 固定值。
- **违反后果**: hydration mismatch → Vue 警告 / DOM 重建 / 闪烁 / SEO 与实际不一致。
- **验证方法**: 检出 `Date.now()|Math.random()|crypto.randomUUID()` 出现在 `<script setup>` 顶层（非 onMounted 内）→ fail。
- **对应门禁**: fw_nuxt_hydration(fail)

```verify
id: nuxt-r2
cmd: 
expect: always
```

### 规律：useState 须带稳定 key，禁共享 key 串状态
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: `useState(key, init)` 跨组件共享响应式状态（SSR 友好）。key 须唯一稳定，多个 useState 共用 key 会互相覆盖（后注册覆盖前者）。init 函数仅在首次访问时执行（懒初始化）。全局状态优先 useState 而非模块级变量（模块级变量在 SSR 跨请求串）。
- **违反后果**: key 重复 → 状态互相覆盖 / 数据丢失；模块级变量 SSR 串请求。
- **验证方法**: 检出多个 `useState('same-key', …)` 同 key → fail；`useState(` 无 key 参数 → fail。
- **对应门禁**: fw_nuxt_usestate_key(fail)

```verify
id: nuxt-r3
cmd: 
expect: always
```

### 规律：auto-import 须避命名冲突，禁自定义 composable 与 Nuxt 内置同名
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: Nuxt 自动导入 `composables/` 与 `utils/` 下的导出，以及 `#imports` 内置（useFetch/useState/ref/reactive 等）。自定义 composable 须避免与内置同名（如自定义 `useState` 会覆盖内置，行为异常）。命名冲突时后导入覆盖，难排查。
- **违反后果**: 自定义 composable 覆盖内置 → 行为异常 / 难排查。
- **验证方法**: 检出 `composables/` 下导出函数名为 `useState|useFetch|useAsyncData|ref|reactive|computed|navigateTo|useRouter|useRoute` → fail。
- **对应门禁**: fw_nuxt_autoimport_conflict(fail)

```verify
id: nuxt-r4
cmd: 
expect: always
```

### 规律：插件须按顺序注册，禁跨插件依赖未声明 order
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: `plugins/` 下插件按文件名字母序加载（可加数字前缀如 `1.auth.ts`/`2.api.ts` 控制顺序）。插件间有依赖时（如 api 依赖 auth 注入的 token）须用数字前缀或 `dependsOn`（4.x）显式声明顺序。Nuxt 4 起 plugins 默认非 SSR 运行，须显式 `.server`/`.client` 后缀或 `mode` 选项控制环境。
- **违反后果**: 插件顺序错 → 依赖的注入未就绪 → 运行期 undefined 报错。
- **验证方法**: 人工确认有依赖的插件用数字前缀/dependsOn 声明顺序。
- **对应门禁**: 人工检查

```verify
id: nuxt-r5
cmd: 
expect: always
```

### 规律：中间件须区分全局/命名/路由，禁全局中间件做页面级逻辑
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: Nuxt 中间件三类：(1) 全局（`middleware/*.global.ts`，每次导航执行）/ (2) 命名（`middleware/auth.ts`，须在页面 `definePageMeta({ middleware: 'auth' })` 引用）/ (3) 内联（`definePageMeta({ middleware: [() => …] })`）。全局中间件性能开销大，须仅做全局鉴权/重定向，禁做页面级逻辑。命名中间件须被页面引用才生效。
- **违反后果**: 全局中间件做页面逻辑 → 每次导航开销 / 耦合页面；命名中间件未引用 → 不生效。
- **验证方法**: 检出 `*.global.ts` 中间件含页面级逻辑（特定路径判断过多）→ warn。
- **对应门禁**: fw_nuxt_middleware_scope(warn)

```verify
id: nuxt-r6
cmd: 
expect: always
```

### 规律：pages/ 自动路由须约定式命名，禁动态路由歧义
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: `app/pages/` 下文件自动生成路由：`pages/users/index.vue` → `/users`，`pages/users/[id].vue` → `/users/:id`，`pages/users/[...slug].vue` → catch-all。须遵循约定命名，动态参数用 `[param]`，catch-all 用 `[...slug]`。歧义命名（如 `[id].vue` 与 `[[id]].vue` 同目录）导致路由不确定。
- **违反后果**: 命名歧义 → 路由生成不确定 / 404。
- **验证方法**: 人工确认 pages/ 命名遵循约定，无歧义动态路由。
- **对应门禁**: 人工检查

```verify
id: nuxt-r7
cmd: 
expect: always
```

### 规律：components/ 自动导入须避重名，禁多目录同名组件
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: `app/components/` 下组件自动导入，按目录路径生成组件名（`components/user/Profile.vue` → `<UserProfile>`）。多个目录同名组件会冲突（后扫描覆盖）。嵌套目录组件名须唯一。`nuxt.config.ts` 的 `components` 选项可配 pathPrefix 关闭前缀。
- **违反后果**: 同名组件冲突 → 导入不确定 / 渲染错误组件。
- **验证方法**: 检出 components/ 下不同目录同名 .vue 文件 → warn。
- **对应门禁**: fw_nuxt_component_naming(warn)

```verify
id: nuxt-r8
cmd: 
expect: always
```

### 规律：composables/ 须导出函数（use 开头），禁导出常量/类
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: `app/composables/` 下文件自动导入其导出。约定导出函数（命名 `useXxx` 或任意函数），禁导出常量/类（auto-import 仅扫描函数式导出更清晰）。常量移入 `utils/`。每个 composable 一个文件或同文件多导出须命名清晰。
- **违反后果**: composables 导出常量 → 范式混乱 / auto-import 行为不确定。
- **验证方法**: 检出 `composables/` 下 `export const` / `export class` → warn。
- **对应门禁**: fw_nuxt_composable_export(warn)

```verify
id: nuxt-r9
cmd: 
expect: always
```

### 规律：nitro 服务端路由须在 server/ 下，禁 client 代码调服务端内部
- **适用版本**: Nuxt 3.x / 4.x（Nitro）
- **规律**: 服务端 API 须在 `server/api/` 下（文件路由自动生成端点），用 `defineEventHandler`。客户端通过 `$fetch`/`useFetch` 调用端点，禁直接 import server/ 内部模块（会泄露服务端代码到客户端 bundle）。`server/utils/` 仅服务端可用。
- **违反后果**: Client import server 内部 → 服务端代码泄露到客户端 / 包体增大 / 安全风险。
- **验证方法**: 检出 `app/` 下文件 import `~/server/` 或 `../../server/` → fail。
- **对应门禁**: fw_nuxt_server_boundary(fail)

```verify
id: nuxt-r10
cmd: 
expect: always
```

### 规律：useSeoMeta/useHead 须用于 SEO，禁手动操作 document.head
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: Nuxt 提供 `useSeoMeta({ title, description, ogImage, … })` / `useHead()` 声明 SEO 元数据，SSR 友好（服务端渲染 head）。禁在组件内手动 `document.head` / `document.title`（SSR 期 document 不存在 + hydration mismatch）。
- **违反后果**: 手动 document.head → SSR 报错 / hydration mismatch / SEO 元数据丢失。
- **验证方法**: 检出 `document.head|document.title` 在 .vue 组件中 → warn。
- **对应门禁**: fw_nuxt_seo_meta(warn)

```verify
id: nuxt-r11
cmd: 
expect: always
```

### 规律：错误页面须配 error.vue，禁让默认错误页暴露堆栈
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: Nuxt 根目录或 `app/error.vue` 作为错误页面（4xx/5xx/未捕获异常）。须配 error.vue 友好展示错误（生产隐藏堆栈），处理 `clearError` 跳转。无 error.vue 用默认错误页（开发模式暴露堆栈）。
- **违反后果**: 无 error.vue → 生产错误暴露默认页（不友好/泄露信息）。
- **验证方法**: 检出 Nuxt 项目无 `error.vue` → warn。
- **对应门禁**: fw_nuxt_error_page(warn)

```verify
id: nuxt-r12
cmd: 
expect: always
```

### 规律：runtimeConfig 敏感值须服务端 only，禁暴露到 client
- **适用版本**: Nuxt 3.x / 4.x
- **规律**: `nuxt.config.ts` 的 `runtimeConfig` 分 `runtimeConfig`（服务端 only，如 DB 密钥/API key）与 `runtimeConfig.public`（客户端可访问，如 public key）。敏感值（secret/token/password）须放 `runtimeConfig`（非 public），禁放 `public`（会打包进客户端 bundle 泄露）。
- **违反后果**: 敏感值放 public → 打包进客户端 bundle 泄露 CWE-312。
- **验证方法**: 检出 `runtimeConfig.public` 含 `secret|password|apiKey|privateKey` key → fail。
- **对应门禁**: fw_nuxt_runtime_config_secret(fail)

```verify
id: nuxt-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。10 条挂门禁（fw_nuxt_*），3 条标"人工检查"（语义/架构相关规律）。
每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / CWE·GB 元数据）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_nuxt_fetch_key | fail | useAsyncData 无 key 参数 → fail；useFetch 动态 url 无 key → warn | NUXT_SRC_GLOBS | — |
| fw_nuxt_hydration | fail | Date.now()/Math.random()/crypto.randomUUID() 出现在 setup 顶层 → fail hydration mismatch | NUXT_SRC_GLOBS | — |
| fw_nuxt_usestate_key | fail | useState 无 key 或多 useState 同 key → fail | NUXT_SRC_GLOBS | — |
| fw_nuxt_autoimport_conflict | fail | composables/ 导出与内置同名（useState/useFetch/ref 等）→ fail | NUXT_SRC_GLOBS | — |
| fw_nuxt_middleware_scope | warn | *.global.ts 中间件含页面级逻辑 → warn | NUXT_SRC_GLOBS | — |
| fw_nuxt_component_naming | warn | components/ 不同目录同名 .vue → warn | NUXT_SRC_GLOBS | — |
| fw_nuxt_composable_export | warn | composables/ 导出 const/class → warn | NUXT_SRC_GLOBS | — |
| fw_nuxt_server_boundary | fail | app/ 下文件 import ~/server/ → fail 服务端代码泄露 | NUXT_SRC_GLOBS | CWE-200（服务端代码泄露至客户端 bundle） |
| fw_nuxt_seo_meta | warn | 组件内 document.head/document.title → warn 须用 useSeoMeta/useHead | NUXT_SRC_GLOBS | — |
| fw_nuxt_error_page | warn | Nuxt 项目无 error.vue → warn | NUXT_SRC_GLOBS | CWE-209（错误信息含敏感细节：缺 error.vue 可能泄露堆栈） |
| fw_nuxt_runtime_config_secret | fail | runtimeConfig.public 含 secret/password/apiKey/privateKey → fail 泄露 | NUXT_SRC_GLOBS | CWE-312（敏感信息明文存储/打包，门禁文案已引） |

<!--
门禁 id 命名规范：fw_nuxt_<rule>（rule 全小写下划线）。
本表 11 条 id 须在 assets/framework-gates/nuxt.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_nuxt_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: nuxt  requires_conf: NUXT_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 6/6 fail 全触发（fetch_key / hydration / usestate_key / autoimport_conflict / server_boundary / runtime_config_secret）；后四项 2026-07-20 P1 新增样本实例化唤醒（index.vue 追加 + composables/useFetch.ts + nuxt.config.ts），门禁判定逻辑未动。expected-fail-ids 已登记 6/6 fail id。CWE/GB 映射列（同批补录）：仅对具直接安全语义的行引证，其余标 —。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| nuxt × vue | Nuxt 4 基于 Vue 3.5+，SFC 须遵循 Vue `<script setup>` 规范 | Vue 规则集叠加生效 |
| nuxt × pinia | 状态管理优先 useState（SSR 友好），复杂场景用 @pinia/nuxt 模块 | Pinia 须 SSR 友好注册 |
| nuxt × vue-router | 路由由 pages/ 自动生成，禁手动配 router | 手动配与自动路由冲突 |
| nuxt × nitro | 服务端代码须在 server/，客户端禁直接 import | 否则泄露服务端代码 |

<!--
无强交互的框架组合省略；本表聚焦 nuxt 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Nuxt 3 | srcDir 为根目录 / auto-import 根目录 | 约定式目录在根 |
| Nuxt 4 | srcDir 默认改为 `app/` / auto-import 范围调整 / data fetching 改进 | 3→4 迁移须移动文件到 app/；auto-import 路径变化 |
| Nuxt 4.x（待验证次版本） | 待验证：4.x 具体次版本行为差异 | 待验证：nuxt.com/blog 调研超时，次版本号未联网核实 |
| useFetch key 推导 | 动态 url + 复杂选项 key 推导脆弱 | 生产须显式 key 防串缓存 |
| hydration | Vue 3.5+ 改进 hydration mismatch 提示 | 仍须遵守 SSR 一致性规律 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
4.x 次版本号待验证（调研超时），规律按"Nuxt 4.x"陈述。
-->
