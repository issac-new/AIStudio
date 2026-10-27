# 技术组件台账 · 主索引（长期维护单一入口）

> 本文件是台账体系的**导航与维护契约**。三件分卷互不重复，本索引只管：去哪查、何时刷、退役裁决的执行状态。
> 建立日 2026-10-28（用户裁决「整合台账长期维护」+「超 3 个月不更新即退役」）。

## 一、分卷结构（单一事实源分工）

| 卷 | 文件 | 管什么 | 更新触发 |
|---|------|--------|----------|
| **动作验收卷** | `tech-components-ledger-20261027.md` | 本机部署组件的升级/刷新动作与验收命令（REA 6.8.0、ATT&CK v20.0 等） | 每次执行升级动作时追加 |
| **历史差异卷** | `tech-components-ledger-history-v2.md` | 历史全部调研线（30 条）与上游的版本差异比较、🔴🟡🟢 判级 | 季度重跑；点名「组件台账」时增量重查 🔴🟡 |
| **主索引（本件）** | `LEDGER-INDEX.md` | 去哪查 + 退役裁决执行状态 + 刷新程序引用 | 每轮退役裁决/刷新后 |

刷新程序（四步：组件面扫描→基线锚→上游实测→判级落盘）权威源 = skill `tech-component-ledger-refresh-orch`（orchestrator profile，v1.0.0）。
worker 派发通道诊断（授权/spawn/wire 三段链）= skill `worker-dispatch-channel-diagnosis`。

## 二、退役裁决（2026-10-27 用户裁决，2026-10-28 执行）

**口径：上游超过 3 个月不更新（pushed_at 距今 >90 天）的组件线 → 保留历史轨迹，标记退役，不再跟进。**

判定基准日 2026-10-27（上游状态全部当日 gh api 实测，见历史差异卷 §九）。

### 退役名单（🟢 死水线自动晋级 RETIRED，9 条）

| 组件 | 上游末次 push | 静默天数 | 处置 |
|------|--------------|----------|------|
| HexStrikeAI (0x4m4) | 2026-08-03 | 85 | ⚠️ 差 5 天到线，**在跑的 T1 调研完成后即退役**（上游停滞已实证，源码深读价值不受影响） |
| AP2 (google-agentic-commerce) | 2026-06-17 | 132 | RETIRED——调研档案保留（aipay 系列），不再查上游 |
| ACP (agentic-commerce-protocol) | 2026-07-18 | 101 | RETIRED——同上 |
| openclaw-sec-skills (Batman0506) | 2026-06-25 | 124 | RETIRED |
| openagentontology (CWNApps) | 2026-08-07 | 81 | ⚠️ 差 9 天，观察至 11-05，届时仍静默即退役 |
| HarnessEval-W (MirroS-Lab) | 2026-09-07 | 50 | 在线（未到线，留 🟢） |
| AutoPT (Dizzy-K) | 2026-06-01 | 148 | RETIRED |
| laya (NandhaKishorM) | — | — | RETIRED（已裁决退役的决策模型线，非静默原因） |
| CyberStrikeAI 的对照仓 artex 等旧线 | — | — | 已在 10-16 recheck 归档 |

### 退役纪律

1. **保留历史轨迹**：退役 ≠ 删除。调研报告、裁决矩阵、落地物全部原位保留；只停止「上游增量跟进」（不再出现在 🔴🟡 观察名单）。
2. **复活条款**：季度重跑时对 RETIRED 线仍查一次 `pushed_at`——复活（90 天内又有 push）则按新增量重判级，回观察名单。
3. **记录锚**：退役不另建文件，在本索引登记（本节即台账）；历史差异卷的对应行加 `→ RETIRED 2026-10-28` 后缀。

## 三、当前活跃观察面（刷新后）

- 🔴 **5 条待增量调研**（OpenExecutive +91c、semantica +100c、agent-skills 0.6.13→v1.3.1、Autopt +42c、Cybermes v2→v3.5）——**派卡优先级排序**：semantica（本机 runtime 常驻）> OpenExecutive/agent-skills > Autopt/Cybermes。
- 🟡 **6 条轻跟**（DSH next、better-harness、pi-harness、AgentENV、A2A、x402）——观察即可，不占卡。
- 依赖的管线：hexstrike T1 (t_632cbd94) / T2 (t_20ad092c) 已于 10-28 恢复 running（空流根因修复后实测各 20+ 轮正常产出）。

## 四、半衰期与重跑契约

- **季度重跑**（随单元对账）：全组件面重扫 + 上游实测 + 判级刷新 + 退役线复活检查。
- **点名触发**：用户说「组件台账/更新到最新版」时，只增量重查 🔴🟡 两档 + RETIRED 线的 pushed_at。
- 程序与坑（引用噪声、外置盘定位、gh api 限流、npm dist-tags 双通道）见 skill `tech-component-ledger-refresh-orch`，不在本索引复制。

## 五、变更日志

- 2026-10-28 建立主索引；执行 3 个月退役裁决（6 条 RETIRED + 2 条临线观察 + HexStrikeAI 在跑卡完成后退役）。
- 2026-10-27 动作验收卷（v1）+ 历史差异卷（v2，30 线全量差异比较）落盘。
