---
name: orchestrator-lessons
description: "Orchestrator 实战教训：崩溃恢复/教条审查/patch 生命周期/fleet 传播纪律。"
version: 1.0.0
metadata:
  hermes:
    tags: [orchestrator, crash-recovery, dogma-audit, patch-persistence, fleet-propagation]
    related_skills: [kanban-orchestrator, kanban-crash-recovery, fusion-governance-patterns, soul-framework-propagation]
---

# Orchestrator 实战教训（本会话沉淀）

> 只记**在本会话里踩坑并修正后验证过**的规则。通用知识在各母本 skill 里，此处只存 orchestrator 亲历的实测修正。

## 一、崩溃恢复：先验证磁盘再写恢复包

**坑**：worker 在收尾前崩溃（卡 90% 完）。我差点写恢复包重派，实际磁盘产物已全在、质量合格。

**规则**：
1. 恢复包前**必先 grep 磁盘**：任务关键锚点是否真实存在（grep 目标文件/关键词/行号）
2. 若完整且满足 frozen 验收 → 直接 orchestrator complete，跳过重派
3. 若部分 → 恢复包只列缺失项，不重做
4. 若环境级失败（worktree locked / git timeout） → 先修环境，再注入恢复包说明“根因已修，勿重复诊断”

**验证**：本会话 t_4eb5ebc3 worker 重派前三次失败，run 273 实际已干完 90% 并落盘，最终 orchestrator 独立验收通过后直接 complete，零重派成本。

## 二、教条审查：先二分再处置

**坑**：发现“无消费方”即想剪裁，结果把“先于使用存在”的方法层资产（四问/透镜/偏差清单）差点误删。

**二分判据**：
- **假声称**（文档/版本记录与实况不符）→ 立即改声称，不需裁决——唯一不可容忍项
- **无消费方的契约层设备** → 移档案（带来源头+复查条件+指路行），检查上游脚本断链
- **先于使用存在的方法层资产** → 保留，标注状态/Exercised 判据；设观察期（30 天零调用且零产物影响→归档），**不因无留痕即删**

**三通道验证**：
- A 结构化（铸进格式与门，产物天然携带证据）
- B 决策界面（按需加载，抽查产物质量，**不查 comment 仪式**）——四问/透镜/偏差清单走此通道
- C 仪式化（强制 comment+执行率统计）**仅限有实测失败基线且复发频繁**；无基线不新建（Goodhart 诱饵）

## 三、patch 生命周期：三件套 + 回放登记 + 行为验证先行

**本会话教训**：F-2 stamp patch 两次被 update 洗掉（20:28/20:46），根因：只存私有目录、未登记 apply-source-patches.sh 清单。

**完整链路**：
1. 源码改动标记区块 `# >>> swarm:feature >>>` 成对
2. git diff 生成标准 patch（untracked 先 `git add -N`）
3. **行为验证先行**：先写样例集跑修复后逻辑，再生成 patch
4. 复制到 `~/.hermes/patches/hermes-<feature>.patch`
5. **登记进 `~/.hermes/patches/apply-source-patches.sh` 的 SPECS 清单**
6. 幂等实测：跑 apply 脚本 → 输出 PRESENT skip（rc=0），不能假定登记即生效

**验证**：update 41844 连跑两轮，apply 重放两次恢复，rc=0，机制闭环。

## 四、fleet 传播：单一事实源 charter + 三通道应用

**坑**：先在 47 个 SOUL 全文写四问，再发现 charter 变版要改 47 处。

**修正**：
- charter (`_shared/02-org-orchestration/four-lenses-charter.md`) 做单一事实源
- SOUL 只挂一行引用（`four-lenses-charter.md` 字符串 grep 命中即达标）
- 方法层资产走 B 通道（决策界面），**不造 comment 仪式**
- charter 本身已加《应用通道三分法》与《反 Goodhart》声明

**验证**：t_e7a7462e 批量写入 46 文件，grep 逐字节一致，47/47 全挂接；后续 charter 修订（v1→v2 融合重写），SOUL 零改动自动生效。

## 五、进度汇报：只报三点，禁事务清单

用户风格：选项编号裁决、费曼标准、批判性分析。

**汇报模板**：
1. 资源效率 — 吞吐/复用率/释放产能
2. 系统风险 — risk-register Top3 + 红黄绿灯
3. 能力沉淀 — 新增 skill/对策库/经验入库

**禁止**：逐步骤流水账、自述完成率、未经验收的预测。

## 六、工程验收：机械重测不沿用旧值

- 设计文档数字一律重测（find/sqlite/ls/skills list），grep 旧值扫残留
- archive 新文件计入全量计数 → 规模表同步（46→47 扩展资产）
- cq 脚本修复判据：**实跑 rc=0 并贴输出摘要**，不以“改完”为准
- sqlite DELETE 前先 `.backup` 快照，只删夹具行，真实数据禁动
- 双库（_shared + workspace）分别 commit，hash 写进 metadata

## 七、风险登记：update 期间的竞态

- `hermes update` 正在跑时**绝不并发修改源码树**（等 update 结束后再核验+重放）
- update 结束后必跑 `bash ~/.hermes/patches/apply-source-patches.sh` 验证所有 patch 重放
- watchdog 心跳自动跑 apply（幂等 PRESENT skip），不需人工记忆

## 八、已知反模式（本会话修正）

| 反模式 | 修正 |
|---|---|
| 发现无消费方即想剪裁 | 先二分：假声称改声称；先于使用存在=保留+观察期 |
| 批量写 SOUL 全文而非挂 charter 引用 | 单一事实源 charter，SOUL 只挂一行引用 |
| patch 只存私有目录不登记回放清单 | 标准位 + SPECS 清单 + 幂等实测 |
| 发现 worker 崩溃即写恢复包 | 先验证磁盘，完整即直接 complete |
| 设计文档数字沿用旧值 | 机械重测，grep 旧值扫残留 |
| 为“可验证”给所有知识加 comment 仪式 | 无失败基线不新建仪式（Goodhart 诱饵） |
| 处置意见先于二分 | 先分类（假声称 vs 先于使用），再选动作 |

---

**一句话**：orchestrator 只管路由、分解、验收、传播；不亲自干活；不编造状态；一切以磁盘/机械实测为准。