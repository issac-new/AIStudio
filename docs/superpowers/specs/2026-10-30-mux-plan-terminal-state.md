# 全流程推演方案终态化（去中间过程产物）与格式规范

## 变更

1. `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md` 按终态表述重写文档层：
   - 删版本号与版本沿革：`V8.x` 全量、文档定位里的现行版本/前版链、按版本列的新增术语、工作台 IA 沿革（V8.37/38/40/41 四段变更史）。
   - 删构建层引用：补丁号、overlay 与 `custom/` 源码锚点、dist/inject 构建指令、工程档案与 spec 文档指针。
   - 删进度叙述：图执行的「已建/待建缺口/分期路线」、各处「首验/已固/清偿批/挂账」状态句。
   - 保留并校正语义：26 步条与六道关卡判据、纪律编号、state 键、交付物模板、报告验收、历轮基线；六阶段完成键表在 §2.5.1 以现状表保留。
2. `scripts/plan-html/enhance.py` 顶部导读卡去掉「历轮事故细节查《推演历史与工程档案》」一句，并去掉黑话「收官」。
3. 文档格式规范化（第二批）：
   - 标题层级：`x.y.z` 三级小节统一 `####`（原 20 处误用 `###`，与父节同级）；`2.6.9`–`2.6.11` 从 `2.9` 之后移回 `2.6.8` 之后，章节序与编号一致。
   - 列表编号：纪律编号跳变处（19 处，如 3→26、17→38）以不可见 HTML 注释分段，使渲染出的序号与稳定 ID 一致（原渲染按序顺延，26 显示为 4）。
   - 空行与空白：标题前/后、表格前/后统一留一个空行；列表项后接新段落（含 24 处「操作指引」标签、总述收束句、收尾判据句）补空行，避免被 GFM 吞成列表项续行；步标题与「这步做什么」、相邻加粗小标题之间补空行；行尾空白清零。
   - 标点统一：全角 `＝`/`／` 改 ASCII `=`/`/`；弯引号 `“”` 改直角引号 `「」`（代码围栏与行内代码内不动）。
   - 名称统一：`Swarm Studio` 统一为 `SwarmStudio`；一级标题定为《SwarmStudio 全流程推演方案》。
4. `scripts/plan-html/render.sh`：标题改为取正本 H1（单一事实源），缺 H1 时回落固定名；目录深度 3 → 4，使 `####` 级小节按正确嵌套进入目录。
5. 渲染注入层随正文对齐：
   - `enhance2.py` 正文 H1 去重改为通用匹配（旧规则按 `swarm-studio-*` 固定 id，改名后失配，页面出现两个标题）。
   - `enhance.py` 导读卡数字与用词校正：纪律数 31→54、「六道硬闸」→「六道关卡」、账号口径 15×2 改「30 matrix 账号（人+AI）」；术语卡删除已不在正文的词（落键/守门/零污染/复跑锚定轮/导演），补入判词、闸键、清场、驱动；悬停释义表同步去重。

## 决策记录

- **判定口径**：中间过程产物＝版本化装置（版本号/沿革/按版本批次注记）、补丁与构建拼装层（patches、overlay、custom/、dist/inject）、工程档案与 spec 指针、以及「已建/待建/首验」进度状态。推演自身的历轮事实（run 编号、基线数字、事故实录）属运行证据，保留。
- **不动的冻结面**：26 步主链、六道关卡判据、纪律编号、state 键与模板字段。方案解析器（`mx-report-gen.py`/`mx-report-audit.py`）依赖的 `**步 N｜标题**`、`**这步做什么**：`、`**交付物及质量判据**：` 三段式保持原样。
- **版本信息去向**：不进正文；需要追溯时以 git 历史为准（方案正本不再承担版本沿革职能）。
- **格式规范口径**：章节编号与标题层级一一对应（`x.y.z` 必为 `####`）；全角/半角按「正文用全角标点、代码与标识符用半角」二分；空白规范以 Markdown 块级元素前后各一空行为准。
- **标题单一事实源**：HTML 标题取正本 H1，避免脚本内硬编码与正文脱节（旧逻辑从版本行提版，版本行删除后失效）。

## 验证

- `python3 scripts/plan-html/jargon-check.py <正本>`：HARD=0（改造前提交态 2 处）。
- 26 步实解析：26/26 齐，`这步做什么`/`交付物及质量判据` 两段标记在位；`**改进项**` 零命中。
- `cd simharness && MX_OVERLAY_ROOT=<worktree> npx vitest run tests/harness-gate-integrity.test.ts -t 四段式`：4 用例通过（含正本 26 步实解析）。
- 表格列数一致性检查：0 处不一致；`§x.y` 引用零悬空。
- 格式检查：`### x.y.z` 残留 0；标题/表格空行缺失 0（代码围栏内的 `#` 注释行不计）；列表项后未分隔段落 0（3 处缩进续行属列表项内部段落，保留）；行尾空白 0；`＝/／/“/”/Swarm Studio` 均 0；标题层级计数 h1=1、h2=6、h3=33、h4=34。
- 注入层核验：页面仅一个 h1；导读卡纪律数 54；`硬闸/零污染/落键/守门/收官` 在渲染正文零命中。
- 渲染产物核验：`<title>` 与 H1 一致；目录中 `2.6.x`、`5.4.x` 按 `####` 层级缩进；正文与注入导读中 `V8./补丁/overlay/工程档案/待建/首验/挂账` 均零命中（CSS 注释内的 overlay 字样不属正文，未计）。

## 设计文档影响

DESIGN_SYNC: none —— 仅改方案正本的表述层、格式层与渲染脚本，不动整合正本的机制、数字总账与版本载体；冻结面（26 步/六闸/纪律编号/state 键）零改动。

## 四、按实际实现校正（2026-10-30 第二批）

核验方式：三路只读对照（IA 注册表、simharness 驱动、产品端点与页签），逐条给出 file:line 证据后改正文。

### 4.1 IA

| 原表述 | 校正为 | 证据 |
|---|---|---|
| 左侧导航五组（含整轮/管理） | 日常侧栏三组（常用/流程/专题）＋页脚系统设置；进入 /app/sim* 切换为推演组 | `custom/client/ia2/components/IaSideNav.vue:2-6,284-423`、`nav-centers.ts:136-168` |
| 六阶段 29/31 签，②含 launch | 37 签：①6/②4/③4/④5/⑤6/⑥12；②无 launch（旧 `?tab=launch` 回退 preflight） | `custom/client/ia2/stage-tabs.ts:30-89` |
| ⑥治理 6 签 | 12 签，补 posture/secAudit/trust/reviewGov/improve/proactivity 并注明三组聚类 | 同上 |
| 全流程推演六签、首签"运行总览" | 侧栏七项；首签"导演台"；补业务地图与导演详情子路由；编排/设置是独立路由而非 `?tab` | `nav-centers.ts:160-168`、`routes.ts:403-461`、`views/sim/sim-tabs.ts:10-27` |
| 旧 `?tab=accounts` 重定向到⑤交付健康 | 删除（accounts 是①现役页签；GovHealthSection 在⑥metrics） | `stage-tabs.ts:34`、`views/stage/StageMetricsPanel.vue:5,13` |
| 旧 /app/gov/* 全部重定向 | 除 settings、model-providers 两个实页外重定向 | `routes.ts:98-99,330-364` |
| 任务协同 `?tab=orchestra` | 落 `?tab=tasks` | `stage-tabs.ts:45-50` |
| 阶段完成键＝界面判定依据 | 键集是 STAGE_META 元数据（run-state/报告口径）；日常界面按看板九态桶推导 | `stage-meta.ts:42-99`、`composables/useDailyStageProgress.ts:2-43` |

### 4.2 数字与参数

| 原表述 | 校正为 | 证据 |
|---|---|---|
| QGate 45 门 | 47 门（48 个 Gate YAML，含 2 模板门+1 插件门，1 处重号） | `custom/qgate/src/cli.ts:134`、`custom/qgate/gate-packs/**` |
| 研发门禁 56 项四族 | 全量 50 门四族；`--all-full` 跑核心 11+架构 18=29 门；合规 19 门另跑 `--compliance-suite` | `simharness/skills/aipaydev-dev/scripts/precheck.sh:605-609` |
| 并发上限 30（GLM-5.3 依据） | 60（`MX_MAX_CONCURRENT` 默认，2026-10-18 由 30 扩至 60） | `simharness/mux/mx-lib.sh:956` |
| MX_FAST 含 p90 动态校准、治理步并发 | 删除两项（仅轮询 5s 与审批扫描 30s 生效） | `simharness/mux/mx-scenario-lib.sh:117-128`、`aipay-scenario.sh:2490-2661` |
| G2 首评 `MX_GATE_WAIT=3600` | `MX_G2_WAIT=600` | `aipay-scenario.sh:857,1085` |
| MX_MODEL_NAME 缺省宿主默认 | 设 BASE_URL 而 NAME 未设时回落 qwen-plus；`MX_FALLBACK_MODELS` 为占位未接线 | `mx-lib.sh:981,1005-1008` |
| 纪律 54 条 | §4.3 收录 83 条（1-74 含 25a/b/c、79-84；75-78 缺号；85/86 在 §5.5） | 正本条款编号实测 |
| 指标注册表 23 项、红队 24 题 | 25 项；红队 36 题+114 变体 | `custom/server/eval/metric-registry.ts:58,291,302`、`redteam-seed.ts:33` |
| GET `/sim/uat-verdict` | POST `/uat-verdict`、GET `/uat-verdicts` | `custom/server/simcenter/simcenter-controller.ts:843,862` |
| 状态锚点 dm_bella_fanfan / anexec_d1/d2 / card_arch_g2 | ba_dm_marker / anexec_d1 / g2_anchor_ts | `aipay-scenario.sh:351,681,829` |
| §2.6.9 引 `mx-interventions.py` | 已退役；改以 `GET /api/hermes/delivery/interventions` 为源 | `docs/superpowers/specs/2026-10-27-sim-governance-convergence.md:47`、`custom/server/delivery/delivery-controller.ts:166` |
| 九层快照"各采一次" | 快照实际覆盖六项端点（其余按需单点查询） | `simharness/mux/mx-harness-snapshot.sh:46-51` |
| `mx-report-gen.py --run 必带` | 建议显式指定，缺省回落 MX_RUN_ID/SIM 根 | `simharness/mux/mx-report-gen.py:36-44` |
| USERS 真源 `mx-lib.sh:145` | 去掉行号（实际 164，避免脆引用） | `mx-lib.sh:164` |

### 4.3 保留但标注实现缺口（未改判据）

- G2 五项目投标注「历史偏差检索由分组记忆与问题台账面执行」；驱动派发词当前只列 4 项（`aipay-scenario.sh:832-835`），属实现缺口，不在正本删判据。
- 账号口径保留 30（15 人 × 双账号）；`mx-setup.sh:110` 跳过 admin-agent 的供给，属实现缺口，已记入交付说明。
- 阶段页 37 签与 `mx-prelaunch-check.sh` 的 31 签断言不一致，属门禁侧 stale，不在正本改回 31。

### 4.4 验证

- 26 步实解析 26/26；四段式标记在位；`harness-gate-integrity` 四段式 4/4 通过。
- 术语门禁 HARD=0；格式检查（标题/表格空行、表格列数）零异常。
- 渲染核验：页面单 H1、26 张步卡、61 张表格；正文 `六签/运行总览/45 门/56 门/29 签/31 个页签` 零命中。
DESIGN_SYNC: none —— 校正的是方案对实现的描述，未改整合正本的机制与数字总账；冻结面（26 步/六闸/纪律编号/state 键）不动。
