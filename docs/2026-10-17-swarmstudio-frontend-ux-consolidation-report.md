# SwarmStudio 前端 UI/UE/UX 复盘与一致性重构报告

日期：2026-10-17
来源：用户指令「复盘 swarm studio 当前所有页面及功能，进行重构优化（从专业前端 UI UE UX 的角度）」，方案经 plan mode 批准（spec：《2026-10-17-frontend-ux-consolidation-redesign.md》）。
分支：`feat/frontend-ux-consolidation`，提交链 c39ed277（i18n 守门预存修复）→ 5c38a765（批A）→ 2652abb4（批B）→ bb010da9（批C）→ aa317ac1（批D）。

## 结论

四个游离于设计系统之外的域（governance、ide、sim、matrix-chat）已全部收编进主题跟随的 token 体系，暗色主题亮色块破相这一最大病灶经活体走查确认根治；全量测试 4808/4808 绿、构建通过；机械闸（raw hex 预算 + 幽灵变量断言）入测试套件防复发。

| 指标 | 修复前 | 修复后 |
|---|---|---|
| custom 域裸 hex（非 fallback、非定义行） | 605 | 117（全部为终端 ANSI/ECharts 分类色板等与主题解耦的固定常量） |
| CSS 段裸 hex | 约 500 | 0（ia2/governance/matrix-chat/matrix-teams/loop/eval 六域清零） |
| 死 var() fallback（upstream 全局变量） | 约 1700 | 0 |
| 幽灵变量（带 fallback 但全仓无定义） | 25 个 | 0（守门断言防新增） |
| 空态实现 | 十余套平行 | 1 套共享类 + 组件（72 处迁移） |
| 全量测试 | 4796 过 / 6 败（含 1 个真红守门） | 4808 过 / 0 败 |
| 未处理渲染错误（computed 防御缺失） | 5 | 0 |

## 一、复盘范围与方法

复盘覆盖三层。路由层：`/app` 树 45 条路由（旅程页、六阶段、推演六签、治理七签、工作页）＋30 条并入 legacy 页＋4 个独立工作台（bpa/ontology/eval/skillgov）＋IDE＋matrix，共 80 余条页面记录。设计系统层：upstream Pure Ink（`variables.scss` 唯一正本＋naive-ui 主题）→ overlay 三处局部 token（ia2/cockpit/matrix-chat）→ 运行期用户自定义的「三层联邦」。改造成果层：V1-V3 视觉语言、D13/D18 旅程式 IA、U1/U2 可用性批（均验收全绿，本轮不动）。

方法为双通道。代码层：属性感知的映射扫描（色值→属性语境→token 映射表）产出全量证据清单；活体层：worktree dev server（8649）＋无头浏览器对 15 余屏做亮暗双主题走查，视觉模型判读＋控制台错误采集，截图入仓（`docs/superpowers/assets/2026-10-17-ux-consolidation/`）。

## 二、发现的问题（修复前）

**P0 主题一致性破相（功能性缺陷，暗/亮主题下视觉断裂）**

1. governance 整模块脱离 token 体系：88 处 raw hex、Tailwind 色板、亮色假设。`StateModelSection.vue:86-92`（#b91c1c/#fee2e2/#1d4ed8/#dbeafe）、`EfficiencyRuntimeSection.vue:231-248`（#2563eb 实底按钮/#eef0f4）、`LedgerSection.vue:174`（#b45309/#fef3c7）。暗色主题下整片浅色块。
2. ide 亮色主题交互失效：`IdeMetricsPopover.vue:560`、`IdeGitPane.vue:386`、`IdeModelSwitcher.vue:264,290` 的 `rgba(255,255,255,0.03-0.06)` hover 在亮底不可见；`IdeModelSwitcher.vue:290` fallback `#18a058` 为 naive-ui 绿非 Pure Ink。
3. matrix-chat 四对话框白透明边框（`MatrixExportDialog.vue:210` 等，`rgba(255,255,255,0.3)`）。
4. sim 域第二套状态色与已校准 `--ia-*` 并存：`SimAnchorDrawer.vue:58-81` 固定深色面 #1d1f23、`SimInterventionCard.vue:114-123`（#d9a441/#d9b06a）、`SimStepBadge.vue:34`；另有旧失败色 `#d33` 残留 35 处（校准前值，D7 记档应换 #e06666）。
5. ia2 壳层硬编码：`IaGlobalTop.vue:109-112` 八色 chip 亮色假设、`AttentionStrip.vue:114`（#61afef）、`SitDetailPanel.vue:535`、`NotifyDropdownPanel.vue:233`。
6. ECharts 语义色切主题不失效：`cockpit/styles/status-colors.ts:73` 的 `invalidateStatusColorCache()` 全仓零调用，`studio-theme-change` 事件 overlay 内零监听。
7. 25 个幽灵变量（`var(--warning-ink, #92400e)` 类：变量无定义、fallback 恒生效＝变相裸 hex），重灾区 ide 域 `--text-color-1/2/3` 达 122 处。

**P1 组件复用缺失**：空态十余套平行实现（`gss__empty`/`sitp__empty`/`sm__empty`/`ide-*__empty` 等各自为政）；状态色双轨（cockpit `STATUS_COLORS` 语义九态与 `--ia-*` 流水线五态无桥接）；抽屉三套（记档边界，不做结构合一）。

**P2 token 卫生**：约 1700 处 upstream 全局变量的死 fallback（494 别名族后已无作用，是漂移源）；无机械门禁拦新增裸 hex（`visual-shell.test.ts` 只守 token 值本身）。

**P3 走查确认项**：审批历史决策值 `reject` 词表未收录（zh 回落 en，控制台 intlify 警告）；`ClearancePanel.vue:20`/`GatekeeperSection.vue:26` computed 对「对象存在但 rows 非数组」无防御（全量套件 5 个未处理渲染错误）。

## 三、修复内容（四批）

**批 A（5c38a765）主题一致性根治**。属性感知 codemod 按映射表替换。映射决策：红系文字→`var(--error)`（亮 #c62828 对白 5.9:1、暗翻转 #ef5350，双主题可作文字色），绿系→`var(--success)`，琥珀文字→`var(--ia-stale)`（`--warning` 亮色 #f57f17 仅 2.1:1 不可作小字色，决策记录 D-1），浅色底→同族 `rgba(var(--X-rgb), 0.08-0.12)`，实底按钮→`var(--accent-primary)`＋`var(--text-on-accent)`。改造范围：governance 450 处，ide/matrix-chat/sim/ia2 壳层/kanban 定向修复。ECharts 主题联动桥 `cockpit/styles/theme-bridge.ts` 双通道接 `invalidateStatusColorCache()`：`studio-theme-change` 事件＋MutationObserver 盯 class（亮暗切换只翻转 class 不派事件，单靠事件有盲区），ia2/cockpit 双落点幂等导入。幽灵变量 25 个全部映射或落地定义（`--cpd-*` 借名落地 `--mx-*` token）。守门测试 `raw-hex-budget.test.ts` 双断言入套件。

**批 B（2652abb4）共享 UI 基元**。新建 `custom/client/ui/`：`UiEmptyState`（title/hint/action 槽＋compact/boxed 档）、`UiStatusPill`（语义九态×流水线五态统一入口，color-mix 同族透明底/边）、`status.ts` 桥（cockpit `STATUS_COLORS` 正本再导出＋`--ia-*` 五态映射）。72 处平行空态迁移到 `.ui-empty-state` 共享类（71 文件，按原样式体量判 compact 档）。ui.scss 挂 ia2/index.ts 全局装载（ia2 注册无门控＝全局面可用）。测试选择器随迁 4 套。

**批 C（bb010da9）token 清扫收尾**。全域死 fallback 剥离约 1700 处；IDE 微色板同族映射（#4cc9f0 运行 cyan→accent-info、#f0a44c 琥珀→ia-stale、One-Dark 轨迹色→五态/语义 token、`IdeTurnRail`/`IdeContextBar` 色板改 var() 字符串——inline style 消费 var() 可行）；sim 旧色板变体归一；预算压终态 117（全部为与主题解耦的固定常量：终端 ANSI 色板 55＋ECharts/G6 分类色板 62）。

**批 D（aa317ac1）走查快赢**。computed/模板三处防御补齐；`approvals.choice.reject` 走运行时术语覆盖通道补键（零 patch，i18n 覆盖守门自动纳入）。

## 四、验证

- 测试：vitest 全量 4808/4808 绿（worktree 跑法须 `MX_SIMHARNESS_ROOT=/Users/cuishi/lab/ncwk/simharness`——delivery 契约与 raci 白名单两套测试按「overlay 根上一级/simharness」解析路径，worktree 内解析到已删除的 `.claude/worktrees/simharness` 死路径，属 2026-10-17 双删事故余波的环境性问题，非产品缺陷）。
- 构建：`npm run build` 通过，verify-dist 出厂默认口令扫描零命中。
- 走查：15 余屏亮暗双主题，视觉模型判读全部「未发现破损/破相」；治理中心暗色页（历史病灶现场）判定亮色块问题已根治；BPA 墨色主强调统一无蓝色残留割裂；看板空态（迁移后）虚线框显示正常。主题 class 往返切换控制台零新增错误（桥接活体验证）。截图证据 9 张入仓。
- 防复发：`raw-hex-budget.test.ts` 目录级预算 ratchet（未列目录默认 0）＋幽灵变量断言（带 fallback 的 var 必须真实有定义，运行时注入变量 `--cluster-color`/`--vh` 显式 allowlist）；`ui-primitives.test.ts` 守基元取色单一事实源。

## 五、边界与遗留

**本轮不做（spec Non-goals，均有既有裁决）**：IA/导航/路由结构（D13/D18 定稿、V8.37 刚对账锚定）；upstream 视图本体（零新 patch）；naive-ui 受控混用现状；keep-alive（既有裁决不上）；抽屉三套结构合一（成本高于收益）。

**保留的 117 处固定常量（预算表 allowlist，理由在测试文件头注）**：终端 ANSI 色板（xterm 惯例不随主题）、ECharts/G6 分类节点色板（canvas 不吃 var()）。若后续要图表分类色也随主题，路径是逐图表接 `resolveNeutrals()`，属新任务。

**走查发现的存量设计议题（观察项，非缺陷，未动）**：左栏侧边条 AK 彩色 logo 与整体灰度风格差异大；工作台右栏「任务·决策」信息密度高、分组层次可再加强；顶栏标签页+筛选+搜索并排在一行内偏挤；治理页签「签 N」序号与页签名并列对新手可读性一般（术语正本裁定沿用）。

**预存环境项（非本轮引入，如实记档）**：simharness 关联端点 503 fail-closed（推演未起跑时的如实显示）；kanban events WebSocket 重连错误；隐藏容器 ECharts 零尺寸警告；主 overlay 树上 i18n 覆盖守门红（ia-residuals 批引入，本分支 c39ed277 已修，合入即愈）。

## 六、走查记录

| 屏 | 亮色 | 暗色 | 判定 |
|---|---|---|---|
| 旅程首页 /app | ✓ | ✓ | 无破损 |
| ①搭建 /app/stage/setup | ✓ | ✓ | 无破损 |
| 推演中心 /app/sim（含监督面板） | ✓ | ✓ | 无破损；主题往返切换零新增错误 |
| 治理中心 /app/gov（含清偿门） | ✓ | ✓ | 历史病灶（暗色亮色块）确认根治 |
| 看板 /app/board | ✓ | ✓ | 无破损；空态迁移后形态正常 |
| 审批收件箱 /app/inbox | ✓ | — | 无破损；旧失败色 #d33 替换后渲染正常 |
| 工作台三栏 /app/collab | ✓ | ✓ | 无破损 |
| 智能体 /app/agents | ✓ | — | 无破损 |
| 设置 /app/settings | ✓ | — | 无破损 |
| IDE /app/ide | ✓ | ✓ | 无破损；亮色 hover 修复后可感知 |
| BPA /app/bpa | ✓ | ✓ | 墨色主强调统一，无蓝色残留 |
| 本体 /app/ontology | ✓ | — | 无破损 |
| 技能治理 /app/skillgov | ✓ | ✓ | 无破损 |

（✓＝采集截图并判读；「—」＝单主题抽采。证据目录：`docs/superpowers/assets/2026-10-17-ux-consolidation/`，另全量 25 张存 /tmp/ux-walk。）
