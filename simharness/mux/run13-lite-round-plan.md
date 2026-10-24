# 分层推演（提速方案①）——lite 轮与全量轮双层设计

2026-10-09 提速决议（用户"全做"批准）之一。背景：run11 全量 26 步约 30 小时、run12 预估
~20 小时，其中大头是 agent 大生成（系分/概设/开发）与串行等待窗；但产品回归迭代不需要每轮
都重走需求→分析→架构全过程。

## 语义边界（2026-10-10 用户裁定）

**完整的需求不存在精简版**：任何新需求（RFD）一律走全量 26 步（需求→分析→设计→编码→测试→发布→验收→审计）。
「lite 轮」更名**回归轮**，且不带需求语义——它只用于产品与流程变更的回归验证（复用已冻结的需求工件重跑工程链），对外文案一律用「回归轮」，禁用「精简轮/lite 轮」措辞（横幅/报告/图注同此）。

## 分层定义

| 层 | 名称 | 步骤面 | 用途 | 预估耗时 |
|---|---|---|---|---|
| L1 | lite 轮（裁剪轮） | devimpl → defect → testpass → ready → release → report | 产品/运行时回归迭代：开发实施+集成测试+缺陷闭环+门禁链 | 约 6-9h（省掉分析/评审/概设大生成 ≈3-4h + 等待窗） |
| L2 | 全量轮（里程碑轮） | smoke → … → report 全 26 步 | 里程碑/发版前全链路保真验证（六闸+审计+报告全证据面） | 约 12-16h（叠加提速②③④⑤后；提速前 20-30h） |

节奏建议：日常迭代跑 L1；里程碑、跨轮验收、流程/模板变更后跑 L2。L2 的覆盖面以 L1 未触碰的
步骤面为增量重点。

## lite 轮的夹具语义（防"补拍冒充"红线）

lite 轮**跳过**的步骤不伪造其证据：状态键以 `lite_fixtures_from=<源轮次>` 显式标注来源，
报告/审计段渲染 lite 轮时必须带"lite 轮（夹具自 <源轮次>）"口径，不得与全量轮证据混同统计。

夹具三类：
1. **环境夹具（SIM 持久，跨轮复用，无需种子）**：账号 30 token、单网关多路复用、studio、
   治理注册表（apps/org/roster）、各账号板——smoke/appinit/people 的产物，持续存在于 SIM_ROOT。
2. **仓夹具（central/aipaydev 持久，跨轮复用，无需种子）**：docs/requirements/RFD-001.freeze.md、
   docs/analysis/RFD-001-tasklist.md + AN-*.md、docs/design/RFD-001-architecture-design.md
   （上一全量轮真实产出，入仓即在）。
3. **轮级状态（须种子，mx-lite-seed.sh 写）**：room_analysis（复用源轮分析群）、run_started_at、
   g1_frozen/g2_arch_pass（来源轮门禁记录，provenance 键随附）、其余 *_done 键留空（lite 轮
   自己跑自己的步骤并当轮实时取证）。

## 运行方式

```
# 1) 种子（幂等；--check 只验夹具不写）
bash mux/mx-lite-seed.sh --to 20261010-v8-run13 --from 20261009-v8-run12 [--check]

# 2) 起跑（断点续跑同全量轮）
RUN_ID=20261010-v8-run13 LC_ALL=C START_STEP=devimpl nohup bash aipay-scenario.sh \
  > $SIM_ROOT/logs/20261010-v8-run13-driver.log 2>&1 &
```

## 边界与代价（如实）

- lite 轮**不覆盖**需求/分析/评审/概设/G1/G2 的 agent 协同能力——这些由 L2 全量轮兜底。
- g2_arch_pass 由夹具提供（来源轮真值），lite 轮的 close/plan 硬闸放行依据是来源轮门禁
  记录而非本轮现场评审——报告口径必须写明。
- devimpl 的任务书引用 docs/design/RFD-001-architecture-design.md：若产品契约本轮有变，
  跑 L1 前须先在 L2 或人工评审更新概设，否则开发会按旧契约实施。

## 归档

提速补丁三件（devimpl 六路齐发／免等窗+残余窗活性化／push 措辞根治）已于 2026-10-09
全部套用并入 aipay-scenario.sh 主脚本，原件存 git 历史（mux/run1[23]-speedup-*.patch 已删）；
提速⑤⑥（负载预检+防休眠）直接落在 mux/mx-up.sh；守门⑲断言同步新不变量（六路齐发+rebase
对接），套用后 89/89 全绿。

## loop-graph 自驱动落实（2026-10-09 用户"立刻完成"指令）

- **模板验证**：26 步推演 GraphSpec 模板+需求→图编译器经引擎同一 validateGraphSpec 校验通过
  （appendById 领域 reducer 同参注入）；守门 graph-spec-smoke 3 测入套件（94/94 绿），模板↔校验器
  漂移当场红。
- **缺口修复**：REST spec 注册校验缺领域 reducer 表（模板系 spec 恒 400）——overlay a94ec57b 与
  引擎内部调用方同参。
- **shadow 武装**：mx-lib ensure_studio_up 起 studio 带 GRAPH_ENGINE（缺省 shadow 双跑，MX_GRAPH_ENGINE=on
  切接管）——下次 studio 重启生效。run12 不中途换驱动（bash 保真轮在途）；run13 起跑 shadow 验证
  等价性后切 on，图引擎接管调度即彻底自驱动。
- 降级前提：SIM product-dist 重建后 REST 修复才进运行面（mx-setup 供给链）。

## 二合一报告层（2026-10-09 用户"仿真报告×演示报告合一"指令）

mux/unified-report-layer.py —— 只读叠加后处理层（不动 mx-report-gen/mx-report-audit 产物与断言面）：
- **受众卡层**：8 视角（产品/需求分析/架构设计/研发设计/代码开发/测试/研发管理/平台）各 4-6 张卡，
  每卡=受众会问的问题+一句判断句结论+数据锚+证据指针，数字实算自 r18-steps/issues/state/scenario
  数据面，缺项如实标"本轮未见该数据"。
- **完整审阅层**：内嵌既有报告 HTML 正文（审计正本不受影响），缺失时回落按步台账。
- **路演素材层**：roadshow-outline.md 每块 headline/points/anchor 三字段（≥10 块），
  供后续 PPT/视频生成器提取；unified-report.html 单文件含三层+问题台账。
- 验证：run11 真数据实跑（20261007-v8-run11 → unified/ 三件：17 卡/10 块/364KB）；
  守门 tests/unified-report-layer.test.ts 4 测（内嵌 fixture 不依赖在架轮次），套件 98/98 绿。
- 用法：python3 mux/unified-report-layer.py --run <RUN_ID> [--sim-root <path>]；幂等可重跑。

## 过度交付盘查与守卫（2026-10-09 用户"A+C"决议）

盘查实证（run12）：fanfan 预写越界为全域集成者（main 合并高速路+代写渠道测试 T02/T03）、
chen 分析段内提交实现码（T01/T05）、fei 预备轮违反两条禁做（建 worktree 跑测试提交报告）、
xiao/hu/lin 分支协议违反（worktree/T 号交付，feat/DEV-* 永不出现）、提交粒度 24-26/支 vs 口径 2-6、
fei 预备轮 721 次工具调用。run11 对照：预写/预备机制未触发（design-prewrite-skipped×2）——
过度交付是流水线左移引入的新病（给了"提前动手"许可、没给边界清单）。

处置：A=运行中回灌（4 笔送达，event_id 见 issues.log DISP|over-delivery-refeed）；
C=守卫固化——**2026-10-10 已套用入 aipay-scenario.sh（补丁文件删除，单一事实源）**：六路任务书
加边界纪律条款（仅 feat/* 交付、禁直推 main、禁代做）、概设预写任务加禁做围栏（run13 lite 不经
该段，L2 全量轮生效）、预备轮"不建分支"补 worktree 漏洞、devimpl 入口记 main 基线+段末 main
污染反查（ISSUE|main-pollution）+提交粒度观察项。套用时 hunk2/4/5 因干预点四件轮上下文漂移，
按当前文件补上下文行后应用（+28/-7 与声明一致，vitest 128/128 绿）。

## 质量补强（2026-10-09 用户"不牺牲质量"审计指令）

- **硬窗档位放大**（mx-scenario-lib.sh）：下限 7200s 不变，idle>900 的长等待档×8 放大
  （1800 档→14400s）——防 devimpl 链式腿（C→S→N 串行+渠道批，合法总时长 3-4h）被平顶
  硬窗误杀（误杀=假问题单+降级运行）。env 设值绝对覆盖。
- **免等窗终态复核**——**已入 aipay-scenario.sh（a0113d2，run12 archgate 断点换装窗口套用；
  2026-10-10 删除补丁文件，单一事实源）**：免等窗记单时点≠终态——审计段以当前真值复核
  receipt-missing/raci-not-structured 两族问题单，补账成功者追加 DISP 闭环行（原单保留，
  两时点真值并存不删改）。
- 粒度核验：六任务全符合纪律 31"单卡≤1 人日"（C 0.5/S 1 拆2/N 1 拆2/MP 2 拆2-3/
  CHWX 2 拆2-3/CHALI 2 拆2-3）；chen 的 C→S→N 串行是真实依赖链（契约→状态机→回调）
  非可并行化损失；4 工作者×6 派发+测试预备 2 路前移=并发 6，远低于定标 30，排队泵
  兜瞬态超额——并行利用在本剧情依赖结构下已充分。
