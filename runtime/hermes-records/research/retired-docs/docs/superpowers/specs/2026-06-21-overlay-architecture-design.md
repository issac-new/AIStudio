# Overlay 架构设计:三上游仓 + 二次开发分离

> 日期: 2026-06-21
> 状态: **已实施**(2026-06-21)。40 patch + 74 custom 文件 + 6 registry + 构建验证通过。
> 关联: 基于 `CUSTOMIZATIONS.md` 侵入点清单、`scripts/sync-upstream.sh`、现有 `custom/` 目录成果

## 1. 背景与目标

### 1.1 现状

`ncwk/` 工作区下平铺三个第三方仓库,作为二次开发的依赖:

| 目录 | 上游 remote | 本地污染 |
|------|------------|---------|
| `hermes-agent/` | `github.com/NousResearch/hermes-agent` | 仅 1 处未提交改动(`hermes_cli/kanban.py`)+ 未跟踪 `CLAUDE.md` |
| `element-web/` | `github.com/element-hq/element-web` | 0(纯净) |
| `hermes-web-ui/` | ~~`hermes-web-ui.git`~~ → 已改为 `hermes-studio.git` | **重污染**:37 个本地 commit 直接堆在上游历史,154 文件改动 |

注:`hermes-web-ui/` 仓的 `origin` 已于本次改为 `hermes-studio.git`(上游官方仓库重命名),但目录名仍为旧名,且本地改动与上游代码混在同一 git 历史。

### 1.2 已有的兼容性投入(在 hermes-web-ui 仓内)

- `custom/branding`、`custom/kanban`、`custom/matrix` 三条功能分支,按 feature 拆分本地改动
- `refactor/upstream-compat` 集成分支(当前工作分支)
- `packages/client/src/custom/`(`matrix-chat/`、`kanban/`、`branding/`)+ `packages/server/src/custom/`:已隔离的纯新增代码
- `CUSTOMIZATIONS.md`:侵入点清单,列 9 处敏感 UI 侵入点
- `scripts/sync-upstream.sh`:fetch → rebase 三分支 → reset main → merge

### 1.3 核心矛盾

"不修改原项目源码,以便兼容后续更新" 与现状冲突:`hermes-web-ui/` 本身就是上游仓的工作树,本地 37 个 commit 直接 commit 在上游仓库里,上游代码与本地改动无法分离。`element-web/`、`hermes-agent/` 已满足"纯上游",唯独 `hermes-web-ui` 未达标。

### 1.4 目标

1. 三个上游仓(`hermes-agent`、`element-web`、`hermes-studio`)始终保持上游原状,可独立 `git pull` 升级,`.git` 永不污染
2. 所有二次开发代码集中在一个独立的 overlay 仓库,唯一被提交的地方
3. 上游升级流程明确、可重复、冲突可定位
4. 一次性全量迁移现有 `hermes-web-ui/` 的本地成果(custom/ 代码 + 侵入点),迁移后功能与当前对等

### 1.5 非目标

- 不重写 `custom/` 目录内已有的、已隔离的纯新增组件(它们只需搬迁,不动逻辑)
- 不改变 `element-web`、`hermes-agent` 的协作方式(同级目录,`build-element-web.mjs` 模式不变)
- 不做 npm 包化、不做 git submodule(同级平铺 git 仓)
- 本期不实现新功能,目标是架构分离 + 功能对等迁移

## 2. 决策记录

| 决策 | 选择 | 备选 |
|------|------|------|
| 隔离模型 | 彻底分离:overlay 仓 + 构建期注入 | 维持 custom/+rebase 现状;submodule+alias |
| 目录布局 | 新套 `upstream/` + `overlay/` | 平铺保留+新增 overlay;ncwk 作 overlay |
| 迁移范围 | 一次性全量 | 分阶段先搭框架 |
| 本地改动分类(实施后) | **纯新增文件(91)→ custom/;所有上游文件修改(39)→ patch**。原设想的"A 类导出可抽出"因上游消费者存在而全部归 B 类 | 全部抽 custom/(不成立);全部转 patch |
| 接入点模式 | 构建期 alias 重定向入口(custom/ 经 alias + shim 接入) | 最小 hook 点;纯运行时注册 |
| 上游文件改动 | patch 文件(`git apply` 可逆,39 个) | fork 上游 |

> 接入点模式(A 类)的演进:初选"运行时注册(零侵入,入口留 2 行引导 hook)"。评审反馈要求连这 2 行也消除,故升级为**构建期 alias 重定向**(§3.3):A 类相关上游源码 100% 原状,接入发生在 overlay 侧的 entry shim + 派生 config。运行时注册仍用于把 A 类扩展挂载到 app 实例,触发点是 overlay 入口 shim 在 re-export 上游后调 bootstrap。
>
> B 类的引入:对 55 个修改文件做分类后发现,~7 个文件改的是上游骨架(schemas 加列、config 加字段、vite 预打包等),属运行前置条件,无法运行时注册。这些转 patch(§3.5),`git apply` 可逆,上游 `.git` 历史仍保持干净。

## 3. 目标架构

### 3.1 目录布局

```
ncwk/                              # 二次开发工作区(非 git 仓,仅工作区)
├── upstream/                      # 三个上游仓,始终 origin/main 原状
│   ├── hermes-agent/              # git,remote → NousResearch/hermes-agent
│   ├── element-web/               # git,remote → element-hq/element-web
│   └── hermes-studio/             # git,remote → EKKOLearnAI/hermes-studio
│       └── (原 hermes-web-ui 的上游内容;v0.6.18 基线)
├── overlay/                       # 【新建】本地二次开发独立 git 仓(唯一被提交处)
│   ├── custom/                    # 纯新增代码(从 hermes-web-ui/packages/.../custom 搬迁)
│   │   ├── client/                # = 原 packages/client/src/custom 整体搬迁
│   │   │   ├── matrix-chat/
│   │   │   ├── kanban/
│   │   │   └── branding/
│   │   └── server/                # = 原 packages/server/src/custom + A 类抽出的新增导出
│   ├── registries/                # 【新建】运行时注册中枢(A 类接入点)
│   │   ├── client/                # 前端:入口 shim(entry.mts)、路由/导航/组件/store 注册表
│   │   └── server/                # 后端:入口 shim(entry.mts)、路由/service/controller 注册表
│   ├── patches/                   # 【新建】B 类上游骨架改动(patch 文件,可逆)
│   │   ├── series                 # patch 应用清单(按序)
│   │   └── NNN-*.patch            # schemas/config/vite.config 等
│   ├── config/
│   │   ├── features.ts            # 功能开关(原 custom/config.ts 迁移)
│   │   └── bootstrap.ts           # 注入清单:patch/extension/registry 对哪个上游仓生效
│   ├── scripts/
│   │   ├── inject.mjs             # 应用 B 类 patch + 生成 overlay 派生 config(A 类 alias)
│   │   ├── extract.mjs            # 【一次性迁移用】从 hermes-web-ui git 历史抽 patch/代码
│   │   ├── sync-upstream.sh       # 升级:clean → fetch/reset → re-inject
│   │   └── verify-clean.mjs       # 校验 upstream 工作树状态(patch 是否残留/纯净)
│   ├── assets/                    # 品牌 logo 等(原 packages/client/public/logo.png 等)
│   ├── package.json
│   └── README.md
└── docs/superpowers/              # specs/plans(已有,保持)
```

### 3.2 三个上游仓的角色

| 仓 | 角色 | 注入方式 |
|----|------|---------|
| `upstream/hermes-studio` | 主应用(前端 client + 后端 server) | **主注入对象**:overlay 的 client/server 扩展注入此仓工作树 |
| `upstream/element-web` | Matrix 客户端,构建产物嵌入 hermes-studio | 不注入,仅 `build-element-web.mjs` 构建时消费(脚本迁入 overlay/scripts/) |
| `upstream/hermes-agent` | Python agent,被 hermes-studio server 调用 | 不注入、不动(纯上游只读依赖,见 §6.2) |

三仓在 `upstream/` 下保持各自 git 仓,`.git` 完整,可独立 fetch/pull/checkout。overlay 的注入脚本**只读写工作区文件,不改动 `.git`**,但注入产生的文件改动属于"工作区污染",由 `inject.mjs` 的 `--clean` 反向清除(见 §4.4)。

### 3.3 接入机制之一:构建期 alias 重定向入口(覆盖 A 类的"入口依赖")

> 本架构对本地改动按可分离性分两类(详见 §6.1),分别用两套机制接入:
> - **A 类(纯新增:新函数/新组件/新路由)** → 运行时注册(§3.3 alias 重定向入口 + §3.4 registry)
> - **B 类(改上游骨架:schemas/config/vite.config 等)** → patch 文件(§3.5,可逆 `git apply`)
>
> §3.3–3.4 处理 A 类。上游源码经 inject 后**对 A 类零改动**;B 类的改动由 §3.5 的 patch 承载,inject 时 `git apply` 到上游工作树、`--clean` 时 `git apply --reverse` 还原,故上游 `.git` 历史**始终干净**,工作区仅有可清除的 inject 产物。

核心:对 A 类改动,上游源码**一行不改**。自定义逻辑通过"重定向入口模块的解析路径"接入,由构建工具(Vite / TS)在构建期完成,运行时对上游代码透明。

**机制 —— 入口 shim**:上游应用通过两个入口启动:

- 前端:`packages/client/src/main.ts`(69 行,`createApp` → `app.use(pinia/i18n/router)` → `app.mount`)
- 后端:`packages/server/src/index.ts`(Koa app 装配 + 启动监听)

overlay 为这两个入口各提供一份 **shim**(超集包装),位于 `overlay/registries/`:

- `overlay/registries/client/entry.mts`:
  ```ts
  // 先 re-export 上游 main.ts 的全部副作用(createApp、use、mount 照常执行)
  await import('../../upstream/hermes-studio/packages/client/src/main.ts');
  // 再运行 overlay 的注册中枢(注册路由/导航/组件/store/i18n)
  const { bootstrapClient } = await import('./bootstrap');
  bootstrapClient();
  ```
- `overlay/registries/server/entry.mts`:同理,re-export 上游 `index.ts` 后调 `bootstrapServer(app)`。

上游 `main.ts`/`index.ts` **保持原样、照常执行**,overlay 的注册在它之后追加。注册中枢 `bootstrap` 内部遍历已注册的 extensions(见 §3.4),把 matrix/kanban/branding 的路由、导航项、组件、store 插件、i18n 增量逐一套用进已创建的 `app`/`router`/`pinia` 实例。

**构建期如何用 overlay shim 替代上游入口**:由 inject 脚本生成 overlay 自己的 `vite.config.overlay.ts` / `tsconfig.overlay.json`,在 `resolve.alias` / `paths` 中把入口模块名重定向到 overlay shim。以 Vite 为例(上游 `vite.config.ts` 已用 `resolve.alias` 把 `@` 指向 `packages/client/src`):

- 开发:Vite 用 overlay 的 config 启动(`vite --config vite.config.overlay.ts`),`alias` 把应用入口 `/main.ts` 重定向到 `overlay/registries/client/entry.mts`
- 构建:同理,打包产物的入口是 overlay shim
- 上游 `vite.config.ts`、`main.ts`、`index.ts` 均**不修改**;overlay 只是提供一份"在上游 config 之上叠加 alias 的派生 config"

后端 server 是 Node 启动(`nodemon` / 编译后 `node`),用 TS `paths` + 编译输出达成同样的重定向:`overlay/tsconfig.json` 的 `paths` 把 `'@hermes/server'` 映射到 overlay shim,编译时即生效。

**结果(A 类)**:`upstream/hermes-studio` 的入口文件经 inject 后**对 A 类零改动**,只生成 overlay 侧的 config/shim。这是相比"留 2 行引导 hook"的升级:上游源码对 A 类 100% 原状,升级时连引导行都不需重新应用。B 类改动则由 §3.5 的 patch 承载。

> 取舍:alias 方案把"接入"的复杂度从上游源码(2 行)转移到 overlay 侧的 config/shim 维护。入口 shim 极薄(re-export + 一次 bootstrap 调用),上游入口结构变化时(如 `createApp` 位置/方式改),只需调整 shim 的 re-export 语句——冲突点集中在 2 个入口,且发生在 overlay 仓内、不污染上游。

### 3.5 接入机制之二:patch 文件(覆盖 B 类的"上游骨架改动")

B 类文件改的是上游的**结构性骨架**,无法用运行时注册替代(典型:schemas 加列、config 加字段、vite.config 加预打包项)。这些改动以 **patch 文件**承载,存于 `overlay/patches/`,由 inject 脚本应用到上游工作树。

**目录**:
```
overlay/patches/
├── series                    # patch 应用清单(每行一个 patch 文件名,按序)
├── 001-schemas-matrix-columns.patch   # db/hermes/schemas.ts:users 表加 matrix_* 列 + 迁移
├── 002-config-matrix-fields.patch     # config.ts:matrix 相关配置字段
├── 003-vite-matrix-presbundle.patch   # vite.config.ts:optimizeDeps 加 matrix-js-sdk
├── 004-sessions-db.patch              # sessions-db.ts 改动
├── 005-routes-auth.patch              # routes/auth.ts 改动
├── 006-safe-file-store.patch          # safe-file-store.ts 改动
└── 007-model-run-prompt.patch         # model-run-prompt.ts 改动
```

**应用/还原**(由 `inject.mjs` 自动执行,封装在 §4 流程中):
- inject:读取 `series`,对每个 patch 执行 `git -C upstream/hermes-studio apply ../overlay/patches/NNN-*.patch`(用 `git apply` 而非 `patch`,确保与 git 上下文一致;失败即中止并报错)
- `--clean`:对 `series` **逆序**执行 `git apply --reverse`,逐一还原

**冲突处理(上游升级时)**:若上游升级导致某 patch 无法 apply(inject 报错),人工在 overlay 仓:
1. `git apply --reject` 查看被拒的 hunk(`.rej` 文件)
2. 手动调整 patch 或上游对应处,重新 `git diff > overlay/patches/NNN-*.patch` 生成新 patch
3. 重跑 inject

**为什么 B 类不用 registry**:B 类改的是"上游模块对外契约的一部分"(如 `users` 表必须有 `matrix_user_id` 列,否则 matrix 登录查询会失败)。这类改动是**运行前置条件**,运行时注册无法在"代码加载/DB 初始化"之前生效。patch 是唯一能精确表达"在上游源码某处插入/修改"且保持上游 git 历史干净的机制。

**B 类完整清单**(迁移时逐一确认,以 `CUSTOMIZATIONS.md` + 本轮分类为准):
- `packages/server/src/db/hermes/schemas.ts`(表结构)
- `packages/server/src/config.ts`(配置字段)
- `vite.config.ts`(构建期预打包)
- `packages/server/src/db/hermes/sessions-db.ts`、`routes/auth.ts`、`services/safe-file-store.ts`、`services/hermes/run-chat/model-run-prompt.ts`(已有逻辑改动)
- 客户端重写型(`KanbanView.vue`、`LoginView.vue`、`AccountSettings.vue` 等):若 registry 的组件替换无法覆盖其全部改动,剩余部分也转 patch;迁移时按文件判定(见 §6.6 的边界)

### 3.4 注册中枢 API(overlay/registries/)

提供类型安全的注册接口,extensions 调用它们接入上游,而非直接改上游文件:

```ts
// overlay/registries/client/index.ts
export interface ClientRegistry {
  registerRoute(route: RouteRecordRaw): void;          // 替代改 router/index.ts
  registerNavEntry(entry: NavEntry): void;             // 替代改 PageSidebarNav.vue
  registerStorePlugin(plugin: PiniaPlugin): void;      // 扩展 store
  registerComponent(name: string, comp: Component): void; // 替代组件替换
  registerApiModule(name: string, mod: ApiModule): void;
}
```

```ts
// overlay/registries/server/index.ts
export interface ServerRegistry {
  registerRoute(prefix: string, router: KoaRouter): void;       // 替代改 routes
  registerController(ctrl: Constructor): void;                  // 替代改 controllers
  extendService(name: string, ext: ServiceExtension): void;     // 替代改 service(如 hermes-kanban.ts)
  registerMiddleware(mw: KoaMiddleware): void;
}
```

每个 registry 在 `bootstrap()` 时被调用(由 §3.3 的入口 shim 触发),遍历已注册项并挂载到已创建的 `app`/`router`/`pinia` 实例上。上游入口 `main.ts`/`index.ts` 不感知 bootstrap 的存在。

## 4. 注入流程(inject.mjs)

> 设计要点(混合策略):inject 对 A 类改动**不写上游**(经 alias + registry 接入,§3.3–3.4);对 B 类改动**通过 patch 写入上游工作树**(可逆,§3.5)。两者结合保证:**上游 `.git` 历史始终干净**(patch 产物不 commit),`--clean` 可完全还原上游工作树。

### 4.1 职责

为 overlay 生成构建所需的派生配置(A 类),并把 B 类 patch 应用到上游工作树,使上游应用经 overlay 的 config 启动后能加载全部自定义功能。**幂等**:可重复运行,结果一致。

### 4.2 步骤(默认 = inject)

1. **校验纯净**:运行 `verify-clean.mjs`,确认 `upstream/hermes-studio` 的 `git status` 干净(无 patch 残留、无手工改动)。若已有 patch 残留(上次 inject 未 clean),提示先 `--clean`。

2. **应用 B 类 patch**(唯一写上游的步骤):读取 `overlay/patches/series`,对每个 patch 顺序执行 `git -C upstream/hermes-studio apply <overlay>/patches/NNN-*.patch`。任一失败即中止并报错(见 §3.5 冲突处理)。应用后上游工作树出现 B 类改动(未 commit)。

3. **生成派生构建配置**(写在 overlay 侧,不写上游):
   - `overlay/vite.config.overlay.ts`:import 上游 `vite.config.ts`(注意:vite.config.ts 本身的 B 类改动已由步骤2的 patch 完成),在其 `resolve.alias` 之上叠加入口重定向(把应用入口指向 §3.3 的 `overlay/registries/client/entry.mts`),并加入 `overlay/custom`、`overlay/registries` 的路径别名
   - `overlay/tsconfig.json`:`extends` 上游 tsconfig,`paths` 把 server 入口映射到 `overlay/registries/server/entry.mts`
   - `overlay/tsconfig.server.json` / 启动脚本:nodemon / 编译入口指向 overlay shim

4. **准备 custom 资源(A 类)**:把 `overlay/custom/client/*` 与 `overlay/custom/server/*` 通过 alias 暴露给构建(开发期直接 alias 到 overlay 源路径,改 overlay 即时生效,无需复制)。custom 目录是**纯新增文件**,不与上游任何文件冲突。

5. **应用 brand assets**:logo 等(原 `packages/client/public/logo.png` 等 3 个)需替换上游同路径文件。改用 **Vite `publicDir` 合并 / 静态资源 alias**:overlay 的 `assets/` 通过构建期配置覆盖上游 `public/logo.png` 的解析。assets 属于少数需要"覆盖同名上游文件"的资源,统一在 overlay config 里声明覆盖映射,不复制到上游。

6. **生成注入清单**:写 `.overlay-injected.json`(overlay 仓内),记录本次应用的 patch 列表、生成的派生 config 路径与 asset 覆盖映射,供 `--clean` 精确还原。

### 4.3 反向清除(--clean)

读取 `.overlay-injected.json`,**逆序**对 patch 执行 `git -C upstream/hermes-studio apply --reverse <overlay>/patches/NNN-*.patch` 还原 B 类改动;删除 overlay 侧本次生成的派生 config。清除后 `upstream/hermes-studio` 的 `git status` 应回到完全干净。

### 4.4 配置(overlay/config/bootstrap.ts)

声明入口重定向、custom 路径、extensions 清单,按功能开关条件启用:

```ts
export const bootstrap = {
  upstreamRoot: '../upstream/hermes-studio',
  client: {
    // 上游入口(被 overlay shim re-export)
    upstreamEntry: 'packages/client/src/main.ts',
    // overlay shim(派生 config 把应用入口重定向到此)
    overlayEntry: 'overlay/registries/client/entry.mts',
    customDirs: ['overlay/custom/client'],
    assetOverrides: {
      'public/logo.png': 'overlay/assets/logo.png',
    },
    extensions: [
      { id: 'matrix-chat', enabled: features.matrixChat },
      { id: 'kanban', enabled: features.kanbanEnhancements },
      { id: 'branding', enabled: features.branding },
    ],
  },
  server: {
    upstreamEntry: 'packages/server/src/index.ts',
    overlayEntry: 'overlay/registries/server/entry.mts',
    customDirs: ['overlay/custom/server'],
    extensions: ['matrix', 'kanban'],
  },
};
```

## 5. 上游升级流程(sync-upstream.sh)

```bash
# 1. 还原上游工作树(撤销 B 类 patch,使上游回到纯净 origin/main)
./scripts/inject.mjs --clean

# 2. 拉取上游(此时工作树干净,reset 无冲突)
cd upstream/hermes-studio && git fetch origin && git reset --hard origin/main && cd ../..

# 3. 重新注入(重新生成 overlay 侧派生 config + 重新应用 B 类 patch)
./scripts/inject.mjs

# 4. 验证
npm --prefix overlay run build          # overlay 构建(经 alias 加载上游)
npm --prefix overlay run test           # overlay 测试套件(功能对等)
```

升级时两类冲突需人工介入(均在 overlay 仓内,不污染上游 commit):
- **入口结构变**(§3.3 shim):`main.ts` 的 `createApp` 方式、`index.ts` 的 Koa 装配方式改变 → 调整 `registries/{client,server}/entry.mts` 的 re-export
- **B 类 patch 不再 apply**(§3.5):上游改动了 patch 所涉文件 → 用 `git apply --reject` 查看拒收 hunk,重生成 `overlay/patches/NNN-*.patch`

## 6. 迁移计划(一次性全量)

### 6.1 迁移分类处理

现有 `hermes-web-ui/` 相对 `origin/main`(v0.6.18)的 154 文件改动(91 新增 + 55 修改 + 8 删除),按下表处理。

> **迁移实际结果(已实施,2026-06-21)**:经逐文件依赖分析,**所有 55 个修改的上游文件最终都归为 B 类 patch**。原设计假设的"A 类纯新增导出可抽出"不成立——因为那 ~80 个新导出被**上游文件**(App.vue、LoginView.vue、stores/hermes/*、KanbanView.vue 等)直接 import,抽到 overlay 就要同时 patch 所有 import 点,比直接 patch 源文件更糟。因此实际分类简化为:

| 类别 | 数量 | 处理 | 实际目标 |
|------|------|------|---------|
| **纯新增(custom/)** | 91 新增(其中 63 为 client custom 组件/stores/composables,28 为 server custom + 其他) | 原样搬迁,不动逻辑 | `overlay/custom/`(✅ 已迁) |
| **追加型 i18n** | 10 修改 | 增量对象由 `extract-i18n-increments.mjs` 机械提取,运行时 `mergeLocaleMessage` 深合并(见 §6.5) | `overlay/custom/client/branding/i18n/`(✅ 已迁) |
| **上游文件修改(全部 B 类)** | 39 修改 | 全部转 patch(017-039 + 001-016),inject 时 `git apply`、`--clean` 时 `--reverse` | `overlay/patches/`(✅ 39 patch) |
| **入口文件** | `main.ts`(client)、`server/index.ts` | `main.ts` 由 §3.3 overlay entry shim 经 alias 完全替代(上游 main.ts 不动);`index.ts` 已归入 patch 008 | shim + patch |
| **品牌资源** | 3 修改(logo.png ×3) | overlay/assets/logo.png + 构建期 asset 覆盖映射 | `overlay/assets/`(✅ 已迁) |
| **生成物/噪音** | 3 修改(openapi.json/package-lock.json/.gitignore) | 丢弃(openapi.json 重生成;lockfile/gitignore 以上游为准) | 不迁移 |

> 55 修改 = 39 patch(实际 39 个文件,含原计划的"骨架/B 类"+"A 类导出"+"UI 侵入点"+"重写型"——分析后全部归 B 类) + 10 i18n(merge) + 3 logo(asset) + 3 gen(丢弃)。覆盖完整,无遗漏。完整往返验证通过:39 patch apply → 39 reverse → 上游 git 历史干净、工作树干净、0 本地 commit。

**关于"上游干净"的精确含义**(混合策略,已验证):迁移后,`upstream/hermes-studio` 的 `.git` 历史**完全干净**(所有本地改动都在 overlay 仓)。工作区在 `inject --clean` 后**完全还原**;`inject` 运行后工作区**含 39 个 B 类 patch 的可逆改动**(未 commit,由 `.overlay-injected.json` 追踪)。custom/(63 文件)、入口 shim、i18n merge、assets 全部经 alias/构建配置接入,这些**不产生上游工作区改动**。


### 6.2 hermes-agent 保持纯净

`upstream/hermes-agent/` 是纯上游仓,**本架构不动它**。其工作区现存的 1 处未提交改动(`hermes_cli/kanban.py`)与未跟踪的 `CLAUDE.md` **不在本次迁移范围内**——不做 stash、不抽取、不纳入 overlay。

理由:hermes-agent 是 Python 上游,其二次开发(若有需要)是独立的课题,不应混入本期前端/Node overlay 架构。若后续确需对 agent 做定制,应另起 spec 设计 Python 仓的隔离机制。本期 hermes-agent 维持原样,作为 `upstream/` 下的只读依赖被 hermes-studio server 调用。

### 6.3 迁移验证标准

迁移完成的判定:
1. `upstream/hermes-studio` 的 `.git` 历史**完全干净**(无本地 commit);`inject --clean` 后工作区 `git status` **完全干净**;`inject` 后工作区**仅有 B 类 patch 改动**(可逆、未 commit、由 `.overlay-injected.json` 追踪)
2. overlay 构建后运行测试套件全绿(功能对等)
3. overlay 构建成功,产物可启动,Matrix 聊天 / Kanban 增强 / Branding 三大自定义功能均可用
4. overlay 仓 `git diff` 清晰反映所有二次开发内容(custom/ + patches/ + registries/ + scripts/),无上游代码混入

### 6.4 目录重命名与旧目录删除

- 现有 `hermes-web-ui/`(实仓,含本地历史)→ **迁出本地成果后**,其上游内容移入 `upstream/hermes-studio/`,目录重命名
- 现有空壳 `hermes-studio/`(仅 .git,新 remote)→ 与 `hermes-web-ui/` 的上游基线合并;保留一个干净的 `upstream/hermes-studio/`(remote 指向 `hermes-studio.git`,checkout `v0.6.18`/`origin/main`)
- **迁移完成并验证对等后(§6.3 全部通过),删除旧目录 `hermes-web-ui/`**——包括其本地分支(`custom/*`、`refactor/*` 等)与整个工作树。最终 `ncwk/` 工作区仅余 `upstream/` + `overlay/` + `docs/` + `.superpowers/`。
- 删除时机以 §6.3 验证通过为准,不在迁移中途删除,确保有回滚余地。删除前确认 overlay 仓已 commit 全部迁出成果。

### 6.5 i18n 运行时合并机制

10 个 locale 文件(de/en/es/fr/ja/ko/pt/ru/zh-TW/zh)各追加了自定义翻译键。处理方式:

- 上游 locale 文件**保持原状**(不注入)
- overlay 的 `custom/client/branding/i18n/` 存放每个 locale 的**增量翻译对象**(只含自定义键)
- `branding` 扩展的 `registerExtendedI18n`(已存在于 `custom/index.ts`)在 bootstrap 时,把增量对象**深合并**进 vue-i18n 的 messages(运行时合并,不写上游文件)
- 上游 locale 升级新增/重命名键时,增量对象不受影响;仅当上游也定义了同名 key 才需人工取舍(预期极少)

### 6.6 替换型组件处理

`KanbanView.vue`(+385/-488)等整文件重写的组件:

- 上游原文件保持不变
- overlay 在 `custom/` 存放重写版
- registry 的 `registerComponent` 在路由层把 `KanbanView` 的路由 component 指向 overlay 版(通过 §3.4 的 `registerRoute` 覆盖上游路由)
- 上游 `KanbanView.vue` 仍存在但运行时不被加载;上游升级它不影响 overlay 版

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 上游入口结构升级导致 overlay shim 失效 | 冲突点集中在 overlay 仓内的 2 个 entry shim(§3.3),不污染上游;inject 报错明确,升级流程含此检查;shim 极薄(re-export + bootstrap 调用),调整成本低 |
| B 类 patch 在上游升级后无法 apply | patch 仅 ~7 文件、粒度明确;inject 用 `git apply`(失败即中止);升级流程提供 `git apply --reject` 重生成步骤(§3.5);每个 patch 独立可单独修 |
| 构建期 alias 配置复杂、难调试 | 派生 config(`vite.config.overlay.ts`)只在上游 config 基础上叠加 alias,不重写;保留上游 config 可独立运行的能力用于对比调试 |
| A 类逻辑抽出工作量被低估 | 迁移按 feature 分批(matrix/kanban/branding),每批先抽逻辑再验证;`CUSTOMIZATIONS.md` 逐条对照;~80 个新增导出已识别明确 |
| 运行时注册改变原有时序/行为 | registry 注册顺序由 `bootstrap.ts` 显式声明;每个 extension 附回归测试(迁现有 `tests/custom/`) |
| asset 覆盖(logo 等)在构建期配置遗漏 | asset 覆盖映射集中在 `bootstrap.ts` 的 `assetOverrides` 声明(§4.4),inject 校验映射的目标文件存在于上游 |
| 迁移期间功能不可用 | 迁移在 overlay 新仓进行,`hermes-web-ui/` 保持可用直到迁移验证通过(§6.3),通过后再删除旧目录 |

## 8. 验收标准(整体)

1. `upstream/` 下三仓 `.git` 历史始终干净;`inject --clean` 后工作区完全还原,`git reset --hard origin/main` 无本地改动需处理(B 类 patch 已逆应用)
2. `overlay/` 是唯一有本地 commit 的仓,其内容(custom/ + patches/ + registries/ + scripts/)= 全部二次开发成果
3. overlay 构建(inject 后:vite/tsconfig 经 alias 重定向入口 + B 类 patch 已应用)启动后,上游应用具备全部自定义功能
4. 模拟上游升级(clean → fetch/reset → re-inject)流程跑通,三自定义功能验证可用
5. `hermes-web-ui/` 旧目录已删除,工作区最终仅余 `upstream/` + `overlay/` + `docs/` + `.superpowers/`

## 9. 后续(非本期)

- 若未来确需对 hermes-agent 做定制,另起 spec 设计 Python 仓的隔离机制(本期明确不动)
- 将 `element-web` 构建脚本(`build-element-web.mjs`)迁入 overlay,使三仓依赖关系统一从 overlay 编排
- overlay 仓的 CI:自动跑 inject + 测试 + 构建
