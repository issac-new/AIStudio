# ncwk 特征卡（17 项）— 生成于 2026-09-16，swarm-yuan 流A ②

> 数据来源：三路探查报告（结构/规范/代码组织）+ mine-habits 501 提交统计 + detect-frameworks.sh。
> 形态判定（§C+.0）：**[前端UI, 后端API, 桌面IPC(patch 侧)]**；无异步 MQ 消费维度、无库导出维度。
> 框架激活（§C+.0.5）：ACTIVE_FRAMEWORKS = vue / vite / koa / jest-vitest / naiveui（react/webpack/tailwind/express/fastapi/pytest/opentelemetry 信号来自只读 upstream，不在开发面，剔除；opentelemetry 仅在 custom/hermes-agent-plugins/run-trace 4 文件插件面，不激活规则集）。
> 视觉成熟度（§C+.0）：31 个 CSS 自定义属性 + 6 个 scss（BEM 命名）+ 无 DESIGN.md → 场景①（有实现无 DESIGN.md），引用 frontend-design-methodology 的 document 模式。

## P0 六项（强制）

### 1. 项目类型
SwarmStudio 二开 overlay 项目：Vue3 + Koa + Electron 桌面应用的「overlay 注入式 fork」。overlay/ 是唯一开发仓（git），upstream/ 三个只读上游（hermes-studio v0.7.21 / element-web v1.12.27 / hermes-agent v0.21.3）。patch/注入体系本身即项目本体之一（257 个 patch，series 启用 220 条）。

### 4. 技术栈摘要（版本基线）
| 依赖 | 版本 | 来源 |
|---|---|---|
| Vue | ^3.5.32 | upstream/hermes-studio/package.json |
| Vite | ^8.0.4 | 同上 |
| Koa | ^2.15.3 | 同上 |
| vitest | ^3.2.4 | 同上（overlay vitest.config.ts 手写平行配置） |
| naive-ui | ^2.44.1 | 同上（custom 14 文件使用） |
| socket.io | ^4.8.3 | 同上（/loop、/graph、fleet/events、kanban/overview/events 四条 WS） |
| matrix-js-sdk | ^41.8.0-rc.0 | 同上（patch 017/040 注入） |
| echarts | ^6.1.0 | 同上（RunTrace 拓扑） |
| three | ^0.170.0 | 同上（MindViz3D） |
| Node | ≥23.0.0 | overlay/package.json engines |
| Electron | 上游 packages/desktop（custom 零 IPC 实现代码） | — |
| Python 插件面 | custom/hermes-agent-plugins/run-trace（4 文件，otel_formatter.py） | — |

### 5. 构建发布命令
`npm run inject / clean / verify / sync`（注入体系）；`npm run dev`（vite 8649 strictPort）；`bash scripts/serve-server.sh`（后端 8647 ts-node）；`npm test`（vitest 140 文件）；`npm run build`（client bundle）/ `build:full`（openapi→client→server，**发布必须用 build:full，禁用上游 npm run build**）；`build:dmg:mac|win|linux` → 产物 `upstream/hermes-studio/packages/desktop/release/`。端口：8647 后端 / 8649 vite / 8650 agent health（/agent-health 代理）。

### 11. 可复用稳定单元（全量计数）
146 Vue 组件（cockpit 37 / matrix-chat 50 / loop 26 / ia2 18 / kanban 14 / chat 1）+ 12 composables + 11 Pinia stores + 2 非 store 模块 + 14 cockpit adapters + 6 ia2 adapters + 其余 client 工具模块 + 72 个 server .ts（fleet/terminal-tools/trace 3 controllers + loop 引擎 14 + graph 28 + store 6 + matrix 5 + services/hermes 7 + security 1 等）+ 39 条 REST 端点 + 4 条 WS 通路 + registries/client 三注册函数（registerRoute/registerNavEntry/registerComponent）+ 257 个 patch + 14 个 scripts 工具。全量清单落 reference-manual §4/§6/§9。

### 15. 编排调用关系及约束（11 条，各带代码证据）
① patch series 顺序即语义（后序 patch context 依赖前序产物）② custom/server 禁止 import 上游模块——走 factory-DI 由 patch 注入（symlink 相对路径错位）③ vite alias 数组顺序三方同步（vite.config.overlay.ts ← inject.mjs 生成 / vitest.config.ts / patch 000+160）④ 路由双轨纪律（cockpit/matrix-chat/kanban 静态 patch 路由禁止动态 addRoute；loop/ia2 走 registerRoute→bootstrap 统一挂载）⑤ WS 通路三件套（routes/http patch 挂载 + upgrade 白名单 patch 251 + 守门测试）⑥ i18n zh/en 成对 patch 进上游 locale，无运行时 merge ⑦ 共变对（RunTraceTopology⇄computeLayeredLayout、assembly.test⇄graph-assembly、RunTrace 三角、patch 023⇄042 等）⑧ RELEASE-NOTES.md⇄package.json 版本联动（+patch 042/207）⑨ 登录落点四处联动（patch 071/274 + ia2/guard.ts + bootstrap 补查时序）⑩ inject.mjs 路径/前缀双写（apply/reverse 两侧 + config/bootstrap.ts）⑪ GRAPH_ENGINE 三态三面同步（assembly 导出 + GraphEnginePolicyCard + patch 228）。

### 16. 详尽构件库清单
见代码组织探查报告任务一（逐目录全量枚举+计数核验命令），将全量承接进 reference-manual §4（构件表）/§6（39 REST 端点表）/§9（11 store + 类型表）。

## P1 十一项

### 2. 可改范围
仅 `overlay/`。`upstream/` 严格只读（仅 `git pull` 升级）；upstream 变更唯一通路 = patches + `npm run inject`。workspace 根 AGENTS.md:5-11。

### 3. 改造分类
A 类 = 纯新增（custom/ + vite alias + entry shim + 运行时 registry，零侵入）；B 类 = 骨架修改（patches/NNN-desc.patch，构建期 git apply，可 --reverse 还原）；desktop 改动全走 B 类（custom/desktop 仅测试）；i18n 键走 B 类 zh/en 成对 patch。

### 6. 分支规范
基于 overlay main 建 `feat/|fix/|refactor/|docs/|chore/<描述>`；`--no-ff` 合回 main（merge commit 风格 `merge: feat/xxx — 说明`）；commit = Conventional Commits + 中文描述 + scope 括注模块域；tag `v2.x`；分支合入后保留不删（本地惯例）。

### 7. 安全规则
SSRF 出站私网拦截（custom/server/security/url-guard.ts）；路径遍历防护 isPathWithin（trace.ts 内联，不 import 上游）；API_SERVER_KEY 从 ~/.hermes/.env 读取注入 Bearer（inject.mjs:190-213）；零新依赖（plan 级约束）；custom→upstream import 禁令（测试侧镜像 custom/upstream-compat/）。

### 8. 文档约定
docs/superpowers/{specs,plans,notes} + overlay/docs/superpowers/{specs,plans}（两侧并存有分叉，近期落 overlay 侧）；命名 `YYYY-MM-DD-<slug>-design.md` / `YYYY-MM-DD-<slug>.md`；spec = 元信息行 + 主旨 + D 编号决策记录 + 验证；plan = Goal/Architecture/Tech Stack + Global Constraints + Task N（Files 三列 + checkbox 步骤 + TDD 收尾）；RELEASE-NOTES.md 四段式（变更/patch 侧/门禁/产物 sha256）。

### 9. 测试体系
vitest（`npm test`，140 个 *.test.ts，15 个 custom/**/__tests__/ 目录）；client/loop/__tests__ 承载 server 引擎测试（跨层直 import 仅测试豁免）；alias 须与 vite.config.overlay.ts 同步；中文 it 标题 + 工厂 fixture + vi mock 风格；41% 提交触及测试；收口门禁 = npm test + clean&&inject 重放 + build:full + i18n-coverage。

### 10. 环境与外部资源
Node ≥23；三 upstream 仓 pristine 前置；~/.hermes/.env（API_SERVER_KEY）；~/.hermes/traces/（run-trace JSONL）；loop 存储 adapter 三态（local / matrix / saas PG：DATABASE_URL/PGURL/LOOP_PG_URL）；GRAPH_ENGINE=legacy|shadow|on；Matrix homeserver（matrix-js-sdk 直连）；Electron desktop 捆绑 hermes-agent runtime（patch 207 pin 0.21.0）。

### 12. 数据规范
event-log-store append-only（InMemory 默认 / SQLite .loop/graph.db）；kanban.db（mind-projection 直读）；loop state stores 三实现；~/.hermes/traces/*.jsonl（run-trace 事实源）；teams-store JSON 原子写；GraphSpecStore 表。

### 13. 五层认知基底
按目标技能模板承接（认知映射表/六维动力学基线/逻辑谬误图谱/辩证映射表）。

### 14. 领域知识
Matrix 协议（行为镜像 element-web，usernameColor 等）；Electron 打包（electron-builder，afterPack 钩子）；loop 图引擎（BSP super-step / channel reducer / checkpoint）；patch 工程（series 顺序/context 漂移/git apply --reject 解冲突）；跨平台兼容（Windows/麒麟：node-pty/沙箱/cli-shim patch 265-270）。

### 17. 合规与质量特性基线
无行业合规要求（内部工具）。质量基线：140 vitest 文件全绿 + 上游 i18n-coverage 18/18 + 上游 vue-tsc EXIT=0 + inject/clean 幂等重放 + build:full 通过。
