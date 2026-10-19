# diagram-design 技能吸收：SwarmStudio 图能力六件套（spec）

日期：2026-10-19
分支：`feat/diagram-design-absorption`
来源：用户需求——深入调研 <https://github.com/cathrynlavery/diagram-design>（MIT，v2.6.110，commit 550fd66），完善 SwarmStudio 能力；用户裁定六项全做。

## 调研结论（锚点）

外部技能本体：`SKILL.md + references/（60 篇，45 图型 type-*.md + 9 语义模式 semantic-patterns.md）+ scripts/（self_check.py 机械门禁 29KB、drawio/mermaid/excalidraw 三个提取器、export_svg/export_png）+ assets/（模板与示例）`。核心机制：语义模式先行选图型；设计系统即 token（`references/style-guide.md` 单一事实源，语义色角色 paper/ink/muted/accent/link 等 + WCAG 对比度契约 + 4px 网格 + 复杂度预算）；六条连线硬规则（只正交走线、标签垫不透明遮罩、禁穿非端点方框等）；`self_check.py` fail-closed（禁远程引用/禁 iframe/禁 on* 属性、SVG 可访问性契约 role=img + title/desc 前缀唯一、viewBox 几何裁剪、动画预算、脚本白名单，退出码 0/1）；品牌 profile 机制（`~/.diagram-design/profiles/<slug>.md` 全量 style-guide 快照 + 项目标记 `<root>/.diagram-design`，见 `references/profiles.md`）。

本仓现状对账（锚点）：

- Gen UI 通道已存在：agent 输出 `::visualize` → 沙箱 iframe 渲染自包含 HTML（`custom/client/ide/utils/genui.ts`、`custom/client/ide/views/IdeGenUiPane.vue`），与该技能"自包含 HTML+SVG、禁远程引用"的输出形态同构。
- 技能治理已存在：skillgov 扫描/守卫（`custom/server/skillgov/`）+ skillprovision 供给（`custom/server/skillprovision/`；主机全局库 `~/.hermes/skills/`，期望源中央仓 `~/.hermes/profiles/_shared/skill-provisioning.json`，只增不改、台账回滚）。
- 品牌语义色单一事实源：`custom/client/cockpit/styles/status-colors.ts`（Pure Ink 教义：accent-primary #333、text-primary #1a1a1a、error #c62828、warning #f57f17、success #2e7d32、info #4a90d9；useTheme 运行时注入 `--accent-primary` 等变量，upstream `packages/client/src/composables/useTheme.ts:160`）。
- IDE wiki 用 Mermaid 渲染（`custom/client/ide/utils/mermaid-render.ts`、`IdeWikiPane.vue`）——正是该技能要替代的默认样式。
- 活数据图：Vue Flow（`RunGraphCanvas.vue`、`OrchestrationView.vue` 等）与 ECharts，属应用内实时表面，与"产物图"不同域。
- 报告链：`custom/server/report/part1-skeleton.ts` 等产出 HTML，docx/pdf 衍生走外部 pandoc，图产物无 PNG 通道。
- Node 侧 `@playwright/test` 已在依赖（walkthrough 脚本用 `chromium`，系统 Chrome channel 兜底有先例 `scripts/change-gov-walkthrough.mjs:15`）；Python playwright 未装，`export_png.py` 不能直接用。

## 方案（六项）

### 项1 技能收编

-  vendored 正本入仓 `overlay/assets/skills/diagram-design/`（含 LICENSE、PROVENANCE.md 记录源 URL/commit/版本；剔除 .git）。
- 同步脚本 `overlay/scripts/sync-diagram-skill.mjs`：幂等同步到主机全局库 `~/.hermes/skills/diagram-design/`（内容哈希比对，漂移才重写；原子 rename 先例）；随后执行两项化妆——写入品牌 style-guide（项2 产物，profiles.md 的 copy-over load 语义）+ 安装 `~/.diagram-design/profiles/swarmstudio.md`。
- 中央仓 `_shared/skill-provisioning.json` 注册：roles `orchestrator` / `researcher` / `*-sys-analyst` 各加 `diagram-design`（产文档/图的角色；不进 `*`，避免 49 profile × 5.6MB ≈ 275MB 全量复制）。
- skillgov 扫描验证：对安装后技能跑一次 skill-scan，结论入任务记录；若判 caution 逐条说明可接受理由。
- 测试：`custom/server/skillprovision/__tests__/diagram-skill-vendored.test.ts` 钉住 vendored 正本完整性（SKILL.md/references≥55 篇/scripts 六件/LICENSE/PROVENANCE）+ sync 脚本幂等性（干跑两次第二次零变更）。

### 项2 Swarm 品牌 style profile

- 新仓内文件 `overlay/assets/skills/diagram-design-brand/swarmstudio.profile.md`：完整 style-guide 体 + profiles.md 规定的元数据头（slug `swarmstudio`）。
- token 映射锚定 `status-colors.ts`：light——paper #fafafa、paper-2 #f0f0f0、ink #1a1a1a、muted #666666、accent #333333（Pure Ink 墨色即焦点）、accent-tint rgba(51,51,51,0.06)、rule rgba(26,26,26,0.12)、rule-solid #e0e0e0、link 取 info 系加深至过 4.5:1；dark 另行推导同法。所有文本 token 两皮肤均过 WCAG 4.5:1。
- Font source 定 `system`：Gen UI 沙箱/离线推演环境不发字体网络请求；CJK 沿用技能自带回退栈（PingFang SC 本地解析）。
- 机械验：测试内实现 WCAG 2.x 对比度计算，对 profile 全部文本 token × 两皮肤断言 ≥4.5:1（含 rgba 先合成），等效上游 verify-contrast 的门；改 token 当场 fail。

### 项3 self_check 接入门禁

- 新服务端模块 `custom/server/diagram/`：`self-check.ts` 以 child_process 调 `python3 <vendored>/scripts/self_check.py`（工作区根内路径校验、超时、--offline 开关），解析 `OK/FAIL` 输出为结构化 findings；控制器端点 `POST /api/hermes/diagram/check`。
- 客户端：`IdeGenUiPane.vue` 加「自检」动作，对 .html 图产物调用端点展示通过/失败明细（最小接线，不新做页面）。
- CLI：`scripts/diagram-self-check.sh <file…>` 包装同一路径，供人工/CI。
- 测试：fixtures 一过一败（含 iframe 注入样例），真实跑 python3 self_check（真实工具链先行，§5.1）；端点路径越界/超时/缺文件三负例。

### 项4 报告链 PNG 导出

- `scripts/diagram-export-png.mjs`：`export_png.py` 的 Node 移植（@playwright/test chromium，static frame 校验、viewBox 尺寸钉死、逐祖先 overflow 释放、omit_background、scale 1–4；bundled chromium 缺失时 channel:'chrome' 兜底）。
- 服务端 `custom/server/diagram/export-png.ts` + 端点 `POST /api/hermes/diagram/export-png` {path, scale?} → 同源目录落 `<name>.png`，供报告/docx 衍生链（pandoc）消费；报告验收文档注明用法。
- 测试：fixture 图导出 PNG 真实落盘（magic bytes + 尺寸>0）；无浏览器环境下报错语义明确（不静默成功）。

### 项5 IDE wiki Mermaid 升级

- 服务端 `POST /api/hermes/diagram/mermaid-import`：`mermaid_extract.py` 提取 mermaid 源为 IR（"提取内容、丢弃源样式"），TS 侧 `custom/server/diagram/mermaid-branded.ts` 把 IR 重绘为品牌 HTML+SVG（先支持 flowchart 与 sequence 两类，其余类型如实回退现有客户端渲染并标注）。
- 品牌 token TS 镜像 `custom/server/diagram/brand-tokens.ts`，绊线测试与项2 profile 文件对账防双源漂移。
- 客户端 `IdeWikiPane.vue` 加「品牌重绘」开关：开=走服务端品牌路径，关/失败=现有 mermaid-render.ts 行为不变（默认开或关以实现时风险定，记录在案）。
- 测试：mermaid fixtures → IR → 品牌 HTML 含品牌 token、role="img"、且过 self_check 真跑（门禁吃自己的狗粮）。

### 项6 Vue Flow 活图导出

- `custom/client/ide/utils/diagram-export.ts`：nodes/edges（id/label/position/size）→ 品牌 HTML+SVG（正交连线 r=8 肘、标签遮罩、a11y title/desc、4px 网格取整）。
- 接线 `RunGraphCanvas.vue` 工具栏「导出图」（OrchestrationView 同款若成本允许，否则如实记挂账）；落盘走既有下载通道。
- 测试：纯函数 fixtures → 输出含 viewBox/role="img"/只正交路径/token；并真跑 self_check 通过。

## 决策记录

- D-1 六项一条分支一个收口：六项同属一个用户裁定任务，避免六轮 worktree 顺序收口的机械开销；项内各自独立 commit 保持边界。
- D-2 vendored 正本 + 同步脚本，而非 git submodule/远端依赖：供给链要求源在主机全局库且只增不改；vendored 使 overlay 自包含、可评审、可回滚；PROVENANCE.md 记录上游锚点供日后升级对账。
- D-3 品牌落地走「主机全局库 copy-over load」而非项目标记：agent 工作目录不固定，`.diagram-design` 项目标记覆盖率不可控；主机库即品牌默认皮，凡被供给的 profile 天然带品牌。vendored 正本保持上游原味，化妆只发生在同步后的主机副本，升级对账不受污染。
- D-4 注册角色收窄 orchestrator/researcher/*-sys-analyst：画图是产文档角色的能力，不进 `*` 通用行（49 profile × 5.6MB 全量复制无收益）。
- D-5 Font source=system：沙箱 iframe 与离线推演环境不发 Google Fonts 请求；代价是字形退回平台字（PingFang SC 等），可接受且 self_check --offline 可通过。
- D-6 PNG 导出用 Node playwright 移植而非装 Python playwright：依赖面零新增（@playwright/test 已在仓），与 walkthrough 脚本同链；export_png.py 逻辑小（90 行）移植保真。
- D-7 Mermaid 升级先覆盖 flowchart/sequence 两类：这两类占 wiki 图绝大多数；全类型自动重绘是数天工程量，其余类型如实回退现状渲染，不假装覆盖。
- D-8 self_check 走 python3 宿主直调而非 TS 重写：门禁语义必须与上游技能逐字节对齐，重写即双源漂移；python3 是宿主机既有条件（sync/provision 链已在用）。
- D-9 品牌 accent 用墨色 #333333 而非引入彩色：Pure Ink 教义即"墨色为焦点"，与 status-colors.ts 单一事实源一致；link/soft 等过对比度加深值由项2 机械验锁定。

## 变更清单（终态，随批已全部提交）

- 新增 `assets/skills/diagram-design/`（vendored 技能正本 + LICENSE + PROVENANCE.md；550fd66/v2.6.110）
- 新增 `assets/skills/diagram-design-brand/swarmstudio.profile.md`（Pure Ink token，font source=system）
- 新增 `scripts/sync-diagram-skill.mjs`（幂等同步+品牌化妆+复核）、`scripts/diagram-self-check.sh`、`scripts/diagram-export-png.mjs`
- 新增 `custom/server/diagram/`：self-check.ts、export-png.ts、mermaid-extract.ts、mermaid-branded.ts、brand-tokens.ts、diagram-controller.ts、__tests__×3（36 例）
- patch `666-server-diagram-routes.patch` 挂载 `/api/hermes/diagram/*` 三端点（临时树验证 applies clean）
- `custom/client/ide/utils/diagram-api.ts`、`mermaid-brand.ts`、`diagram-export.ts` + `__tests__`×2（15 例）
- `custom/client/ide/views/IdeGenUiPane.vue`：自检动作+三态结果条
- `custom/client/ide/views/IdeWikiPane.vue`：品牌重绘开关（默认开，失败/不支持回退现状渲染）
- `custom/client/loop/runcenter/components/RunGraphCanvas.vue`：「导出图」按钮
- 测试合计：本批新增 60 例全绿（真实 python3/playwright 工具链，非 mock）

## 实施偏差与挂账（如实记录）

- mermaid 品牌重绘实际覆盖 flowchart / sequenceDiagram / stateDiagram-v2 三类（提取器支持前两类+state，erDiagram 提取器本身不支持→如实 unsupported_kind 回退）；spec 原文"两类"上调为三类。
- 项6 只接线 RunGraphCanvas；OrchestrationView EditorCanvas 同款接线挂账（独立画布体系，另轮）。
- 品牌 token 存在三份（profile 单一事实源 + server 镜像 + client 副本）——已用三方绊线测试锁死一致性；client 副本存在的原因是仓库既有边界「client 不 import server 模块」。
- WikiPane 品牌重绘默认开：失败语义=回退现状渲染内容不丢，风险可控（D-7 原文"以实现时风险定"，定=开）。
- tsc 基线噪音（`@/` alias 在裸 tsconfig 下 1357 处既有错误）与本批无关；本批服务端新文件零类型错。

## 仓外动作（已执行，2026-10-19）

- `~/.hermes/skills/diagram-design/` 安装（sync 脚本真跑，复核 OK；style-guide 已品牌化）
- `~/.diagram-design/profiles/swarmstudio.md` 安装
- 中央仓 `~/.hermes/profiles/_shared/skill-provisioning.json`：orchestrator、*-sys-analyst 各 +diagram-design；新增 *-researcher 行（含 * base 4 防 matchRole 取最具体后期望集回退）；改前备份 .bak-2026-10-19T16-27-37
- 供给真跑：orchestrator / worker-researcher / product-researcher 三 profile 已装（dry-run 先行，9 copied 0 failed）
- skillgov 扫描：verdict=safe（1 条 low=findings 上限如实记界）

## 验证（终态口径）

- 每批 vitest 全绿后才 commit；`custom/client/ide` 全量 120 文件 730 例绿；`custom/server/diagram` 36 例绿；`scripts/diagram-skill.test.ts` 9 例绿。
- 品牌 mermaid 产出与活图导出 HTML 均真跑 `self_check.py --offline` 通过（门禁吃自己的狗粮）。
- PNG 导出真实浏览器链路实证：viewBox 200x100 × scale2 → 400x200 PNG（bundled chromium 缺失自动回退系统 Chrome，walkthrough 同例）。
- 全量 `npm test` + 构建 + inject 重放 + 8647/8649 激活走查：合 main 收口轮执行（见收口记录）。
