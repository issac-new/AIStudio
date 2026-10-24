---
ruleset_id: vue
适用版本: Vue 3.5.x（现行稳定）/ 3.6.x（Vapor Mode RC，待验证 GA 时点；差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/vuejs/core/releases ；https://vuejs.org/guide/extras/reactivity-in-depth.html ；https://vuejs.org/api/sfc-script-setup.html ；https://vuejs.org/guide/built-ins/teleport.html ）
深度门槛: 15
---

# Vue 规则集

<!--
本规则集覆盖 Vue 3.5.x（现行稳定，截至 2026-07 为 3.5.40）与 3.6.x（Vapor Mode RC 阶段，待验证 GA 时点）。
调研时点：2026-07-17。Vapor Mode 在 3.6 进入 RC，官方仅建议"全新小应用整体启用 / 既有应用局部启用"，未默认启用——本规则集规律按"默认非 Vapor 编译"陈述，Vapor 专属差异标"待验证"。
无法确认的版本点已标"待验证"，不臆造。

§4 门禁清单的 5 条 id 与现有 assets/framework-gates/vue.sh 的 `# gates:` 头注释严格一致
（fw_vue_script_setup / fw_vue_no_options_api / fw_vue_vhtml_sanitize / fw_vue_vfor_index_key / fw_vue_reactivity_threshold）。
其余规律（ref/reactive 解构、Teleport/Suspense、shallowRef 大对象、defineProps/defineEmits、生命周期、computed/watch、provide/inject、nextTick 等）
按"人工检查"陈述——这些属于语义/上下文相关规律，难以机械 grep 精确判定，故不新增门禁，避免与现有 vue.sh 头注释漂移。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `vue` 包（package.json dependencies） / `@vue/runtime-dom` / `@vue/compiler-sfc` / `vue-router` / `pinia` | 高 |
| 文件 | `**/*.vue`（SFC 单文件组件） / `vite.config.ts` 含 `@vitejs/plugin-vue` | 高 |
| 代码 | `<script setup>` / `defineProps(` / `defineEmits(` / `ref(` / `reactive(` / `computed(` / `useRouter()` | 高 |
| 模板 | `v-html` / `v-for` / `v-model` / `<Teleport>` / `<Suspense>` / `<slot>` | 中（须组合 .vue 文件信号） |
| 配置 | `vue.config.js`（Vue CLI） / `vite.config.*` 的 `@vitejs/plugin-vue` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 vue 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- SFC 单文件组件：`grep -rlE '<script' "${PROJECT_DIR}" --include='*.vue'`（计数核验基准：含 `<script>` 的 .vue 文件数）
- `<script setup>` SFC：`grep -rlE '<script setup' "${PROJECT_DIR}" --include='*.vue'`（计数核验基准：setup 写法 SFC 数）
- v-html 使用点：`grep -rnE 'v-html' "${PROJECT_DIR}" --include='*.vue'`（计数核验基准：v-html 行数）
- v-for 使用点：`grep -rnE 'v-for' "${PROJECT_DIR}" --include='*.vue'`（计数核验基准：v-for 行数）
- 响应式 API 调用：`grep -rhoE '\b(ref|reactive|computed|shallowRef|shallowReactive)\b' "${PROJECT_DIR}" --include='*.vue'`（计数核验基准：响应式 API 调用次数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：SFC 须用 `<script setup>` 而非 Options API + `<script>`
- **适用版本**: Vue 3.x（`<script setup>` 3.2+ 稳定）
- **规律**: `<script setup>` 是 Vue 3 推荐的组件编写范式，编译产物更优（变量直接暴露模板、无需 this）、TypeScript 友好、tree-shaking 友好。Options API（`export default { data, methods }`）仅在迁移遗留组件时保留。新组件强制 `<script setup>`，禁混合 Options API。
- **违反后果**: Options API 代码冗长、`this` 指向陷阱、编译优化弱；团队范式不统一增加维护成本。
- **验证方法**: 统计含 `<script` 的 SFC 总数与含 `<script setup` 的 SFC 数，二者不等 → fail。
- **对应门禁**: fw_vue_script_setup(fail)

```verify
id: vue-r1
cmd: 
expect: always
```

### 规律：禁止混用 Options API（data/methods/computed 选项式）
- **适用版本**: Vue 3.x
- **规律**: 项目约定 Composition API 后，残留 `export default { data() {…}, methods: {…}, computed: {…} }` 选项式写法会破坏范式一致性。Options API 与 `<script setup>` 混用导致响应式来源分散（一部分 ref、一部分 data 返回值），难以追踪。
- **违反后果**: 范式分裂、响应式来源分散、重构成本高。
- **验证方法**: `grep -rnE 'export default \{[^}]*data\(|methods:[[:space:]]*\{|computed:[[:space:]]*\{' --include='*.vue'` 命中 → fail。
- **对应门禁**: fw_vue_no_options_api(fail)

```verify
id: vue-r2
cmd: grep -rnE 'export default \{[^}]*data\(|methods:[[:space:]]*\{|computed:[[:space:]]*\{' --include='*.vue' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：v-html 须配套 sanitize，禁止渲染未净化 HTML
- **适用版本**: Vue 3.x
- **规律**: `v-html` 直接将字符串作为 innerHTML 渲染，绕过 Vue 的模板转义。若该字符串来源含用户输入（评论、富文本编辑器内容、第三方接口返回），须先经 sanitize（DOMPurify / sanitize-html）过滤。同文件内检出 `v-html` 须同时检出 sanitize 调用（如 `DOMPurify.sanitize`）。
- **违反后果**: XSS 跨站脚本攻击 CWE-79——攻击者注入 `<img onerror=...>` / `<script>` 窃取 cookie 或劫持会话。
- **验证方法**: 检出 `v-html` 的 SFC 文件中未检出 sanitize 模式（DOMPurify / sanitize-html / xss 库）→ fail。
- **对应门禁**: fw_vue_vhtml_sanitize(fail)

```verify
id: vue-r3
cmd: 
expect: always
```

### 规律：v-for 须用稳定唯一 key，禁止用数组 index 作 key
- **适用版本**: Vue 3.x
- **规律**: `v-for` 的 `:key` 用于 Vue 的 keyed reconciliation，须是数据项的唯一稳定标识（如 `item.id`）。用数组 `index` 作 key 时，列表增删/排序会导致 key 与数据项错位，Vue 复用错误的 DOM 节点，引发输入框错位、组件状态串台、过渡动画错乱。仅在"列表纯展示且永不增删排序"的稳定数组场景可接受。
- **违反后果**: 列表变更后 DOM 复用错位 → 表单输入串台 / 组件内部状态错乱 / 过渡动画异常。
- **验证方法**: `grep -rnE 'v-for.*:key="(index|i)"|v-for.*:key="\$index"' --include='*.vue'` 命中 → warn（稳定数组可接受，须人工确认）。
- **对应门禁**: fw_vue_vfor_index_key(warn)

```verify
id: vue-r4
cmd: grep -rnE 'v-for.*:key="(index|i)"|v-for.*:key="\$index"' --include='*.vue' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：reactive 对象用量须收敛，优先 ref/computed
- **适用版本**: Vue 3.x
- **规律**: `reactive()` 仅对对象/数组生效（原始类型须用 `ref`），且对其解构会丢失响应式（须配 `toRefs`）。大量散落 `reactive` 调用增加心智负担，优先用 `ref`（统一 `.value` 访问）+ `computed` 派生。`reactive` 适合"一组相关状态聚合为一个对象"的 composable 内部状态。
- **违反后果**: reactive 散落 → 解构丢响应式 bug 频发、ref/reactive 选型混乱、可读性下降。
- **验证方法**: 统计 `reactive` 调用次数，超过阈值（默认配置）→ warn 建议收敛。
- **对应门禁**: fw_vue_reactivity_threshold(warn)

```verify
id: vue-r5
cmd: 
expect: always
```

### 规律：reactive 对象禁止直接解构，须用 toRefs/toRef 保持响应式
- **适用版本**: Vue 3.x
- **规律**: `reactive()` 返回的 Proxy 对象，对其属性解构（`const { count } = state`）得到的是原始值快照，丢失响应式。须用 `toRefs(state)` 整体转换或 `toRef(state, 'count')` 单属性转换后再解构。`ref` 不存在此问题（解构得到的是 Ref 对象本身）。
- **违反后果**: 解构后的变量不响应原始 state 变更 → UI 不更新、状态不同步。
- **验证方法**: 检出 `const \{ [a-zA-Z_]+ \} = <reactive变量>` 解构模式而无 `toRefs` 包裹 → 人工确认（语义相关，机械 grep 易误报）。
- **对应门禁**: 人工检查

```verify
id: vue-r6
cmd: 
expect: always
```

### 规律：大对象状态须用 shallowRef/shallowReactive 避免深层代理开销
- **适用版本**: Vue 3.x
- **规律**: `ref`/`reactive` 对嵌套对象递归代理（深响应式），对大型树状数据（如表格全量行、图形节点树、Monaco editor model）会创建大量 Proxy，性能损耗显著。此类大对象只关心引用变更（整体替换），用 `shallowRef` / `shallowReactive` 只代理第一层，深层访问不响应。
- **违反后果**: 大对象深代理 → 初始化卡顿、内存占用高、更新性能差。
- **验证方法**: 检出 `ref(` / `reactive(` 持有大对象（如 >1000 项数组、树结构）→ 人工确认是否应改 shallowRef。
- **对应门禁**: 人工检查

```verify
id: vue-r7
cmd: 
expect: always
```

### 规律：defineProps/defineEmits 须显式类型声明，禁运行时声明 + 必填校验
- **适用版本**: Vue 3.x（`<script setup>` 宏）
- **规律**: `<script setup>` 中 `defineProps` 支持运行时声明（`{ type: String, required: true }`）与基于类型的声明（`defineProps<{ title: string; count?: number }>()`）。TypeScript 项目须用类型声明，结合 `withDefaults` 设默认值。必填 prop 须标 required 或类型中非可选。
- **违反后果**: prop 类型缺失 → 运行期 NaN/undefined 静默传播、IDE 提示丢失、重构易错。
- **验证方法**: `defineProps(` 调用未含类型参数（`<…>`）或对象字面量无 `type`/`required` → 人工确认。
- **对应门禁**: 人工检查

```verify
id: vue-r8
cmd: 
expect: always
```

### 规律：生命周期钩子须在 setup 同步注册，禁异步回调中注册
- **适用版本**: Vue 3.x
- **规律**: `onMounted` / `onUnmounted` 等生命周期钩子依赖当前组件实例（`getCurrentInstance`），须在 `setup()` / `<script setup>` 顶层同步调用注册。在 `setTimeout` / `await` 之后的异步回调中调用 `onMounted` 会因实例已失联而静默失效（开发模式 warn）。
- **违反后果**: 异步注册的钩子不触发 → 清理逻辑遗漏 → 内存泄漏 / 事件监听残留。
- **验证方法**: 检出 `onMounted|onUnmounted|onBeforeUnmount` 出现在 `.then(` / `setTimeout` / `await` 之后的回调内 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: vue-r9
cmd: 
expect: always
```

### 规律：computed 须为纯函数无副作用，禁在 computed 内 mutate 状态
- **适用版本**: Vue 3.x
- **规律**: `computed` 是惰性求值 + 缓存的派生状态，须为纯函数（只读依赖、返回新值）。在 computed 内修改其他 ref/reactive（副作用）会破坏缓存语义、触发循环更新警告。需要副作用的场景用 `watch`/`watchEffect`。
- **违反后果**: computed 含副作用 → 缓存失效、循环更新警告、依赖追踪错乱。
- **验证方法**: 检出 `computed(` 回调体内含赋值（`xxx.value =` / `state.xxx =`）→ 人工确认。
- **对应门禁**: 人工检查

```verify
id: vue-r10
cmd: 
expect: always
```

### 规律：watch 依赖须完整声明，禁用懒推断导致的漏依赖
- **适用版本**: Vue 3.x
- **规律**: `watch(source, cb)` 的 source 须显式声明依赖。侦听 `reactive` 对象属性时 `watch(() => state.count, cb)` 须用 getter 形式；侦听多个源用数组 `watch([a, b], cb)`。`watchEffect` 自动追踪依赖但无法访问新旧值。漏依赖会导致 cb 不在该依赖变更时触发。
- **违反后果**: 漏依赖 → 状态变更不触发 watcher → UI/逻辑不同步。
- **验证方法**: 检出 `watch(` 的 source 参数形式（getter / ref / 数组）→ 人工确认覆盖了所有应侦听的依赖。
- **对应门禁**: 人工检查

```verify
id: vue-r11
cmd: 
expect: always
```

### 规律：provide/inject 须带类型与默认值，禁裸 inject 任意值
- **适用版本**: Vue 3.x
- **规律**: `provide(key, value)` / `inject(key, default)` 跨组件传值。须用 InjectionKey（带类型）作 key 保证类型安全，`inject` 须提供默认值或显式标注可空，避免消费者在未 provider 时拿到 undefined。全局状态优先用 Pinia。
- **违反后果**: 裸 inject → 类型丢失、未 provider 时 undefined 运行期错误、key 字符串拼写错误难发现。
- **验证方法**: 检出 `inject(` 未带第二个参数（默认值）且未配合 InjectionKey → 人工确认。
- **对应门禁**: 人工检查

```verify
id: vue-r12
cmd: 
expect: always
```

### 规律：Teleport 须指定目标且目标须在挂载时存在
- **适用版本**: Vue 3.x（`<Teleport>`）
- **规律**: `<Teleport to="…">` 将子节点渲染到 DOM 树另一处（常用于弹窗/通知挂到 body）。`to` 须为有效 CSS 选择器且目标元素在 Teleport 挂载时已存在（SSR 须注意 hydration）。`:disabled` 可条件关闭 teleport。
- **违反后果**: 目标不存在 → 运行期报错 / 内容丢失；SSR hydration mismatch。
- **验证方法**: 检出 `<Teleport` 的 `to=` 目标 → 人工确认目标元素在挂载时存在。
- **对应门禁**: 人工检查

```verify
id: vue-r13
cmd: 
expect: always
```

### 规律：DOM 更新后操作须包 nextTick，禁同步访问更新后 DOM
- **适用版本**: Vue 3.x
- **规律**: Vue 异步更新 DOM（批量刷新），状态变更后立即访问 DOM 拿到的是旧值。须 `await nextTick()` 或 `nextTick(() => …)` 后再读/操作 DOM（如聚焦输入框、测量尺寸、滚动定位）。
- **违反后果**: 同步访问拿到旧 DOM → 测量错误 / 聚焦失败 / 滚动位置错。
- **验证方法**: 检出状态变更后紧接 DOM 操作（`querySelector` / `focus()` / `scrollTop`）而无 `nextTick` 包裹 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: vue-r14
cmd: 
expect: always
```

### 规律：组件命名须多词 PascalCase，禁与 HTML 元素冲突
- **适用版本**: Vue 3.x
- **规律**: 组件名须多词（PascalCase，如 `UserProfile`、`OrderItem`）避免与原生 HTML 元素冲突（单词名如 `header`/`main` 会被解析为原生标签）。`<script setup>` 中组件名由文件名/导入名推导，须保持 PascalCase 文件命名。
- **违反后果**: 单词组件名被解析为原生 HTML 元素 → 组件不渲染且无报错（静默失败）。
- **验证方法**: 检出 .vue 文件名为单词（如 `Header.vue`、`Button.vue`）→ 人工确认是否与原生元素冲突。
- **对应门禁**: 人工检查

```verify
id: vue-r15
cmd: 
expect: always
```

### 规律：Pinia store 须用 defineStore 定义，禁散落 mutation
- **适用版本**: Pinia 2.x / 3.x（随 vue 合并管理，原 pinia 规则集已并入）
- **规律**: Pinia store 须用 `defineStore('id', { state, getters, actions })` 或 setup 风格 `defineStore('id', () => { … })` 集中定义，state 须函数返回对象（避免跨实例共享引用）。散落 mutation（直接改 store.xxx = ...）在 setup store 风格下虽允许，但组合式 API 须用 action 包裹以保持可追踪性与 devtools 支持。
- **违反后果**: 缺 defineStore → 状态无响应式追踪 / devtools 不可见；散落 mutation → 难以审计状态变更来源。
- **验证方法**: `grep -rlE 'defineStore' "${VUE_PINIA_FILE_GLOBS[@]+"${VUE_PINIA_FILE_GLOBS[@]}"}"` 计数；启用 `VUE_PINIA_DEFINESTORE_REQUIRED=1` 时 defineStore 文件数 = 0 → warn（疑似未用 Pinia 或漏定义）。
- **对应门禁**: fw_vue_pinia_definestore(warn)

```verify
id: vue-r16
cmd: grep -rlE 'defineStore' "${VUE_PINIA_FILE_GLOBS[@]+"${VUE_PINIA_FILE_GLOBS[@]}"}"
expect: hits>0
```

### 规律：聚合层 store 须存在且只读消费，禁跨 store 直接写
- **适用版本**: Pinia 2.x / 3.x
- **规律**: 多 store 项目须设聚合层 store（如 `useGlobalStore` / `useRootStore`）统一编排跨域状态，子 store 须通过 action 调用聚合层而非直接写其他 store 的 state。聚合层 store 文件须实际存在（非占位）。
- **违反后果**: 跨 store 直接写 → 状态来源混乱、循环依赖、SSR 请求间状态泄漏；无聚合层 → 多 store 协调无统一入口。
- **验证方法**: `VUE_PINIA_AGGREGATE_STORE` 指向聚合层 store 文件路径，`[[ -f "$VUE_PINIA_AGGREGATE_STORE" ]]` 校验存在性；未配置或不存在 → warn。
- **对应门禁**: fw_vue_pinia_aggregate(warn)

```verify
id: vue-r17
cmd: 
expect: always
```

<!--
共 17 条规律（≥15 门槛，pinia 合并后 +2）。前 5 条挂现有 vue.sh 门禁（script_setup/no_options_api/vhtml_sanitize/vfor_index_key/reactivity_threshold），
pinia 合并新增 2 条门禁（fw_vue_pinia_definestore/fw_vue_pinia_aggregate），后 10 条标"人工检查"（语义/上下文相关规律）。
每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / CWE·GB 元数据）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_vue_script_setup | fail | 含 `<script` 的 SFC 总数 ≠ 含 `<script setup` 的 SFC 数 → fail | VUE_FILE_GLOBS VUE_REQUIRE_SCRIPT_SETUP | — |
| fw_vue_no_options_api | fail | 检出 Options API 选项式写法（data/methods/computed 选项）→ fail | VUE_FILE_GLOBS VUE_FORBIDDEN_OPTIONS_API | — |
| fw_vue_vhtml_sanitize | fail | 检出 `v-html` 的 SFC 同文件未检出 sanitize 模式 → fail | VUE_FILE_GLOBS VUE_VHTML_SANITIZE_REQUIRED VUE_VHTML_SANITIZE_PATTERNS | CWE-79（XSS 跨站脚本）；GB/T 38674-2020 §8.1（输入验证类安全设计） |
| fw_vue_vfor_index_key | warn | v-for 用数组 index 作 key → warn（稳定数组可接受） | VUE_FILE_GLOBS VUE_VFOR_FORBIDDEN_INDEX_KEY | — |
| fw_vue_reactivity_threshold | warn | reactive 调用次数超阈值 → warn 建议收敛 | VUE_FILE_GLOBS VUE_REACTIVE_WARN_THRESHOLD | — |
| fw_vue_pinia_definestore | warn | 启用 VUE_PINIA_DEFINESTORE_REQUIRED=1 时 defineStore 文件数 = 0 → warn（疑似未用 Pinia 或漏定义） | VUE_PINIA_FILE_GLOBS VUE_PINIA_DEFINESTORE_REQUIRED | — |
| fw_vue_pinia_aggregate | warn | VUE_PINIA_AGGREGATE_STORE 指向聚合层 store 文件不存在 → warn | VUE_PINIA_AGGREGATE_STORE | — |

<!--
门禁 id 命名规范：fw_vue_<rule>（rule 全小写下划线）。
本表 7 条 id 与 assets/framework-gates/vue.sh 的 `# gates:` 头注释严格一致（5 条原 vue + 2 条 pinia 合并）。
§3 其余规律标"人工检查"，不新增门禁——避免 .md 与 .sh 头注释漂移。
依赖变量在片段头注释 `# ruleset: vue  requires_conf: VAR1 VAR2` 声明（见 vue.sh 第 1 行）。
fixture 验证覆盖：violating 含 v-html 无 sanitize（fw_vue_vhtml_sanitize fail 主触发）+ Legacy.vue 普通 script + Options API
（fw_vue_script_setup + fw_vue_no_options_api fail，2026-07-20 P1 唤醒实例化）+ v-for 用 index（warn）；compliant 全 pass。
expected-fail-ids 已登记 3/3 fail id（tests/fixtures/vue/violating/expected-fail-ids）。
CWE/GB 映射列（2026-07-20 P1 补录）：仅对具直接安全语义的行引证（CWE 主分类 + 可对应 GB/T 条款），无直接安全语义标 —。
pinia 合并自原独立 pinia.sh（harvested-from: ncwk-dev precheck.sh:2536-2555），门禁 id 由 fw_pinia_* 改为 fw_vue_pinia_* 以遵循命名规范。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| vue × vite | `@/` alias 须在 vite.config.ts 的 resolve.alias 配置，且 alias 须在默认 `@` 之前声明自定义前缀 | 否则路径解析错乱、IDE 跳转失效 |
| vue × vue-router | 路由懒加载用 `() => import(…)` 动态导入，禁同步 import 全量打包 | 同步导入导致首屏 chunk 过大 |
| vue × pinia | store 须在 setup 内 `useXxxStore()` 获取，禁在模块顶层调用（SSR 跨请求串状态） | 模块顶层调用导致 SSR 请求间状态泄漏 |
| vue × naiveui | NaiveUI 须具名导入 + 按需引入，禁全局注册 | 全局注册增大包体、Tree-shaking 失效 |
| vue × typescript | `<script setup lang="ts">` 须显式标 lang="ts"，defineProps 须类型声明 | 否则 TS 类型检查不生效 |

<!--
无强交互的框架组合省略；本表聚焦 vue 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Vue 3.2 | `<script setup>` 稳定 | Options API 不再是首选，新组件须用 setup |
| Vue 3.3 | defineSlots / defineModel（实验）/ 泛型组件 | defineProps 类型声明支持复杂泛型 |
| Vue 3.4 | defineModel 稳定 / 模板解析器重写 | v-model 子组件写法简化（defineModel 替代 prop+emit 手写） |
| Vue 3.5 | useId / useTemplateRef / reactive props destructure 稳定 | reactive 解构（在 defineProps 解构）不再丢响应式（仅 props 解构，普通 reactive 解构仍丢） |
| Vue 3.6（RC，待验证） | Vapor Mode 编译模式（无虚拟 DOM） | 待验证：Vapor 组件与普通组件混用边界、第三方库兼容性；官方仅建议全新小应用整体启用 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
Vapor Mode（3.6 RC）相关规律待 GA 后补充。
-->
