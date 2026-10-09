# 分层推演（提速方案①）——lite 轮与全量轮双层设计

2026-10-09 提速决议（用户"全做"批准）之一。背景：run11 全量 26 步约 30 小时、run12 预估
~20 小时，其中大头是 agent 大生成（系分/概设/开发）与串行等待窗；但产品回归迭代不需要每轮
都重走需求→分析→架构全过程。

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

- 提速②（devimpl 六路齐发）：mux/run13-speedup-devimpl.patch ——**2026-10-09 10:10 已套用**（run12 archgate 断点换装，用户批准"未开始环节直接应用"）
- 提速③④（免等窗+残余窗活性化）：mux/run13-speedup-receipts.patch ——同上已套用
- 措辞根治（push 到 origin main）：mux/run13-speedup-wording.patch ——同上已套用
- 提速⑤⑥（负载预检+防休眠）：mux/mx-up.sh（已落）
- 守门⑲断言同步新不变量（六路齐发+rebase 对接），套用后 89/89 全绿

## 质量补强（2026-10-09 用户"不牺牲质量"审计指令）

- **硬窗档位放大**（mx-scenario-lib.sh）：下限 7200s 不变，idle>900 的长等待档×8 放大
  （1800 档→14400s）——防 devimpl 链式腿（C→S→N 串行+渠道批，合法总时长 3-4h）被平顶
  硬窗误杀（误杀=假问题单+降级运行）。env 设值绝对覆盖。
- **免等窗终态复核 patch**（mux/run13-quality-audit-closure.patch，下轮套用）：免等窗
  记单时点≠终态——审计段以当前真值复核 receipt-missing/raci-not-structured 两族问题单，
  补账成功者追加 DISP 闭环行（原单保留，两时点真值并存不删改）。
- 粒度核验：六任务全符合纪律 31"单卡≤1 人日"（C 0.5/S 1 拆2/N 1 拆2/MP 2 拆2-3/
  CHWX 2 拆2-3/CHALI 2 拆2-3）；chen 的 C→S→N 串行是真实依赖链（契约→状态机→回调）
  非可并行化损失；4 工作者×6 派发+测试预备 2 路前移=并发 6，远低于定标 30，排队泵
  兜瞬态超额——并行利用在本剧情依赖结构下已充分。
