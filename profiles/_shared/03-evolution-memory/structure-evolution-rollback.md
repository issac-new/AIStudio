# 结构演化回滚协议（Structure Evolution & Rollback — 共享参考）

> 层级：03-evolution-memory（进化记忆层共享协议）
> 来源：t_125bdf58 引入，依据 arXiv:2608.21156 §4.5 + §6.3（Graph Engineering survey, DEEP-JLU）
> 触发词：结构演化 / 改编制 / 改名 profile / 删 skill / 批量改配置 / update 漂移 / 回滚

## 一句话

结构性变更（编制/名册/技能库/SOUL 契约/依赖图）**不是普通配置改动**：必须走"信用分配 → 修改 → 验证 → commit/rollback"五步闭环，且一次结构变更要同步核对其牵连的所有图（任务名册/能力白名单/状态账本），漏一处即静默失配。

## 单行形式（SOUL 内引用）

```
结构演化纪律：改结构前留快照+列牵连面（profile_scope/白名单/SOUL引用/board名册），改后逐面验证+记录回滚路径；运行时适配≠持久演化，经验固化必须过验证闸门。
```

## 为什么要这个协议

集群的三张"图"物理上分属三处机制：任务组织=board.json 的 profile_scope 名册；能力=profile config.yaml 的 toolset/skills 白名单；状态=SOUL 引用的 _shared 协议路径。三者各自演进、无联动校验——历史上 profile 改名/更新漂移曾造成 ghost assignee、技能不可加载、update 洗掉 patch（hermes-source-patch-persistence 与 skill-fleet-consistency-audit 两个 skill 记载的实锤案例）。论文依据：结构演化必须"保持可通过溯源、版本控制、验证、重放与回滚来治理"，且任务图/能力图/状态图的变更"须在共享约束下协调"（GE§6.3）；运行时适配（一次执行的临时调整）≠持久演化（影响后续所有任务的结构变更）。

## 五步闭环（每次结构变更必走）

1. **信用分配（为什么改）**：结构变更必须由执行证据触发（gap 条目/失败案例/审计发现），留证据锚点（gap id / 卡号 / file:line）。禁止"顺手优化"式无证据重构。
2. **牵连面清单（改什么+波及谁）**：动笔前机械列出受牵连面并写入任务卡 body：
   ```bash
   # 例：改 profile 名 → 至少核对这些面
   grep -rln "<旧名>" ~/.hermes/profiles/*/config.yaml        # 引用方
   grep -rln "<旧名>" ~/.hermes/kanban/boards/*/board.json    # 名册
   grep -rln "<旧名>" ~/.hermes/profiles/_shared/             # 共享协议引用
   sqlite3 ~/.hermes/kanban/boards/swarm/kanban.db "SELECT COUNT(*) FROM tasks WHERE assignee='<旧名>' AND status NOT IN ('done','archived')"  # 在途卡
   ```
3. **快照先行**：批量改动前把原状整体复制进带时间戳目录（沿用 S6 韧性垫：改动前快照 + .bak + 回滚说明），确认快照可读后才动工。
4. **验证闸门（改后三验）**：①引用可解析——所有 grep 到旧引用的位置已更新或显式兼容；②机械验证——`py_compile`/`yaml.safe_load`/`hermes skills list -p` 等按对象类型选用的最低验证；③功能验证——至少一次真实拾取/加载/派单路径跑通（Exercised 级），配置存在（Present 级）不算完成。
5. **commit/rollback 双落点**：变更入库（git commit 或 patch 文件登记进 `~/.hermes/profiles/orchestrator/patches/`），同时在任务卡 metadata 记录回滚路径（快照目录 + 一条恢复命令）。验证不过 = 立即回滚，不留"半新半旧"状态过夜。

## update 漂移专项（hermes update 后必做）

hermes update 会覆盖 `~/.hermes/hermes-agent/` 下源码。凡对该树的 patch，必须：①patch 文件落 `patches/` 登记；②update 后回放并 diff 验证（`kanban_db.py` 类关键文件直接 grep 特征串确认机制仍在，如 F-2 案例的 `evidence_strength`）；③grep 落空 = 机制已洗掉，当次回写设计文档前先重放 patch。

## 边界

- 本协议管"结构性"变更（影响后续所有任务的编制/白名单/契约/依赖）；单卡粒度的运行时调整（重派、改派、临时 skill 加载）不适用，走正常看板流程。
- 回滚验证同样要过第 4 步三验——"恢复快照"本身也是一次结构变更。
- 跨板牵连（如 orchestrator 名册与他板 board.json）逐板核对，不许"只改主板"。
