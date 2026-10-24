# 基础运行时层设计:semantica(知识基础设施)+ pua(行为技能)

- 日期:2026-09-23
- 状态:已实施(本文件同时是实施记录与更新 SOP 的权威说明)
- 分支:`feat/base-runtimes` → `main`
- 上游输入:
  - 《AI-Native 研发范式实践手册》电子版(2026-09-19,68 页,OCR 全文调研)
  - [semantica-agi/semantica](https://github.com/semantica-agi/semantica) v0.7.0 源码级调研
  - [tanweai/pua](https://github.com/tanweai/pua) @e6e6cd2(2026-09-09)源码级调研

## 0. 一句话主旨

把手册七大能力框架中当前项目缺失最重、且外部已有成熟开源运行时的两个能力位
——**企业知识库**与 **Agent 技能体系**——以受管 pin 的方式接入 SwarmStudio,
形成 `overlay/runtime/` 基础运行时层;接线全部走项目既有的 patch/目录清单机制,
不动 agent 内核代码,后续上游演进只需 bump pin。

## 1. 为什么要这两个运行时(差距分析)

手册第三章把企业级 AI 研发基础设施拆为七个能力位。逐位对照 SwarmStudio 现状:

| # | 手册能力位(章节) | SwarmStudio 现状 | 差距 | 本轮动作 |
|---|---|---|---|---|
| 1 | Agent Harness:上下文管理/规划恢复/工具纠错/人机协同(§3.1.1) | hermes-agent 原生具备(harness 本体) | 无结构性缺口 | — |
| 2 | 企业知识库:整理→加工→治理→供给(§3.1.2) | **缺失**:无图结构知识层、无决策溯源、无跨会话组织记忆 | 大 | **semantica 运行时** |
| 3 | 工具体系 MCP/Skill/CLI + 命中率/成功率评测(§3.1.3) | MCP 走 hermes 目录清单;Skill 有装载机制但**缺高质量通用技能资产**;评测缺位 | 中 | **pua 技能集**;评测列入路线 |
| 4 | Sandbox:生命周期/执行面/网络与凭据边界(§3.2.1) | 桌面态本机执行;模拟轮用 Docker 网关 | 隔离粒度不足 | 路线(§7) |
| 5 | Coding 环境:项目运行上下文/依赖适配器/环境反馈(§3.2.2) | overlay 的 inject/clean 即"环境定义"、npm 门禁即"验证清单" | 部分具备 | 路线:显式化为环境定义 |
| 6 | Identity & Policy:复合身份/最小权限/Credential Broker(§3.3.1) | hermes 有 profile/API key 隔离;无委托语义 | 中 | 路线 |
| 7 | Guardrail:Spec+ChangeSet+三态 Evidence 门控(§3.3.2) | 项目门禁(tsc/test/build)是静态版;生产动作门控缺位 | 大 | 路线(§7) |
| 8 | 可观测:System + Behavior(Trajectory)(§3.4) | RunTraceView 覆盖运行轨迹;行为语义层初步 | 中 | 路线 |

两个选型均满足四条硬标准:MIT 许可、可本地运行(零 API key)、pin 后可复现、
与 hermes 生态有原生接入面(MCP 目录清单 / SKILL.md 技能格式)。

### 1.1 semantica 承载能力位 2(企业知识库)

源码调研关键结论(锚点为上游仓库):

- 运行时形态:Python 库 + CLI + REST + **MCP stdio server**(`semantica-mcp`
  console script,15 工具(实弹 tools/list 核对):`extract_entities/extract_relations/record_decision/
  query_decisions/find_precedents/get_causal_chain/add_entity/add_relationship/
  run_reasoning/get_graph_analytics/export_graph/get_graph_summary/query_graph/
  update_node/delete_node`)。
- 零外部依赖路径:内存 ContextGraph + 图分析开箱即用,`SEMANTICA_KG_PATH`
  可选持久化 JSON(`semantica/mcp_server/__init__.py:38-39`);抽取默认
  pattern/regex 本地模式,LLM 模式按 extras 另装。
- 版本:v0.7.0(2026-09-22 发布,唯一 tag);迭代极快(日级),故必须 pin。

映射手册 §3.1.2:知识加工(实体/关系抽取+图构建)→ 知识治理(冲突检测/溯源
PROV-O 导出)→ 知识供给(MCP 工具面)三层齐备;`record_decision/trace` 直接
落手册反复强调的"决策可追溯"。

### 1.2 pua 承载能力位 3(技能资产)

- 源是 `skills/`(12 个技能目录,含 439 行主契约 + 29 个 references 文件:
  15 家方法论/话术词库/降压协议/治理拓扑);其余顶层目录全是各客户端适配产物。
- 与 hermes 技能格式同构(目录 + SKILL.md frontmatter);上游官方对 hermes
  仅"半支持"(社区 PR 的单文件包),故我们直接从 `skills/` 源 vendor,不依赖
  其适配层。
- 价值内核(与手册对应):调试方法论五步法(闻味道→揪头发→照镜子→执行→复盘)、
  抗借口表、L0-L4 压力分级、主动性三铁律 —— 对应手册 §2.1"Agentic 核心是
  自主获得验证信号"与 §3.1.3"Skill 沉淀任务方法"。

## 2. 架构与设计决策

```
overlay/runtime/(单一事实源,受管镜像)
├── semantica/manifest.yaml ──patch 375──▶ hermes-agent optional-mcps/semantica/
│                                            (目录清单,"presence = approval")
│                                            studio MCP 浏览器 + hermes mcp install
└── pua/
    ├── PIN.yaml(commit e6e6cd2 + 技能清单)
    └── skills/(12 技能)──register──▶ <HERMES_HOME>/config.yaml
                                      skills.external_dirs(只读挂载)
```

### D1 semantica 走 MCP 目录清单,不改 agent 代码

一条 manifest 获得全链路(发现/安装/探测/工具清单/回滚),零 hermes-agent 代码
改动。安装 = `git clone` pinned tag + 独立 venv + `pip install .`(与 agent 运行
环境完全隔离);transport stdio `${INSTALL_DIR}/.venv/bin/semantica-mcp`。

### D2 pua 走 `skills.external_dirs`,不复制进 profile

外部目录语义:只读共享、本地优先。升级只更新 overlay 一处,全部 profile 生效,
不存在多 profile 逐份复制的漂移面。注册幂等(`register-runtime.mjs`,注释保留式
YAML 往返)。

### D3 双 pin 不可变 ref,doctor 拒绝浮动

semantica pin tag `v0.7.0`;pua pin 40 位 commit `e6e6cd2…`。`runtime-doctor.mjs`
硬检查拒绝 `main/HEAD` 浮动 ref —— "可复现环境"(手册 §2.1)在本层的落法。

### D4 单一事实源 ↔ patch 逐字节对账

`runtime/semantica/manifest.yaml` 是源;patch 375 内嵌副本是派生物。doctor 与
守门测试双重校验两者逐字节一致 —— 改了一边忘另一边,门禁当场失败(防"改已记账
patch 后 inject 跳重放"一类历史坑的同类复发)。

### D5 路由收敛(重构)

`optional-mcps/`、`optional-skills/` 前缀此前不在 inject.mjs 路由表内。借此把
**三处**重复的前缀判断(inject.mjs apply/reverse + ensure-injected.mjs)收敛为
`inject.mjs` 导出的 `HERMES_AGENT_PATCH_PREFIXES` + `isHermesAgentPatchPath()`
单一事实源;守卫测试从"两处文本一致"升级为行为断言(直接 import 清单 + 断言
ensure-injected 不再内联)。

## 3. 交付物清单

| 交付物 | 路径 |
|---|---|
| 运行时层总览 + 更新 SOP | `overlay/runtime/README.md` |
| semantica 目录清单(源) | `overlay/runtime/semantica/manifest.yaml` |
| pua 镜像(12 技能 + PIN + ATTRIBUTION) | `overlay/runtime/pua/` |
| B 类 patch(清单注入 hermes-agent) | `overlay/patches/375-runtime-semantica-mcp-catalog.patch` |
| vendor 脚本(pua 同步 + frontmatter 规范化) | `overlay/scripts/runtime/vendor-pua.mjs` |
| 注册脚本(external_dirs/状态) | `overlay/scripts/runtime/register-runtime.mjs` |
| 健康门禁(硬检查 6 项 + 软检查) | `overlay/scripts/runtime/runtime-doctor.mjs` |
| npm scripts | `runtime:doctor` / `runtime:vendor-pua` / `runtime:register` |
| 守门测试(21 例) | `overlay/custom/server/runtime/__tests__/base-runtimes.test.ts` |
| 路由收敛 | `scripts/inject.mjs`(谓词导出)/ `scripts/ensure-injected.mjs`(复用) |
| 守卫升级 | `custom/server/__tests__/ensure-injected-delta-guard.test.ts` |

## 4. 验证记录(2026-09-23 回归)

| 门禁 | 结果 |
|---|---|
| vitest 全量 | **241 文件 / 2308 用例全绿**(含新增 21 例守门) |
| `npm run build:full`(openapi+vite+**tsc --noEmit**+server) | 通过 |
| clean→inject 全循环 + `npm run verify` | 三 upstream 树 pristine 复原;375 实际应用,与源逐字节一致 |
| manifest 过 hermes 官方解析器 | `list_catalog()` 66 条含 semantica,`catalog_diagnostics()` 空 |
| `runtime:doctor` 硬检查 | 6/6(schema/PIN 对账/patch 一致性/可应用性) |
| 真实安装 + MCP 握手 | 见 §5 |
| dev 环境 | clean/inject 循环致 vite 卡重启态,已重启恢复(vite 200 / 后端 200) |
| pua 实弹装载 | `hermes skills list` 12/12 enabled(修复前 11/12) |
| semantica 实弹安装+握手+读写闭环 | 全通(见 §5) |

## 5. 真实链路验证(工具链先行)

在一次性 scratch home(`/tmp/hermes-rt/.hermes`)以
`HERMES_OPTIONAL_MCPS` 指向本仓库 optional-mcps 执行真实安装:
`hermes mcp install semantica` → clone v0.7.0 → venv → pip → 写入
`mcp_servers.semantica`。

**实弹抓到并修复的缺陷**:首版 bootstrap 用 `python3 -m venv`,本机默认
python3 为 3.14.7,超出 semantica 的 `<3.14` 上限(gensim 无 cp314 wheel),
pip 直接拒绝。修复为解释器回退链
`python3.13 || python3.12 || python3.11 || python3.10 || python3`,
实装验证 venv 落在 Python 3.13。该缺陷纯靠"结构看起来对"的静态检查不可能
发现,是「真实工具链先行」红线的直接收益。

**踩坑记录(改已应用 patch 的正确次序)**:更新 patch 375 前必须先 `npm run
clean`(反向旧版)再覆写 patch 文件,否则 clean 反向失配、旧文件残留为未跟踪
文件,后续 inject 永远 "already exists"。诊断入口:`runtime-doctor` 的
"对 hermes-agent 可应用"检查会当场失败;恢复 = 删残留 → clean → inject 全循环。

**实弹抓到并修复的第二个缺陷(pua)**:首次注册后 `hermes skills list` 只见
11/12 —— 上游 `yes` 技能 frontmatter 写了裸 `name: yes`,hermes 的 YAML 1.1
解析器(pyyaml)把它读成布尔 True,扫描时 `True.lower()` 抛错被静默跳过。
修复:vendor 脚本同步时对 frontmatter 布尔裸值最小规范化(加引号),改动
记录进 PIN 的 `normalized` 段,守门测试锁定(上游修复后该段回归为空即撤销
规范化)。复验:`hermes skills list` **12/12 全部 enabled**。

**最终实弹结果**(scratch home `/tmp/hermes-rt/.hermes`,用后即弃):

- `hermes mcp install semantica` 全链路成功:clone v0.7.0 → venv(Python 3.13.0)
  → pip → 写入 `mcp_servers.semantica`,post_install 提示正常输出。
- MCP stdio 握手:initialize 返回 `semantica 0.7.0`;`tools/list` 15 工具。
- 读写闭环:`add_entity`×2 → `add_relationship`(RUNS_ON)→ `record_decision`
  (返回 decision_id)→ `query_decisions` 回读 → `get_graph_summary`
  node_count=5/decision_count=1。
- `register-runtime.mjs` 幂等(二次运行跳过);`runtime:doctor --hermes-home`
  软检查正常报告注册/安装态。

**注意**:PATH 上的 `hermes` 是用户安装版,默认读自身安装目录的目录清单;
验证仓库侧清单须显式 `HERMES_OPTIONAL_MCPS=<repo>/upstream/hermes-agent/optional-mcps`。
桌面端装机后 patch 375 随 hermes-agent 打包进应用,无此问题。

## 6. 更新 SOP(后续持续更新)

semantica 升版:改 manifest `install.ref`(新 tag)→ 重生成 patch 375 →
`npm run clean && npm run inject` → `runtime:doctor` → 用户侧重装。
pua 追上游:`npm run runtime:vendor-pua -- --ref main` → `runtime:doctor`。
profile 注册:`npm run runtime:register -- --hermes-home <path>`(幂等)。
详见 `overlay/runtime/README.md`。

## 7. 后续路线(本轮未覆盖,按手册差距排序)

1. **Guardrail 门控(能力位 7,差距最大)**:把 GuardrailSpec(版本化 YAML)+
   三态 Evidence 协议引入 overlay 的发布/装机链路,替代"跑完测试即放行"的
   隐式门控 —— 项目的 tsc/test/build 门禁天然是首批 Check 清单。
2. **技能/MCP 命中率与成功率评测(能力位 3 后半)**:agent 会话轨迹里埋
   skill/mcp 调用事件,按手册 §3.1.3 量化"会不会用、用不用得成"。
3. **Coding 环境显式化(能力位 5)**:把 inject/clean/门禁打包为手册 §3.2.2
   的"项目运行上下文"声明文件(runtime/setup/verification 一份 YAML)。
4. **Trajectory 行为层(能力位 8)**:RunTraceView 扩 Step 语义
   (Model Call/Tool Call/Skill Execution/State Change),对齐 ATIF。
5. semantica 进阶:启用 `SEMANTICA_KG_PATH` 跨会话知识沉淀 + LLM 抽取 extras,
   喂入项目文档/推演证据,形成手册 §3.1.2 的组织记忆闭环。
