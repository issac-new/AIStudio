---
ruleset_id: nextjs
适用版本: Next.js 15.x / 16.x（App Router 稳定 / 缓存语义变更 / Server Actions 稳定；差异单独标注）
最后调研: 2026-07-17（来源：https://nextjs.org/blog ；https://nextjs.org/docs/app ；https://nextjs.org/docs/app/building-your-application/data-fetching/fetching-caching-and-revalidating ）
深度门槛: 10
---

# Next.js 规则集

<!--
本规则集覆盖 Next.js 15.x / 16.x（截至 2026-07 现行 16.2，App Router 稳定、Server Actions 稳定、缓存语义 15 起变更）。
调研时点：2026-07-17。Next.js 15 起缓存默认不再"全缓存"（fetch 默认 no-store 倾向），16 引入 'use cache' 指令 + updateTag/refresh API。
App Router（13.4+ 稳定）为推荐路由，Pages Router 仍支持但非首选。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `next` 包（package.json dependencies）/ `next/router` / `next/navigation` / `next/image` / `next/font` | 高 |
| 文件 | `next.config.js` / `next.config.mjs` / `app/**/page.tsx` / `app/**/layout.tsx` / `pages/**/*.tsx`（Pages Router） | 高 |
| 代码 | `'use client'` / `'use server'` / `next/headers` / `next/cookies` / `generateStaticParams(` / `revalidate` / `metadata` | 高 |
| 目录 | `app/` 目录（App Router）/ `pages/` 目录（Pages Router）/ `middleware.ts` | 高 |
| 配置 | `next.config.*` 的 `experimental.serverActions` / `images.domains` / `redirects` / `rewrites` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 nextjs 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- App Router 页面：`grep -rlE "export default" "${PROJECT_DIR}" --include='app/**/page.tsx' --include='app/**/page.jsx'`（计数核验基准：app/ 下 page 文件数）
- Server Component：`grep -rlL "use client" "${PROJECT_DIR}/app" --include='*.tsx' --include='*.jsx'`（计数核验基准：未标 'use client' 的组件文件数）
- 'use client' 组件：`grep -rlE "^'use client'|^\"use client\"" "${PROJECT_DIR}" --include='*.tsx' --include='*.jsx'`（计数核验基准：客户端组件文件数）
- Server Actions：`grep -rnE "'use server'|async function .*Action" "${PROJECT_DIR}" --include='*.ts' --include='*.tsx'`（计数核验基准：Server Action 定义行数）
- 中间件：`find "${PROJECT_DIR}" -maxdepth 2 -name 'middleware.ts' -o -name 'middleware.js'`（计数核验基准：middleware 文件数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：Server Component 禁用 Hook 与浏览器 API，交互组件须标 'use client'
- **适用版本**: Next.js 13.4+（App Router 稳定）
- **规律**: App Router 下默认组件为 Server Component（服务端渲染，无 JS 发往客户端），禁用 `useState`/`useEffect`/`window`/`document`/`localStorage` 等 Hook 与浏览器 API。需交互/浏览器 API 的组件须文件首行标 `'use client'`。Server Component 可 import Client Component（单向），Client Component 不可直接 import Server Component（可作 children 传递）。
- **违反后果**: Server Component 内用 Hook/浏览器 API → 编译/运行期错误 "You're importing a component that needs useState. It only works in a Client Component"。
- **验证方法**: 检出含 `useState|useEffect|window\.|document\.|localStorage\.` 的组件文件首行无 `'use client'` → fail。
- **对应门禁**: fw_nextjs_use_client(fail)

```verify
id: nextjs-r1
cmd: 
expect: always
```

### 规律：Server Actions 须显式鉴权，禁信任客户端调用
- **适用版本**: Next.js 14+（Server Actions 稳定）/ 15+（安全增强）
- **规律**: Server Actions（`'use server'` 标注的 async 函数）可被客户端直接调用，等价于公开 API 端点。须在函数内显式鉴权（`auth()` / `getServerSession()` / 校验 cookie），禁假设"只有页面按钮会调用"——攻击者可直接 POST 调用。15+ 起 Next.js 对 Server Action 请求体加密，但不替代鉴权。
- **违反后果**: 未鉴权 Server Action → 越权操作（任意用户调用删数据/改他人资料）CWE-862 缺失授权。
- **验证方法**: 检出 `'use server'` 文件内的 async 函数未含 `auth|session|getServerSession|requireAuth|currentUser` → fail。
- **对应门禁**: fw_nextjs_server_action_auth(fail)

```verify
id: nextjs-r2
cmd: 
expect: always
```

### 规律：中间件（middleware.ts）须配 matcher，禁默认拦截全站
- **适用版本**: Next.js 12.2+（middleware 稳定）
- **规律**: `middleware.ts` 默认对所有路由执行（含静态资源/`_next`），性能差且可能误拦截。须配 `export const config = { matcher: […] }` 精确匹配需拦截路径（如 `/dashboard/:path*`、`/api/:path*`），排除静态资源与公共 API。matcher 支持正则。
- **违反后果**: 无 matcher → 中间件全站执行 → 性能损耗 / 误拦截静态资源 / 公共页面被鉴权拦截。
- **验证方法**: 检出 `middleware.ts`/`middleware.js` 但无 `matcher` 配置 → fail。
- **对应门禁**: fw_nextjs_middleware_matcher(fail)

```verify
id: nextjs-r3
cmd: 
expect: always
```

### 规律：fetch 缓存语义须显式声明，禁依赖默认（15+ 默认变更）
- **适用版本**: Next.js 15+（缓存默认变更）/ 16+（'use cache'）
- **规律**: Next.js 15 起 `fetch` 默认不再缓存（`cache: 'no-store'` 倾向），与 14 默认 `force-cache` 相反。须显式声明 `cache: 'force-cache' | 'no-store'` 或 `next: { revalidate: N }`，避免版本升级行为静默变更。16 引入 `'use cache'` 指令做组件级缓存。
- **违反后果**: 依赖默认 → 15 升级后缓存行为静默反转（14 缓存 ↔ 15 不缓存）→ 数据不一致/性能突变。
- **验证方法**: 检出 `fetch(` 无 `cache:` / `next:` 参数（15+ 项目）→ warn。
- **对应门禁**: fw_nextjs_fetch_cache(warn)

```verify
id: nextjs-r4
cmd: 
expect: always
```

### 规律：cookies/headers 须仅在 Server Component/Action 用，禁 Client 调用
- **适用版本**: Next.js 13+（App Router）
- **规律**: `next/headers` 的 `cookies()` / `headers()` 须仅在 Server Component / Server Action / Route Handler 内调用（服务端 API）。Client Component 调用会报错。Client 须通过 props 或 fetch 传递。
- **违反后果**: Client Component 调用 cookies/headers → 编译/运行期错误。
- **验证方法**: 检出含 `from 'next/headers'` 或 `cookies()` / `headers()` 的文件首行标 `'use client'` → fail。
- **对应门禁**: fw_nextjs_headers_server_only(fail)

```verify
id: nextjs-r5
cmd: 
expect: always
```

### 规律：动态路由段须配 generateStaticParams 或 dynamic，禁静态生成与动态混用未声明
- **适用版本**: Next.js 13+（App Router）
- **规律**: `app/[id]/page.tsx` 动态路由段，若需 SSG 须导出 `generateStaticParams` 返回预生成参数列表；若全动态须导出 `export const dynamic = 'force-dynamic'`。未声明时 Next.js 启发式判定（含 fetch 动态 → 动态），行为不确定。
- **违反后果**: 未声明 → 静态/动态判定不确定 → 部分页面该动态却静态（数据陈旧）/ 该静态却动态（性能差）。
- **验证方法**: 检出 `app/**/[param]/**/page.tsx` 无 `generateStaticParams` 且无 `dynamic` 导出 → warn。
- **对应门禁**: fw_nextjs_dynamic_params(warn)

```verify
id: nextjs-r6
cmd: 
expect: always
```

### 规律：图片须用 next/image 优化，禁裸 <img>
- **适用版本**: Next.js 全版本
- **规律**: `next/image` 自动优化（resize/WebP/AVIF/lazy load/CSP 友好），须配 `images.domains`/`remotePatterns`。裸 `<img>` 绕过优化、无 lazy、CLS 风险。LCP 图片用 `priority` 属性。
- **违反后果**: 裸 <img> → 无优化/无 lazy/CLS 风险/LCP 差。
- **验证方法**: 检出 `<img ` 在 .tsx/.jsx（非 next/image 导入）→ warn。
- **对应门禁**: fw_nextjs_image_optimize(warn)

```verify
id: nextjs-r7
cmd: 
expect: always
```

### 规律：metadata API 须用 export const metadata / generateMetadata，禁手动 <head> 操作
- **适用版本**: Next.js 13+（App Router metadata API）
- **规律**: App Router 用 `export const metadata`（静态）或 `export async function generateMetadata()`（动态）声明 title/description/openGraph 等，禁在组件内手动操作 `<head>`（document.head / `<Head>` 组件）。Pages Router 用 `next/head`。
- **违反后果**: 手动 head 操作 → 与 metadata API 冲突 / SSR hydration mismatch / SEO 元数据丢失。
- **验证方法**: 检出 App Router 项目（app/ 目录）中用 `<Head>` 或 `document.head` → warn。
- **对应门禁**: fw_nextjs_metadata_api(warn)

```verify
id: nextjs-r8
cmd: 
expect: always
```

### 规律：路由组（(group)）须仅用于组织不影响 URL，禁误改路径
- **适用版本**: Next.js 13+（App Router）
- **规律**: `app/(marketing)/about/page.tsx` 的 `(marketing)` 是路由组，仅组织文件不影响 URL（仍映射 `/about`）。常用于同路由不同 layout。须确认括号路径组不改变预期 URL；嵌套多 layout 须用路由组隔离。
- **违反后果**: 误以为路由组影响 URL → 路由设计错误 / 链接 404。
- **验证方法**: 人工确认路由组目录命名符合 `(name)` 模式且不影响 URL。
- **对应门禁**: 人工检查

```verify
id: nextjs-r9
cmd: 
expect: always
```

### 规律：Pages Router 与 App Router 不可混用同一路由
- **适用版本**: Next.js 13+（迁移期）
- **规律**: 迁移期 `pages/` 与 `app/` 可共存，但同一路径不可同时定义（如 `pages/about.tsx` 与 `app/about/page.tsx`）→ 冲突报错。迁移须逐路由迁移，App Router 优先。`pages/api` 与 `app/api` 可共存但建议统一。
- **违反后果**: 同路径双定义 → 路由冲突报错 / 行为不确定。
- **验证方法**: 检出同路径在 pages/ 与 app/ 双定义 → fail。
- **对应门禁**: fw_nextjs_router_conflict(fail)

```verify
id: nextjs-r10
cmd: 
expect: always
```

### 规律：revalidate 须显式声明单位（秒），禁无单位或过长
- **适用版本**: Next.js 13+（ISR）
- **规律**: `export const revalidate = 60`（秒）控制 ISR 重验证间隔。须显式声明合理值（过短 → 频繁重生成压力；过长 → 数据陈旧）。`revalidate = 0` 等价全动态。16+ 推荐 `'use cache'` + `revalidateTag`/`refresh` 替代裸 revalidate。
- **违反后果**: revalidate 缺失 → 默认行为不确定（15+ 不缓存倾向）；过长 → 数据陈旧。
- **验证方法**: 检出 `revalidate` 导出但值为 0 或 >86400（1 天）→ warn。
- **对应门禁**: fw_nextjs_revalidate(warn)

```verify
id: nextjs-r11
cmd: 
expect: always
```

### 规律：缓存四层语义须区分（Request Memoize/Data Cache/Full Route/Router Cache）
- **适用版本**: Next.js 13+（App Router 四层缓存）
- **规律**: App Router 有四层缓存：(1) Request Memoization（同请求内 fetch 去重）/ (2) Data Cache（fetch 跨请求缓存）/ (3) Full Route Cache（路由产物缓存）/ (4) Router Cache（客户端导航缓存）。须理解各层失效与清除方式（`revalidateTag`/`revalidatePath` 清 Data+Route Cache；`router.refresh()` 清 Router Cache）。误用导致缓存陈旧或失效过度。
- **违反后果**: 缓存层混淆 → `revalidateTag` 不生效（清错层）/ 导航缓存陈旧 / 重复请求未去重。
- **验证方法**: 人工确认 revalidateTag/revalidatePath/router.refresh 用法对应正确缓存层。
- **对应门禁**: 人工检查

```verify
id: nextjs-r12
cmd: 
expect: always
```

### 规律：Client Component 不可直接 import Server Component，须作 children 传递
- **适用版本**: Next.js 13+（App Router）
- **规律**: Server Component（默认）可 import Client Component（标 'use client'）。反向禁止：Client Component import Server Component 会报错。需在 Client 内嵌 Server Component 时，由 Server Component 父级将 Server Component 作 `children` prop 传入 Client（children 在服务端渲染后传入）。
- **违反后果**: Client import Server → 编译错误 "Server Components rendered as part of a Client Component"。
- **验证方法**: 人工确认 Client Component 文件未 import 非 'use client' 且含服务端 API 的组件。
- **对应门禁**: 人工检查

```verify
id: nextjs-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。10 条挂门禁（fw_nextjs_*），3 条标"人工检查"（语义/架构相关规律）。
每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / CWE·GB 元数据）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_nextjs_use_client | fail | 含 useState/useEffect/window./document. 的组件文件首行无 'use client' → fail | NEXTJS_SRC_GLOBS | — |
| fw_nextjs_server_action_auth | fail | 'use server' 文件内 async 函数未含 auth/session/getServerSession → fail 越权风险 | NEXTJS_SRC_GLOBS | CWE-862（缺失授权，门禁文案已引）；GB/T 22239-2019 7.1.4.2（访问控制） |
| fw_nextjs_middleware_matcher | fail | middleware.ts 存在但无 matcher 配置 → fail 全站拦截 | NEXTJS_SRC_GLOBS | — |
| fw_nextjs_fetch_cache | warn | fetch 调用无 cache:/next: 参数 → warn（15+ 默认变更须显式） | NEXTJS_SRC_GLOBS | — |
| fw_nextjs_headers_server_only | fail | 含 next/headers/cookies()/headers() 的文件首行标 'use client' → fail | NEXTJS_SRC_GLOBS | CWE-200（敏感信息暴露：Client 组件读取服务端 cookies/headers） |
| fw_nextjs_dynamic_params | warn | app/**/[param]/**/page.tsx 无 generateStaticParams 且无 dynamic 导出 → warn | NEXTJS_SRC_GLOBS | — |
| fw_nextjs_image_optimize | warn | 检出裸 <img>（非 next/image）→ warn 无优化 | NEXTJS_SRC_GLOBS | — |
| fw_nextjs_metadata_api | warn | App Router 项目用 <Head>/document.head → warn 须用 metadata API | NEXTJS_SRC_GLOBS | — |
| fw_nextjs_router_conflict | fail | 同路径在 pages/ 与 app/ 双定义 → fail 路由冲突 | NEXTJS_SRC_GLOBS | — |
| fw_nextjs_revalidate | warn | revalidate 导出值为 0 或 >86400 → warn 缓存语义风险 | NEXTJS_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_nextjs_<rule>（rule 全小写下划线）。
本表 10 条 id 须在 assets/framework-gates/nextjs.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_nextjs_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: nextjs  requires_conf: NEXTJS_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 5/5 fail 全触发（use_client / server_action_auth / middleware_matcher / headers_server_only / router_conflict）；2026-07-20 P1 唤醒三项：middleware_matcher（注释字面量中和，改写注释唤醒）、headers_server_only（新增 client-cookie.tsx 实例化）、router_conflict（门禁 sed 分隔符与 ERE 交替冲突沉睡 bug，nextjs.sh 分隔符 `|`→`:` 修复 + pages//app/ 同路径样本，详见 tests/fixtures/nextjs/README.md）。expected-fail-ids 已登记 5/5 fail id。CWE/GB 映射列（同批补录）：仅对具直接安全语义的行引证，其余标 —。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| nextjs × react | App Router 下交互组件须 'use client'，Server Component 不可用 Hook | RSC 与 Client Component 边界单向 |
| nextjs × prisma | 数据库访问须在 Server Component/Action/Route Handler 内，禁 Client 直接访问 | Client 会泄露 DB 连接串 |
| nextjs × auth.js (next-auth) | 鉴权须在 middleware 或 Server Action 内调用 auth()，禁 Client 持 token | Server-side session 安全 |
| nextjs × tanstack-query | Client 数据获取用 TanStack Query，Server 初始数据用 prefetch/hydration | 避免 Client/Server 数据瀑布 |

<!--
无强交互的框架组合省略；本表聚焦 nextjs 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Next.js 13.4 | App Router 稳定 / RSC 稳定 | Pages Router 非首选，新项目用 App Router |
| Next.js 14 | Server Actions 稳定 / Partial Prerendering 预览 | Server Action 可用；metadata API 稳定 |
| Next.js 15 | fetch 缓存默认反转（默认不缓存）/ Server Actions 安全增强 | 14→15 升级 fetch 行为静默反转，须显式 cache: |
| Next.js 16 | 'use cache' 指令 / updateTag/refresh API / Turbopack 稳定 | 缓存模型重构，裸 revalidate 可迁移 'use cache' |
| Next.js 16.2 | 渲染速度提升 / dev Time-to-URL 提升 | 性能改进，无破坏性 |
| Next.js 16.3（Preview） | Instant Navigations / Partial Prefetching | 待验证：新导航模型对 Router Cache 影响 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
15 缓存默认反转为高频升级陷阱。
-->
