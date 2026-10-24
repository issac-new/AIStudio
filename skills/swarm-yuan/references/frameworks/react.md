---
ruleset_id: react
适用版本: React 19.x（19.2 现行稳定；React Compiler v1.0 稳定）/ 18.x（差异单独标注）
最后调研: 2026-07-17（来源：https://react.dev/blog ；https://react.dev/reference/react ；https://react.dev/reference/eslint-plugin-react-hooks ）
深度门槛: 15
---

# React 规则集

<!--
本规则集覆盖 React 19.x（截至 2026-07 现行稳定 19.2，React Compiler v1.0 已稳定）与 18.x（差异单独标注）。
调研时点：2026-07-17。React 19 引入 Actions / use() / Server Components 稳定；React Compiler v1.0 稳定（自动 memo，减少手写 useMemo/useCallback）。
React Compiler 仍在渐进推广，未默认启用——本规则集规律按"未启用 Compiler"陈述，Compiler 启用后的差异标"待验证"。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `react` / `react-dom` 包（package.json dependencies）/ `next` / `react-router-dom` / `@reduxjs/toolkit` | 高 |
| 文件 | `**/*.jsx` / `**/*.tsx` 含 JSX / `react.config.*` | 中（须组合代码信号） |
| 代码 | `import .* from 'react'` / `useState(` / `useEffect(` / `useMemo(` / `useCallback(` / `React.createElement` / `function .*Component` | 高 |
| JSX | `<Fragment>` / `<>...</>` / `className=` / `key={` | 中（须组合 import 信号） |
| 配置 | `eslint-plugin-react-hooks` / `babel-preset-react` / `vite.config.*` 含 `@vitejs/plugin-react` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 react 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- React 组件：`grep -rlE "from 'react'|from \"react\"" "${PROJECT_DIR}" --include='*.jsx' --include='*.tsx'`（计数核验基准：import react 的组件文件数）
- Hook 调用：`grep -rhoE '\buse[A-Z][a-zA-Z]+\(' "${PROJECT_DIR}" --include='*.jsx' --include='*.tsx'`（计数核验基准：Hook 调用次数）
- useEffect 调用：`grep -rnE 'useEffect\(' "${PROJECT_DIR}" --include='*.jsx' --include='*.tsx'`（计数核验基准：useEffect 行数）
- key 属性使用：`grep -rnE 'key=\{' "${PROJECT_DIR}" --include='*.jsx' --include='*.tsx'`（计数核验基准：key 属性行数）
- ErrorBoundary：`grep -rlE 'componentDidCatch|getDerivedStateFromError' "${PROJECT_DIR}" --include='*.jsx' --include='*.tsx'`（计数核验基准：错误边界类数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：Hooks 须在组件顶层调用，禁在条件/循环/嵌套函数中调用
- **适用版本**: React 16.8+（Hooks 引入）
- **规律**: React 依赖 Hooks 调用顺序匹配内部状态，须在组件函数体顶层同步调用（不在 `if`/`for`/嵌套函数/早 return 之后）。条件 Hook 会破坏调用顺序导致状态错乱。官方 `eslint-plugin-react-hooks` 的 `rules-of-hooks` 规则强制。
- **违反后果**: Hooks 调用顺序错乱 → 状态串台、运行期崩溃 "Rendered fewer hooks than expected"。
- **验证方法**: 检出 `useState|useEffect|useMemo|useCallback|useRef` 出现在 `if (` / `for (` / `while (` / `} else` 块内或嵌套函数内 → fail。
- **对应门禁**: fw_react_hooks_top_level(fail)

```verify
id: react-r1
cmd: 
expect: always
```

### 规律：useEffect 须配依赖数组且依赖完整，禁省略或漏依赖
- **适用版本**: React 16.8+
- **规律**: `useEffect(fn, deps)` 的 deps 数组须完整列出 fn 内引用的响应式值（state/props）。省略 deps 会在每次 render 后执行（可能死循环）；漏依赖会导致 effect 用到旧值（stale closure）。`eslint-plugin-react-hooks` 的 `exhaustive-deps` 规则强制。仅"挂载时执行一次且不引用响应式值"才可传 `[]`。
- **违反后果**: 漏依赖 → effect 用旧值不更新 / 无限循环；省略 deps → 每次 render 触发副作用。
- **验证方法**: 检出 `useEffect(` 调用未配第二个参数（依赖数组 `[…]` 或 `[]`）→ fail；配了但不完整由 exhaustive-deps lint 兜底（人工确认）。
- **对应门禁**: fw_react_effect_deps(fail)

```verify
id: react-r2
cmd: 
expect: always
```

### 规律：列表渲染 key 须稳定唯一，禁用数组 index 作 key
- **适用版本**: React 全版本
- **规律**: React 用 key 做 list reconciliation，须是数据项稳定唯一标识（如 `item.id`）。用 `index` 作 key 时，列表增删/排序/过滤会导致 key 与数据项错位，React 复用错误组件实例，引发输入框串台、受控组件状态错乱、动画异常。仅"纯展示且永不增删排序"的稳定列表可接受。
- **违反后果**: 列表变更后组件复用错位 → 表单输入串台 / 组件内部状态错乱 / unmount/mount 顺序异常。
- **验证方法**: `grep -rnE 'key=\{(index|i|key)\}|key="\{?index' --include='*.jsx' --include='*.tsx'` 命中 → warn（稳定列表可接受，须人工确认）。
- **对应门禁**: fw_react_list_key(warn)

```verify
id: react-r3
cmd: grep -rnE 'key=\{(index|i|key)\}|key="\{?index' --include='*.jsx' --include='*.tsx' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：state 须不可变更新，禁直接 mutate state
- **适用版本**: React 全版本
- **规律**: `useState` 的 setter 须传入新引用（spread/immer/structuredClone），禁直接 mutate（`arr.push()` / `obj.x = 1`）。React 用 Object.is 比较新旧 state 引用决定 re-render，直接 mutate 引用不变 → React 跳过更新、UI 不刷新。`useReducer` 同理须返回新对象。
- **违反后果**: 直接 mutate → 引用不变 → React 不 re-render → UI 不同步；后续浅比较优化（memo）失效。
- **验证方法**: 检出 `setState` 后紧接 `.push(` / `.splice(` / `.pop(` / 直接属性赋值（`state.x =`）模式 → fail。
- **对应门禁**: fw_react_immutable_state(fail)

```verify
id: react-r4
cmd: 
expect: always
```

### 规律：useCallback/useMemo 须权衡收益，禁无意义 memo 全包
- **适用版本**: React 16.8+（Compiler 启用后可省略）
- **规律**: `useMemo`/`useCallback` 缓存值/函数引用，避免子组件（`React.memo`）无谓 re-render。但 memo 本身有依赖比较开销，简单计算/小组件 memo 反而更慢。原则：仅在"传给 `React.memo` 子组件的 props"或"昂贵计算"用。React Compiler 启用后自动 memo，手写 memo 须收敛。无依赖的 memo 是 dead code。
- **违反后果**: 滥用 memo → 依赖比较开销 + 代码冗长，无收益；遗漏关键 memo → 大列表 re-render 卡顿。
- **验证方法**: 检出 `useMemo(` / `useCallback(` 依赖数组为 `[]` 且函数体引用了 props/state → warn（疑似漏依赖）；全文件无 `React.memo` 却大量 `useCallback` → warn。
- **对应门禁**: fw_react_memo_benefit(warn)

```verify
id: react-r5
cmd: 
expect: always
```

### 规律：useState 须用函数式更新访问最新 state，禁在闭包中读旧 state
- **适用版本**: React 全版本
- **规律**: 基于前次 state 计算新 state 时须用函数式更新 `setCount(c => c + 1)`，禁 `setCount(count + 1)`（闭包捕获的 count 可能是旧值，连续多次调用只 +1）。批量更新场景（事件回调内多次 setState）尤甚。
- **违反后果**: 闭包旧值 → 连续 setState 丢失更新（只生效一次）。
- **验证方法**: 检出 `set[A-Z][a-zA-Z]+\([^,)]*\bstate` 直接用 state 变量而非函数式更新 → 人工确认（语义相关）。
- **对应门禁**: 人工检查

```verify
id: react-r6
cmd: 
expect: always
```

### 规律：ErrorBoundary 须捕获渲染错误，禁让整树白屏崩溃
- **适用版本**: React 16+（class component componentDidCatch）
- **规律**: React 渲染期抛错会让整组件树卸载白屏。须用 class component 实现 ErrorBoundary（`getDerivedStateFromError` + `componentDidCatch`）包裹易错子树（如第三方组件、动态数据渲染），降级显示 fallback UI。Hooks 无 ErrorBoundary 等价物（error boundary 须 class）。至少在路由级/顶层包裹一个。
- **违反后果**: 单个子组件抛错 → 整页白屏崩溃，用户体验灾难。
- **验证方法**: 检出 JSX 渲染但全项目无 `componentDidCatch` / `getDerivedStateFromError` → warn（缺少错误边界）。
- **对应门禁**: fw_react_error_boundary(warn)

```verify
id: react-r7
cmd: 
expect: always
```

### 规律：自定义 Hook 须以 use 开头并返回值/无返回，禁在普通函数内调 Hook
- **适用版本**: React 16.8+
- **规律**: 自定义 Hook 命名须以 `use` 开头（如 `useAuth` / `useDebounce`），以便 lint 规则识别其内部 Hook 调用约束。普通函数（非 use 开头）内调 Hook 会被 lint 漏检，运行期顺序错乱。Hook 须返回值或无返回，不返回 JSX。
- **违反后果**: 非 use 命名函数内调 Hook → lint 不报错但运行期 Hook 顺序错乱 → 崩溃。
- **验证方法**: 检出含 `useState|useEffect` 调用的函数定义不以 `use` 开头 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: react-r8
cmd: 
expect: always
```

### 规律：ref 须在 effect/event 中读写，禁在 render 阶段读写 ref.current
- **适用版本**: React 全版本
- **规律**: `useRef` 的 `.current` 可变，但须在 effect（`useEffect`）/事件回调中读写，禁在 render 阶段（组件函数体顶层同步）读写 `ref.current`。render 阶段须纯函数无副作用，读写 ref 会导致多次 render（并发模式/StrictMode 双调）结果不确定。
- **违反后果**: render 阶段读写 ref → StrictMode 双调下副作用执行两次 / 并发模式渲染结果不确定。
- **验证方法**: 检出 `ref.current` 出现在组件函数体顶层（非 useEffect/事件回调内）→ 人工确认。
- **对应门禁**: 人工检查

```verify
id: react-r9
cmd: 
expect: always
```

### 规律：Context 须拆分或用选择器，禁单一巨型 Context 触发全树 re-render
- **适用版本**: React 16.3+（Context API）
- **规律**: `Context.Provider` 的 value 变更会让所有消费该 Context 的组件 re-render（无 memo 优化）。单一巨型 Context（含所有全局状态）会导致任何字段变更都触发全树 re-render。须按域拆分多个 Context，或用 `use-context-selector` / zustand/jotai 等支持选择器的方案。
- **违反后果**: 单一 Context → 任意状态变更全树 re-render → 性能瓶颈。
- **验证方法**: 检出单个 Context value 含 >5 个字段的巨型对象 → warn。
- **对应门禁**: fw_react_context_split(warn)

```verify
id: react-r10
cmd: 
expect: always
```

### 规律：lazy 组件须配 Suspense fallback，禁无 fallback 悬挂
- **适用版本**: React 16.6+（lazy）/ 18+（Suspense for data fetching）
- **规律**: `React.lazy(() => import(…))` 动态导入组件，加载期需 `<Suspense fallback={…}>` 包裹提供加载态。无 fallback 的 Suspense 会让父树悬挂（无 UI 反馈）。路由级 lazy 须配 Suspense + ErrorBoundary（加载失败兜底）。
- **违反后果**: 无 fallback → 加载期白屏无反馈；无 ErrorBoundary → 加载失败整树崩溃。
- **验证方法**: 检出 `React.lazy(` 但同文件/父组件无 `<Suspense` 包裹 → warn。
- **对应门禁**: fw_react_lazy_suspense(warn)

```verify
id: react-r11
cmd: 
expect: always
```

### 规律：Server Components 不可用浏览器 API 与 Hooks，须标 'use client'
- **适用版本**: React 19 / Next.js App Router（RSC 稳定）
- **规律**: React Server Components（RSC）在服务端渲染，禁用 `useState`/`useEffect`/`window`/`document` 等浏览器 API 与 Hook。需交互/浏览器 API 的组件须文件首行标 `'use client'`。Server Component 可 import Client Component（单向），Client Component 不可 import Server Component（除作 children 传递）。
- **违反后果**: RSC 内用 Hook/浏览器 API → 编译/运行期错误 "You're importing a component that needs useState"。
- **验证方法**: 检出含 `useState|useEffect|window\.|document\.` 的组件文件首行无 `'use client'` → warn（在 Next.js App Router 项目）。
- **对应门禁**: fw_react_server_client_boundary(warn)

```verify
id: react-r12
cmd: 
expect: always
```

### 规律：事件回调须稳定引用或用 useEffect 清理，禁在 render 内订阅
- **适用版本**: React 全版本
- **规律**: 在 render 阶段订阅事件（`addEventListener` / `setInterval` / `socket.on`）会每次 render 重复订阅泄漏。须在 `useEffect` 内订阅并在 cleanup（return 函数）取消订阅，或用 `useEvent`（实验）/ `useCallback` 稳定回调。
- **违反后果**: render 内订阅 → 每次渲染重复订阅 → 内存泄漏 / 回调重复触发。
- **验证方法**: 检出 `addEventListener|setInterval|setTimeout` 出现在组件函数体顶层（非 useEffect 内）→ warn。
- **对应门禁**: fw_react_no_render_subscribe(warn)

```verify
id: react-r13
cmd: 
expect: always
```

### 规律：ref callback 须显式块语法，禁隐式返回（React 19）
- **适用版本**: React 19+（ref cleanup 函数特性稳定引入）
- **规律**: React 19 引入 ref callback 可返回 cleanup 函数（卸载时调用），因此 ref callback 不再允许隐式返回（`ref={current => (instance = current)}`），必须用块语法（`ref={current => { instance = current }}`）。隐式返回的值会被 TypeScript/运行时误认为 cleanup 函数而报错。返回非函数值（如 DOM 实例）会被拒绝。来源：React 19 升级指南 https://react.dev/blog/2024/04/25/react-19-upgrade-guide 。
- **违反后果**: ref callback 隐式返回 → 返回值被误判为 cleanup 函数 → TypeScript 报错 / 运行期卸载时调用非函数崩溃。
- **验证方法**: 检出 `ref=\{[^}]*=>\s*\(` 箭头函数隐式返回（无块 `{}` 包裹）→ warn（须改块语法）。
- **对应门禁**: fw_react_ref_callback_explicit(warn)

```verify
id: react-r14
cmd: 
expect: always
```

### 规律：React 19 起 ref 可作 prop 直传，新组件禁用 forwardRef 包裹
- **适用版本**: React 19+（forwardRef 将在未来版本 deprecated）
- **规律**: React 19 起 `ref` 是普通 prop，函数组件可直接 `function Comp({ ref, ...props })` 接收，无需 `forwardRef` 包裹。`forwardRef` 将在未来版本 deprecated。新组件不应再用 `forwardRef`；存量 `forwardRef` 组件可在升级时逐步迁移。来源：React 19 升级指南 https://react.dev/blog/2024/04/25/react-19-upgrade-guide 。
- **违反后果**: 新组件用 forwardRef → 增加无谓包裹层、与未来 deprecated 方向相悖、迁移债务累积。
- **验证方法**: 检出 `forwardRef(` 调用 → warn（新组件建议直接接 ref prop；存量组件标注待迁移）。
- **对应门禁**: fw_react_no_forwardref(warn)

```verify
id: react-r15
cmd: 
expect: always
```

<!--
共 15 条规律（≥15 门槛）。10 条挂门禁（fw_react_*），5 条标"人工检查"（语义相关规律，机械 grep 易误报）。
每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / CWE·GB 元数据）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_react_hooks_top_level | fail | Hook 调用出现在 if/for/while/else 块内或嵌套函数内 → fail | REACT_SRC_GLOBS | — |
| fw_react_effect_deps | fail | useEffect 调用未配第二参数（依赖数组）→ fail | REACT_SRC_GLOBS | — |
| fw_react_list_key | warn | 列表渲染用 index 作 key → warn（稳定列表可接受） | REACT_SRC_GLOBS | — |
| fw_react_immutable_state | fail | setState 后紧接 .push/.splice/直接属性赋值 mutate → fail | REACT_SRC_GLOBS | — |
| fw_react_memo_benefit | warn | useMemo/useCallback 依赖为 [] 且函数体引用 props/state（疑似漏依赖）→ warn | REACT_SRC_GLOBS | — |
| fw_react_error_boundary | warn | JSX 渲染存在但全项目无 componentDidCatch/getDerivedStateFromError → warn | REACT_SRC_GLOBS | CWE-755（异常状况处理不当，渲染错误白屏） |
| fw_react_context_split | warn | 单个 Context value 含 >5 字段巨型对象 → warn | REACT_SRC_GLOBS | — |
| fw_react_lazy_suspense | warn | React.lazy 调用但同文件无 <Suspense 包裹 → warn | REACT_SRC_GLOBS | — |
| fw_react_server_client_boundary | warn | 含 useState/useEffect/window./document. 的组件文件首行无 'use client' → warn（App Router 项目） | REACT_SRC_GLOBS | — |
| fw_react_no_render_subscribe | warn | addEventListener/setInterval/setTimeout 出现在 render 阶段（非 useEffect 内）→ warn | REACT_SRC_GLOBS | CWE-772（资源/订阅未释放致泄漏） |
| fw_react_ref_callback_explicit | warn | ref callback 箭头函数隐式返回（无块 {} 包裹）→ warn（React 19 须块语法，否则返回值误判 cleanup） | REACT_SRC_GLOBS | — |
| fw_react_no_forwardref | warn | 检出 forwardRef( 调用 → warn（React 19 起 ref 可作 prop，新组件禁用 forwardRef 包裹） | REACT_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_react_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/react.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_react_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: react  requires_conf: REACT_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 useEffect 无依赖数组 + 直接 mutate state + Conditional.tsx 条件内 Hook（3/3 fail 主触发，hooks_top_level 于 2026-07-20 P1 唤醒实例化）+ key={index}（warn）；compliant 全 pass。expected-fail-ids 已登记 3/3 fail id。CWE/GB 映射列（2026-07-20 P1 补录）：仅对具直接安全/可靠性语义的行引证，其余标 —。
规律14/15 为 React 19 稳定特性新增（ref callback cleanup / forwardRef deprecated），来源 react.dev/blog/2024/04/25/react-19-upgrade-guide。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| react × nextjs | App Router 下交互组件须 'use client'，Server Component 不可用 Hook | RSC 与 Client Component 边界单向 |
| react × react-router | 路由参数须用 useParams/useSearchParams，禁手动 parse window.location | SPA/SSR 路由状态来源不一致 |
| react × redux | selector 须用 reselect/createSelector memo，禁在 mapStateToProps 内新建对象 | 新建对象导致全树 re-render |
| react × typescript | 组件 props 须 interface/type 声明，禁 any；事件类型用 React.ChangeEvent | 类型缺失导致重构易错 |

<!--
无强交互的框架组合省略；本表聚焦 react 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| React 18 | 并发模式（Concurrent Rendering）/ 自动批量更新 / StrictMode 双调 effect | effect 在开发模式双调，cleanup 须幂等；批量更新改变 setState 时机 |
| React 19 | Actions / use() / Server Components 稳定 / ref 作 prop 传递 / ref callback cleanup | ref callback 须返回 cleanup 函数；Server Components 边界须 'use client' |
| React Compiler v1.0（2025-10） | 自动 memo，减少手写 useMemo/useCallback | 启用 Compiler 后手写 memo 多余（待验证：渐进启用覆盖率） |
| eslint-plugin-react-hooks | rules-of-hooks / exhaustive-deps 强制 | 须配 ESLint，否则 Hooks 规则/依赖无强制 |
| React 19.1 | Activity / useEffectEvent（实验）/ ref as prop | useEffectEvent 稳定后替代 useRef 稳定回调模式 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
React Compiler 启用后的规律差异待验证。
-->
