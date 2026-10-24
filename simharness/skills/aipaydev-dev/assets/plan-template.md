# 实施计划：<feature 名称>

> **For agentic workers:** 按 Task 逐个推进，每个 Task 完成即 commit。步骤用 checkbox (`- [ ]`) 跟踪。

**Goal:** （一句话目标）

**Architecture:** （架构摘要：改造分类、模块、依赖关系）

**Tech Stack:** （项目技术栈摘要）

**Spec:** `docs/specs/YYYY-MM-DD-<feature>-design.md`（按项目实际路径）

---

## 前置准备

**分支（遵循项目规范）：** 基于 main 建 feature 分支。

**起点核验：**
```bash
cd <项目根>
git branch --show-current          # 应为 main
git rev-parse HEAD
git rev-parse main                 # 应与 HEAD 相等
git status --porcelain             # 应为空或只有文档
```

**测试基线：** `<test 命令>` = ___ passed

**关键边界（来自 spec §非目标）：**
- （列出不做的事）

---

## 文件结构

| 文件 | 动作 | 类型 | 职责 |
|------|------|------|------|
| `<路径>` | 新建/修改 | <分类> | |
| `<路径>` | 新建 | <分类> | |

---

### Task 1: 建 feature 分支（含起点核验）

**Files:** 无文件改动

- [ ] **Step 1: 核验起点**
  ```bash
  cd <项目根>
  git branch --show-current
  git rev-parse HEAD && git rev-parse main
  git status --porcelain
  ```
- [ ] **Step 2: 建分支**
  ```bash
  git checkout main
  git checkout -b <分支规范>/<feature-name>
  ```
- [ ] **Step 3: 记录测试基线**
  ```bash
  <test 命令> 2>&1 | tail -5
  ```

---

### Task 2: <具体任务>

**Files:** `<路径>`

- [ ] **Step 1: ...**
- [ ] **Step 2: ...**
- [ ] **Step 3: 验证**
  ```bash
  <dev 命令>   # 手动验证
  <test 命令>
  ```
- [ ] **Step 4: Commit**
  ```bash
  git add -A
  git commit -m "<类型>(<scope>): <描述>"
  ```

---

### Task N: 合入 main（需用户确认）

- [ ] **Step 1: rebase main**
  ```bash
  git fetch origin
  git rebase origin/main
  <test 命令>   # rebase 后重跑
  ```
- [ ] **Step 2: 合并（需用户确认）**
  ```bash
  git checkout main
  git merge --no-ff <分支> -m "merge: <分支>"
  ```
- [ ] **Step 3: 不自动推送**（除非用户明确要求）

---

## 完成检查表

- [ ] 改动仅在可改目录，<范围检查命令> 通过
- [ ] <分类>改动已正确接入（patch 入 series / 模块已注册）
- [ ] `<test 命令>` 全绿，不退化于基线
- [ ] 敏感信息已脱敏
- [ ] spec/plan 已归档到 <文档目录>
- [ ] 已合入 main（合入策略符合项目规范）
- [ ] 未自动推送远端（除非用户明确要求）

---

## §20 ★变更左移（Shift-Left Change——plan 阶段写变更影响+回滚预案）

> **铁律：变更影响不在合入前才考虑，须在 plan 阶段写变更影响范围+回滚预案。** precheck `--shift-left` 校验本段存在 + 回滚预案声明 + 迁移兼容。
> 简单变更可简化（只填影响范围+回滚方式）；标准/完整变更须填全部子段。

### §20.1 变更影响范围
| 变更文件/模块 | 消费方（谁依赖它） | 影响类型（API/数据/行为/配置） | 回归测试范围 |
|--------------|-------------------|---------------------------|-------------|
| （列出本次变更的文件/模块） | （grep 反查消费方） | （Breaking/Compatible/Internal） | （须回归的用例） |

### §20.2 回滚预案
- **回滚方式**：git revert / 功能开关关闭 / 数据库回滚迁移 / 蓝绿切换
- **回滚验证**：回滚后如何确认（健康检查/冒烟测试/监控指标）
- **回滚窗口**：发布后多久内可回滚（超时则须数据修复）
- **数据库迁移兼容**：
  - [ ] 向前兼容（旧代码能读新 schema）或双写期已设
  - [ ] 无破坏性 DDL（DROP TABLE/COLUMN）或已确认可丢失
  - [ ] 迁移可回滚（down migration 存在）

### §20.3 灰度策略（如适用）
- **灰度方式**：功能开关 / 按用户百分比 / 按租户 / 金丝雀部署
- **灰度验证指标**：错误率/延迟/业务指标
- **全量发布条件**：灰度指标达标 + 无告警 + 运维确认
