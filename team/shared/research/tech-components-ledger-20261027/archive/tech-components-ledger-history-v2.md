# 技术组件台账 · 历史全量差异比较（2026-10-27 v2）

> 增补背景：v1（同目录）仅覆盖近一周调研线 11 组件，用户裁决「补全历史所有的台账差异比较」。
> 范围：三个调研区（外置盘 research 410 单元 + ~/.hermes/shared/research + ~/workspace/research）内
> 全部**组件型调研线**（有版本轴的 repo/CLI/框架，共 30 条）；方法论类（微信文/论文/无版本轴）不入本表，
> 其落地状态以设计文档附录 B 台账为准。
> 上游状态全部为 2026-10-27 gh api / npm / PyPI 实测。留痕：t_2bee444f 续作。
> 判级口径：🔴 基线后有大量上游增量（>20 commits 或跨 minor 版本）；🟡 中等增量；🟢 零/微增量或已完结。

## 一、hack/安全域（8 条）

| 组件 | 调研基线 | 上游现况（10-27 实测） | 差异判读 | 处置建议 |
|------|----------|------------------------|----------|----------|
| HexStrikeAI (0x4m4) | v6.0 源码深读立项（10-22 卡 gave_up→10-27 复活 running） | 末 push 2026-08-03，13116★ | 🟢 上游停滞 3 个月，基线新鲜度无衰减 | T1 卡跑完即闭环 | **→ 在跑 T1 卡完成后退役（静默 85 天，差 5 天到线；上游停滞已实证）**
| CyberStrikeAI (AIPentest) | 调研立项（10-22 卡同上 running） | v1.7.24（10-16）+ 10-23 durable async runs 提交 | 🟡 release 密集（月 3-4 发） | T2 卡源码深读按最新 HEAD |
| Autopt (shiyeshu) | 06c834e（08-18，能力映射+回环 fixture 已落地 G9） | 10-23 仍在 push，基线后 **42 commits**，最新 tag arch-role-five | 🔴 上游活跃，「五角色→arch-role-five」疑似架构演进，原报告的架构描述可能过期 | 派轻卡增量重读（对照 fixture 是否仍全绿） |
| ARL-Next (owl234) | 已落地本机（wih_engine.py 移植） | 见 v1 表（持续维护线） | 🟢 | 无动作 |
| openclaw-sec-skills (Batman0506) | 概念引用（06-25 后上游静默） | 末 push 06-25 | 🟢 上游死水 | 无动作 | **→ RETIRED 2026-10-28（静默 124 天）**
| Cybermes (Zyrexnn) | v2.0.0 调研（融合分析在案） | **v3.5.0**（10-24 push），跨 3 个 minor | 🔴 版本轴大跨度，v2→v3.5 未盘点 | 建议增量调研卡（hack 域价值面待裁决） |
| OpenSecurity (zylc369) | 2.0 源码分析+蓝军报告（10-17） | tag 2.0 不变，10-19 有 push | 🟢 | 无动作 |
| REAP (JoasASantos) | 10-26 快照融合（skill v1.2.0） | README+Skills md5 零漂移（v1 表实测） | 🟢 | 无动作 |

## 二、Harness/Agent 运行时域（9 条）

| 组件 | 调研基线 | 上游现况 | 差异判读 | 处置建议 |
|------|----------|----------|----------|----------|
| DSH 深度工具 (@deepseek-ai/dsh) | v0.2.1-rc.2（10-18 delta 报告） | dist-tags: latest=0.2.1-rc.2, **next=0.2.1-rc.4** | 🟡 next 通道 2 个 rc 未盘点；npm 面已装 0.17.0 是 dsh-tui 线 | 轻卡跟 next 通道 |
| LongHorizon-Harness (lh-harness) | v0.1.7 / HEAD a1dd9306（10-18 delta） | PyPI 最新 **0.1.8**（08-20 上传） | 🟢 基线后仅 1 个 patch | 无动作 |
| OpenExecutive (SenteLabsAI) | main@30319d9（10-18 delta，897 py/31MB） | v0.6.6，10-27 仍 push，基线后 **≥91 commits** | 🔴 高活跃：0.6.1→0.6.6 五个版本未盘点 | **优先增量卡**（10-18 报告的版本增量表已过期） |
| better-harness (QoderAI) | 0.6.4 深读（10 月初） | tag v0.7.0-alpha2（09-12 发布）+ 10-20 push | 🟡 0.6.4→0.7.0-alpha2 跨 minor | 轻卡增量 |
| agent-skills (mattpocock) | 0.6.13（10-18 delta） | **v1.3.1**（10-22 push） | 🔴 0.6.13→1.3.1 跨大版本，10-18 报告只覆盖到 0.6.13 | **优先增量卡**（skills 市集三件套依赖此线） |
| HarnessEval-W (MirroS-Lab) | 深读+蓝军复核（09-07 后上游静默） | 末 push 09-07 | 🟢 | 无动作 |
| pi-harness (earendil/badlogic pi-mono) | 源码级深读（pi-monorepo） | @mariozechner/pi-agent 0.9.0 / pi-ai 0.73.1 持续发版 | 🟡 本地快照非 pin 版，上游持续走 | 按需跟（无在役依赖） |
| semantica (semantica-agi) | v0.7.0 / commit 2a9afec（09-23 源码分析） | 10-27 当日仍 push，基线后 **≥100 commits**（高活跃） | 🔴 大增量；本机有 semantica-runtime 常驻技能 | **优先增量卡**（运行时组件，过期风险实存） |
| Startlux-Decision (laya 线) | v1.1 模型 + 影子评测（10-17/10-19） | 上游 laya v0.4.15 | 🟢 已裁决退役（slux 关停），仅留评测判例 | 无动作 |

## 三、Agent 编排/多智能体框架域（4 条，survey 型引用，非深读对象）

| 组件 | 调研基线 | 上游现况 | 差异判读 | 处置建议 |
|------|----------|----------|----------|----------|
| AgentENV (kvcache-ai) | 架构综述（llm-architecture 报告） | **v0.2.4**（10-23 发布），10-27 仍 push | 🟡 论文型仓库持续走，无本机依赖 | 观察线，不派卡 |
| Dream-RSI (zhengkid) / ModularRSI / Qwen-Planner / MobileWorld | 微信文+论文机制调研（10-23 证据矩阵） | Dream-RSI 10-23 / MobileWorld 10-23 仍有 push | 🟢 机制结论不随小版本失效 | 无动作 |
| Graph-Engineering 综述 (DEEP-JLU) | commit a2de779（09-08 融合） | 10-06 push（awesome 清单型） | 🟢 清单型，机制面稳定 | 无动作 |
| commerce-agents (anthropics) | 09-04 源码分析 | 10-19 push 但 **09-05 后 0 commits 到 10-19 前**——实测 since=09-05 计数 0 | 🟢 零增量 | 无动作 |

## 四、支付协议域（4 条，aipay 系列 08-25 调研）

| 组件 | 调研基线 | 上游现况 | 差异判读 | 处置建议 |
|------|----------|----------|----------|----------|
| x402 (x402-foundation) | aipay 报告（08-25） | 10-26 仍 push，tag v1 | 🔴 持续活跃，协议面演进 | pay 域网关按需跟 |
| A2A (a2aproject) | 同上 | v1.0.1，10-21 push | 🟡 tag 已冻结 1.0，增量小幅 | pay 域按需 |
| AP2 (google-agentic-commerce) | 同上 | v0.2.0，**06-17 后静默** | 🟢 死水 | 无动作 | **→ RETIRED 2026-10-28（静默 132 天，超 3 个月线）**
| ACP (agentic-commerce-protocol) | 同上 | 07-18 后静默 | 🟢 死水 | 无动作 | **→ RETIRED 2026-10-28（静默 101 天）**

## 五、知识工程/本体域（3 条）

| 组件 | 调研基线 | 上游现况 | 差异判读 | 处置建议 |
|------|----------|----------|----------|----------|
| FIBO (edmcouncil) | fibo-01..03 系列深读（本体工程借鉴） | 10-26 push（Q3/Q4 例行 release 节奏） | 🟢 标准本体，机制结论稳定 | 无动作 |
| openagentontology (CWNApps) | v0.2.0 复刻报告（p1-2a） | 08-07 后静默，0★ | 🟢 死水 | 无动作 | **→ 临线观察至 2026-11-05（静默 81 天，届时仍静默即 RETIRED）**
| os-taxonomy | v1.0.0（调研+CHANGELOG 在案） | 本地快照型 | 🟢 | 无动作 |

## 六、工具链域（v1 表已覆盖，此处归并索引）

| 组件 | 结论（v1 表详） |
|------|-----------------|
| REA MCP / Ghidra / ATT&CK / REAP / CyberStrikeAI / HexStrikeAI / DeepInfer / deepseek-recipe | 见 v1 表——REA 已升 6.8.0、ATT&CK 已刷 v20.0、Ghidra 12.2 待裁决、DeepInfer 线欠收口 |

## 七、总量与判级汇总

- 历史组件型调研线合计 **30 条**（本表 24 + v1 表工具链 8，其中 HexStrike/CyberStrike/REAP 三条重叠）。
- 🔴 需增量重读 **5 条**：OpenExecutive（+91c）、semantica（+100c）、agent-skills（0.6.13→v1.3.1）、Autopt（+42c，架构面疑变）、Cybermes（v2→v3.5）。
- 🟡 轻跟 **6 条**：DSH next 通道、better-harness、pi-harness、AgentENV、A2A、x402。
- 🟢 完结/死水/零增量 **19 条**：其余全部（含 AP2/ACP/openclaw-sec/OAO/HarnessEval/laya/commerce-agents 等）。

## 八、与 v1 表的关系

v1 表（tech-components-ledger-20261027.md）管「近一周调研线 + 本机部署组件」的本日动作；
本表管「历史全部调研过的组件」与上游的版本差异比较。两表互补，不重复记录处置动作——
本表的 🔴/🟡 判级是派卡依据，v1 表是升级/刷新动作的验收记录。

## 九、验证记录（本日实测锚）

```bash
# 全部 28 repo 上游状态：gh api repos/<o>/<r> 批量（本日 /tmp/upstream_batch2.sh 复跑可验）
# 版本轴补充源：
npm view @deepseek-ai/dsh dist-tags          # latest=0.2.1-rc.2 next=0.2.1-rc.4
curl pypi.org/pypi/lh-harness/json           # 0.1.8
gh api repos/tinyhumansai/openhuman/tags     # v0.64.15
gh api repos/SenteLabsAI/OpenExecutive/tags  # v0.6.6
gh api repos/mattpocock/skills/tags          # v1.3.1
# 增量计数（commits?since=）：
OpenExecutive since 10-19 = 91; semantica since 09-24 = 100(封顶); Autopt since 08-19 = 42;
commerce-agents since 09-05 = 0
```
