# run12 前置：PAYCORE 三拆 + 渠道批依赖改挂契约件（预案）

> 立项依据：run11 复盘（2026-10-08）——"3 人日重腿单会话串行 + 渠道依赖挂整腿"
> 是粒度侧两大结构病灶；本文预备 aipay-scenario.sh devimpl 段改法。
> **纪律 25：run11 运行中禁改主脚本，本文仅预案；G6 收官后按此落码。**

## 病灶回放（run11 实测）

1. DEV-PAYCORE（3 人日）单 agent 单会话：chen 16:16 拉起、18:17 仍未收口（2h+），
   阶段窗口 16:21 关闭 → 集成分支缺 pay-core 本体（记单降级，不可逆）。
2. 渠道批（d2）触发锚 = feat/DEV-PAYCORE 整腿落地：PAYCORE 判死后走降级路径，
   11:12-12:47 的 95 分钟里全群仅 xiao 一人真在干活（有效并行度 ≈25%）。
3. 对照：hu 的 2 人日 DEV-CHWX 单会话 31 分钟交付——**单会话可吞上限 ≈2 人日**。

## 改法一：PAYCORE 拆三张任务书（d1 段替换）

三张任务书均由 dispatch_in_room chen 派发（同一执行人，三卡可与会话接力），
分支各自独立、可各自被 G3 testlog 检查核验：

| 子任务 | 分支 | 体量 | 内容 | 结论行 |
|---|---|---|---|---|
| PAYCORE-C 契约件 | feat/DEV-PAYCORE-C | ≤0.5 人日 | apps/csw-pay-core 契约：ChannelAdapter 接口 + 支付单状态机类型 + 回调事件 schema + docs/design/RFD-001-pay-core-contract.md（含 tsc 编译过 + 契约文档；无业务实现） | DEV-DONE-DEV-PAYCORE-C |
| PAYCORE-S 状态机+幂等 | feat/DEV-PAYCORE-S（基于 origin/feat/DEV-PAYCORE-C 起建） | 1 人日 | 支付单创建幂等（merchantId+outTradeNo）、状态机 INIT→PAYING→SUCCESS/FAILED/CLOSED、查单/关单；vitest ≥5 用例 | DEV-DONE-DEV-PAYCORE-S |
| PAYCORE-N 回调+证据 | feat/DEV-PAYCORE-N（基于 origin/feat/DEV-PAYCORE-S 起建） | 1 人日 | 渠道回调接收入口（验签后更新状态机、重复回调幂等）；vitest ≥3 用例（回调重复消费）；testlog 随分支 | DEV-DONE-DEV-PAYCORE-N |

每卡沿用现行任务书十要素结构（指令头/纪律/工作区/契约引用/分支名/要点/测试
证据/提交纪律/结论行/验收抄送）；testlog 路径按卡命名
（docs/evidence/DEV-PAYCORE-{C,S,N}-testlog.txt）。

## 改法二：渠道批触发锚改挂契约件（d2 段替换）

```bash
# 现行（病灶）：随 feat/DEV-PAYCORE 落地即派
wait_alive_truth "origin 出现 feat/DEV-PAYCORE 分支（本轮新鲜，渠道批触发锚）" 1800 chen branch_fresh "feat/DEV-PAYCORE"
# 改为：契约件落地即派（预计派发提前 ~1.5-2h）
wait_alive_truth "origin 出现 feat/DEV-PAYCORE-C 契约件分支（渠道批触发锚）" 1800 chen branch_fresh "feat/DEV-PAYCORE-C"
# d2 任务书基座同步改：git checkout -b feat/${task} origin/feat/DEV-PAYCORE-C（基于 pay-core 契约件）
```

## 改法三：等待段串行 for → wait_alive_truth_multi（dd6956d 已落库）

```bash
# 现行（病灶，aipay-scenario.sh:823-830）：CHWX→CHALI→MP 三段串行
# 改为：
wait_alive_truth_multi 1800 "hu,lin,xiao" \
  "渠道批：origin 出现 feat/DEV-CHWX 分支（本轮新鲜）@hu@branch_fresh feat/DEV-CHWX" \
  "渠道批：origin 出现 feat/DEV-CHALI 分支（本轮新鲜）@lin@branch_fresh feat/DEV-CHALI" \
  "origin 出现 feat/DEV-MP 分支（本轮新鲜）@xiao@branch_fresh feat/DEV-MP" \
  || { for b in DEV-CHWX DEV-CHALI DEV-MP; do echo "ISSUE|dev-branch-missing|$b|分支未推送" >> "$EVID_DIR/issues.log"; done; }
# PAYCORE 三卡锚并入同轮（或紧随其后一轮，保持 d1 先派语义）：
wait_alive_truth_multi 1800 "chen" \
  "origin 出现 feat/DEV-PAYCORE-C（契约件）@chen@branch_fresh feat/DEV-PAYCORE-C" \
  "origin 出现 feat/DEV-PAYCORE-S@chen@branch_fresh feat/DEV-PAYCORE-S" \
  "origin 出现 feat/DEV-PAYCORE-N@chen@branch_fresh feat/DEV-PAYCORE-N" \
  || { for b in DEV-PAYCORE-C DEV-PAYCORE-S DEV-PAYCORE-N; do echo "ISSUE|dev-branch-missing|$b|分支未推送" >> "$EVID_DIR/issues.log"; done; }
```

G3 testlog 检查清单同步扩为 6 分支（PAYCORE-{C,S,N}+CHWX+CHALI+MP）；
integration 合并清单同步（缺件跳过记单语义不变）。

## 预期收益（对照 run11 实测）

- 渠道批派发时点：PAYCORE 整腿落地（未兑现）→ 契约件落地（预计 T+30~40min），
  理论 4 路并行开跑时间提前 **~1.5-2h**。
- 单腿上限：3 人日 → 最大 1 人日/卡，全部落入单会话可吞包线。
- 等待催办：滞后锚（如 run11 的 lin）不再排队等前置锚清场。

## 验收

- 守门测试：mux/tests/ 增 wait_alive_truth_multi 三断言（锚解析/全过返回/部分过
  记单返回），随 ⑲ 风格挂入。
- run12 实跑对照：devimpl 段有效并行度（活跃 agent·分钟/墙钟分钟）≥ run11 的
  2 倍为达标。
