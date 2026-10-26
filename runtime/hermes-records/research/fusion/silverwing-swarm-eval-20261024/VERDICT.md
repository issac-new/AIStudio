# 融合裁决：多 Agent 群体协作评测基准设计方法（银翼）→ hermes agent teams

> 路由：routed:heavy:tier=T1（TUI 直执行，工具调用 20+，留痕卡随收尾补建）。执行日 2026-10-24。
> 源文：mp.weixin.qq.com/s/HmpSLcKRSd8Xr6b9RMFTpQ《多 Agent 群体协作的评测基准设计方法》（公众号「银翼」，全文 16977 字符，存档本目录 article-full.txt）。
> 方法：article-methodology-fusion 六步。全文通读（17K 字符一次读毕），机制清单 16 组，逐行裁决。

## 一、同源已收基线（防重复融合）

「银翼」账号三条已收基线，本文裁决前逐一核对：

1. **wx-onto-ddd-20261021 account3 八篇**（reports/account3-silverwing-verdict.md）：全部为单 Agent 评测方法论（假通过模式/LLM-as-a-Judge/四层评测/OpenAI Evals 拆解），收 X1-X3 + E1-E10。本文 URL 与标题关键词在该语料 manifest 零命中——**不在已收语料，按同源新文增量裁决**。
2. **wechat-swarm-teams-20261021 EV 篇**（OpenAI Evals 拆解，已落 baseline.md H3.7）：EV7 认知死锁（单 Agent 工具层死循环签名）已收。本文「认知死锁率」是 **Agent 间互相等待**（调度层），与 EV7 是两个层次——本文裁决只认「层次区分 + 结构性在位」，不重复收工具层判据。
3. **jd-agent-eval-20261023 京东篇**：Y1 稳定性复跑 / Y2 案例晋级已收，与本文机制面无重叠。

现状扫描：12 个核心机制关键词（通信开销/Shapley/拜占庭/回音壁/信用分配/混合动机/语义熵/意图保真/认知死锁/蜂群/反事实贡献/夏普利）在 `_shared/` 五个核心事实源（baseline.md / ontology.md / agent-observability.md / agent-governance-baseline.md / review-gates.md）精准 grep **全部零命中**；数据面（clef-decisions.jsonl / kanban events / state.db）无 MOR/协作健康类指标积累。无重复融合风险。

## 二、裁决矩阵（16 组机制 → 5 收缩吸收 / 8 等效印证 / 3 显式不吸收）

### A. 收缩吸收——5 项

**SW1 通信开销比 MOR → baseline.md 新指标 M1**
- 语料锚：「完成同等任务时 Agent 间交换 Token 数与单 Agent 的比值，防『开会 10 小时，干活 5 分钟』；冗余开销 10 倍以上=严重低效」。
- 断链实锤：P3 测单卡 token 成本（生产面），无「协调侧 ÷ 生产侧」比值——orchestrator/网关的派卡、催办、回执聚合开销从未被单独计量。
- 落地（收缩依据：逐任务全量计量在本集群成本不可承受，收缩为周窗口观察值）：M1 = 周窗口内协调侧 token（orchestrator profile + multiplexer 网关会话）÷ worker 生产 token，数据源 state.db sessions 表 + token-meter 实测口径（禁估算）。无硬阈值，首轮建基线；跳升 >3× 须归因（同 P 集「跳升归因」语义）。
- 成色：语义+机制落地（判据与数据源写入 baseline.md M 节）；效力待首轮实测；周报自动化接线未建，随 SW16 gap 一并登记（不静默降级）。

**SW7 协作摩擦/返工率 + SW10 反事实贡献度（Criticality）→ baseline.md 新指标 M2**
- 语料锚：「统计 Reviewer 驳回 Developer 的次数（PR Rejection Count），驳回过多=通信效率或前期规划缺陷」；「移除某 Agent 后成功率无变化甚至上升=负贡献/冗余 Agent，可直接剔除」。
- 断链实锤：kanban DB 有 request_changes 事件与 [REJECT:FM] 打回留痕，但从未被聚合为「评审摩擦率」；「某角色产出从未被下游消费」无审计入口。
- 落地（收缩依据：Leave-One-Out 全量消融=每角色重跑全部任务，成本不可承受；Shapley 全组合同理——收缩为**可机械统计的定性代理**「零驳回角色审计」）：M2 = 打回率（request_changes 事件数 ÷ 交付卡数，按 worker 角色）+ 零驳回审计（某 reviewer/tester 角色连续 ≥10 张参与卡零打回且零缺陷逃逸 → 触发角色必要性审计：查该角色产出是否被下游真实消费）。零驳回≠必然冗余（上游质量高也会零驳回），判据只触发审计不下结论。
- 成色：语义+机制落地（判据在位，kanban DB 事件可查）；效力待首次触发审计。

**SW13 拜占庭故障注入 → guardrail-regress manifest known_uncovered 第 6 条**
- 语料锚：三攻击模式——恶意错误注入（带漏洞代码伪装通过评审）/噪声污染（高频广播瘫痪上下文）/分化颠覆（向核心决策 Agent 发送心理暗示诱导自疑）；BCR/AIL 两指标。
- 断链实锤：单点防御在位（worker-completion-independence-verification 防自述造假、prompt-injection-guard 守入站、Guardian 二审高危命令、负例探针守写路径），但**跨 worker 污染扩散**（上游 worker 被污染产出→下游全盘信任执行→穿透验收）无探针、无演练、无边界声明。
- 落地（收缩依据：注入演练管线与 BCR/AIL 量化在集群无运行面，全量吸收成本不可承受——收缩为边界声明 + 向量登记）：known_uncovered 增补第 6 条「蜂群拜占庭注入」，声明单点防御在位与系统性注入缺口并存；探针实现另卡（依赖 SW16 harness）。
- 成色：语义落地（边界声明在位）；机制/效力待 harness。

**SW16 swarm-eval 六层工程蓝图 → 设计文档 gap 登记（gap-20261024-swarm-eval）**
- 语料锚：六层架构（任务→编排→蜂群→Trace 拦截→评分→聚合）；三条设计原则（拦截层唯一旁路无侵入/评分纯函数可重放/被测对象协议解耦）；五步落地顺序（假 Agent 调框架→单 Agent 闭环→拓扑对比→拜占庭实验→Shapley）；坑（Token 计数取 API usage 字段，禁 split 估算）。
- 断链实锤：P 集是单卡回归面，集群无蜂群级协作评测器；M1/M2 指标有判据无自动化接线。
- 落地：按建设期纪律（缺口登记 gap 禁静默降级、不擅建基础设施），登记 gap-20261024-swarm-eval，文章的三原则/五步序/usage 计数坑/目录蓝图全文随本报告存档——未来实现直接引用，省重调研。翻案条件：M1/M2 首轮实测显示协调开销失控，或多 worker 联合产物归因争议频发时，优先级上调。
- 成色：gap 登记（合法成色，非静默降级）；设计约束已存档。

**SW10 补充说明**：Shapley/消融的定量版并入 SW16 gap 条目的「最后一步」（文章五步序同样把 Shapley 排最后，依赖回放能力），与 SW7 定性代理（M2）互补不冲突。

### B. 等效印证（集群已有，不新增）——8 组

| # | 文章机制 | 集群等效物（实测锚点） |
|---|---------|----------------------|
| SW2 | 语义意图保真度（跨跳余弦相似度） | 验收标准冻结=终态机械校验，使意图衰减无害化（收尾契约+验收冻结铁律）；H5.1 模糊目标前置硬门槛；delegation-brief-format 任务书规范；steer 纪律（1012 实证：内容须先实测可行再写入）。结构性防御在位，嵌入裁判度量成本>收益，不建 |
| SW3 | 拓扑中心化度评测（星型 vs 全连接） | 领域网关原则=分层树拓扑的制度化（禁跳过网关直派下游）；禁跨板 parents；并行扇出限流尾批（每波 ≤3）。文章铁律「分层树状成倍降低 MOR」恰是集群现行选型的外部印证 |
| SW4 | 认知死锁率（Agent 间互相等待） | kanban_link 拒绝依赖环（结构性防死锁）+ max_runtime_seconds 超时熔断 + goal_mode 轮次预算。与 EV7/H3.7.4（工具层死循环签名）分层互补：本条是调度层且已结构性在位 |
| SW5 | 软件工程蜂群场景（PM/Architect/Dev/QA 虚拟公司） | 集群本身即该场景的活体运行（orchestrator+worker-coder/tester/researcher 编排）；T6/T7 编码题+T8/T9 调研题是其评测化切片 |
| SW6 | 蜂群三要素（容器沙箱×角色协议×确定性断言） | worktree/dir workspace+禁 scratch（沙箱）；owner-registry+profile 分工（角色协议）；验收标准冻结+frozen 命令机械验收（确定性断言）——三要素全在位且是集群核心纪律 |
| SW12 | 帕累托前沿（成本-收益散点） | P3 单卡 token 成本+TTVV 同型任务对比+cost-ledger 七天聚合已是成本测量面；单点对比已够，散点图不建 |
| SW14 | 回音壁效应检测（Echo Chamber Index） | 8 项认知偏差自检、clef 第二意见（禁主 LLM 自评）、蓝军对抗评审（adversarial-review-closeout）、SAT 分歧调和隔离（多样性源排除出裁决）；量化代理由 M2 零驳回审计承接 |
| SW15 | 免疫三件套（红队审计 Agent/声誉门控/去中心化投票） | 蓝军评审=Challenger 同构；owner-registry reliability+capability-graph 排序=声誉软门控；T3 人审门=比多数派投票更强的关键决策仲裁 |

### C. 显式不吸收——3 组

| # | 文章机制 | 不吸收理由 |
|---|---------|-----------|
| SW8 | 混合动机场景（竞标市场/供应链契约博弈/利益冲突蜂群） | 集群 worker 无独立利益与资源市场（同一用户、共享预算）；角色 KPI 冲突已由验收冻结+打回权+人审门制度化（并入 SW7 判据语境）。依附语境不成立，整类 DROP |
| SW9 | 社会福利总量+基尼系数（效用分配公平性） | 集群无独立效用分配面；「单 Agent 垄断奖励」的镜像（负载失衡）由 owner-registry 主责分配与限流尾批承担 |
| SW11 | Shapley 值归因（全组合边际效益期望） | 2ⁿ 组合爆炸，每组合需重跑任务，集群规模下成本>收益；定性代理已在 M2。**前提绑定**：多 worker 联合产物归因争议频发时翻案（随 SW16 harness 的回放能力成熟） |

## 三、计数机械重数

- 收缩吸收：SW1, SW7, SW10, SW13, SW16 = **5**
- 等效印证：SW2, SW3, SW4, SW5, SW6, SW12, SW14, SW15 = **8**
- 显式不吸收：SW8, SW9, SW11 = **3**
- 合计 **16** 行

## 四、执行清单

1. [x] 全文抓取存档 article-full.txt（16977 字符，标题/账号/URL 头部行在位）
2. [x] 本裁决报告 VERDICT.md
3. [x] baseline.md 追加「M1-M2 多 Agent 协作健康指标」节（含「不进回归总闸」接线声明——M 集测 fleet 日常协作面非回归题会话，挂周报面）
4. [x] guardrail-regress manifest known_uncovered 第 6 条（蜂群拜占庭注入）
5. [x] 设计文档 §4.16 增量摘要一句 + 附录 B 索引行 + 归档卷详情节（gap-20261024-swarm-eval）
6. [ ] 留痕卡（swarm 板，收尾补建）

## 五、验收命令（冻结）

```bash
# 1. M 节在位且总闸声明显式
grep -c "M1-M2 多 Agent 协作健康指标" ~/.hermes/profiles/_shared/evals/baseline.md   # ≥1
grep -c "不进回归总闸" ~/.hermes/profiles/_shared/evals/baseline.md                 # ≥1
# 2. known_uncovered 第 6 条
python3 -c "import json; m=json.load(open('/Users/YOURNAME/.hermes/evals/guardrail-regress/manifest.json')); assert any('拜占庭' in x for x in m['known_uncovered']); print('OK', len(m['known_uncovered']))"
# 3. 设计文档三锚
grep -c "gap-20261024-swarm-eval" ~/.hermes/profiles/orchestrator/references/design-doc/hermes-complete-design-doc.md                    # ≥1
grep -c "gap-20261024-swarm-eval" ~/.hermes/profiles/orchestrator/references/design-doc/hermes-complete-design-doc.archive-gap-ledger.md # ≥1
# 4. 旧口径零残留（本文机制关键词此前零命中，落地后仅应出现在新节）
grep -rn "夏普利\|Shapley" ~/.hermes/profiles/_shared/evals/baseline.md | wc -l   # 仅 M 节/gap 引用处
```


## 六、遗留收口（2026-10-24 第二轮，同日）

四、执行清单 1-5 完成后，用户指令「完成遗留」，两项遗留当日收口：

1. **M1/M2 效力落地**：统计脚本 `~/.hermes/evals/collab-health/m1_m2_metrics.py`（纯 stdlib 只读）+
   ops-eval 周报生成器接线（ops-eval-weekly.sh §M1/M2 节，CJK patch 纪律：.bak 备份/ASCII 锚断言/bash -n）
   + 首轮实测：M1 MOR=1.70（协调 29.2M tok ÷ 生产 17.2M tok，7 天窗口，<3× 无归因义务）；
   M2 30 天 35 角色 383 completed 仅 1 打回（worker-tester，rate=0.056）——评审摩擦极低是真实测量发现，
   反向印证 worker-completion-independence-verification 存在必要；14 角色进零驳回审计触发名单（仅名单）。
   验收：周报实跑产出 M 节（weekly-20261024.md）✅
2. **harness 五步序第一步 PoC**：`~/.hermes/evals/swarm-eval/`（swarm_eval.py 内核 + test 5/5 + README）。
   已验证：总线投递顺序守卫（拦截先于 deliver）/拦截唯一旁路（被测零改动）/死锁签名能红能绿/
   拜占庭包装器（同 seed 复现、噪声不进 proposals、注入下 success 保持 1.0、开销 129.7→141 可见）/hop 熔断。
   修复过程实锤三坑：deliver 顺序致部分和提前收敛（终态须「total 定且 shards 空」）、
   内层沉默 None 未处理、TraceInterceptor 记录缺 args 字段。
   mesh 断链（success=0）记录为 step3 拓扑对比现象，不作缺陷修。
   step2-5（真仓闭环/真模型对比/拜占庭进回归/Shapley）留后续卡，翻案条件不变。

留痕卡 t_1bf5ce34。文档同步：baseline.md §M 接线声明更新、设计文档 §4.16 增量段 + 归档卷条目成色升级、gap-closure-ledger.md 闭环条目。

### 附：验收实跑暴露的护栏漂移复发（第二次）及修复

- **发现**：终验 `--all` P6 FAIL——`kanban_db_connect.py` 10-23 23:59 被重写，envgate 门控块丢失（marker 0 命中，前例修复后应 2）。定责隔离：本轮只改 manifest known_uncovered → 存量漂移非本次引入（同 10-23 京东篇 P6 先例，症状相同=第二次复发）。
- **新结构性弱点**：apply-source-patches.sh 因多文件 BASELINE-CONFLICT 整批 fail-closed，连带上下文完好的 envgate patch 也不被应用且无告警——漂移静默持续半天。
- **修复**：`git apply --check` 单文件验证 → 单 patch apply（marker=2）→ `--all` 8/8 PASS（GUARDRAIL-EFFECTIVE）。
- **案例登记**：`_shared/failures/2026-10-24-guardrail-envgate-drift-relapse.md`（五要素+机制债：整批 fail-closed 连带面过宽且静默、update 高频重写面缺在场性探针）。
