# 完成定义清单（DoD Checklist — 共享参考）

> 来源：Hermes × Better Harness 融合 P1-2；与 workspace 根目录 `AGENTS.md` 互补
> 适用：所有 worker 在 `kanban_complete` 前逐项自检
> 版本：v1.0（2026-08-21）

---

## 核心原则

**"看起来完成" ≠ "真实完成"**。kanban_complete 前必须逐项打勾，不接受"我觉得没问题"。

参照 Better Harness 证据强度分级：**配置存在 ≠ 被使用 ≠ 改善结果**。

---

## 第一层：通用项（所有任务必须过）

### 1. 产出物真实性
- [ ] `ls <每个 changed_file>` 确认文件真实存在（非空、非路径幻觉）
- [ ] 文件内容非空且非占位符（无 TODO/FIXME 遗留，除非显式声明）

### 2. 范围边界
- [ ] `git status` / `git diff` 确认只动了任务范围内文件
- [ ] 无顺手重构、无关格式化、drive-by 修改
- [ ] 如任务要求"只调研不开发"，确认没有写实现代码

### 3. 安全与隐私
- [ ] diff 中无硬编码 secret / API key / token
- [ ] 未将 `.env` / 凭据文件加入版本控制
- [ ] 未在输出中暴露完整 session_id / 绝对路径（[已移除] 域额外：无孩子 PII）

### 4. 验收标准对齐
- [ ] 逐条对照 kanban body 的验收项打勾（不接受"大致符合"）
- [ ] 如验收项不清晰，先 `kanban_comment` 澄清，而非自行解释

---

## 第二层：领域特定项

### 编码类（worker-coder / ops-devops / [已移除]）
- [ ] 语法检查通过（`python -m py_compile` / `tsc --noEmit` / `bash -n`）
- [ ] 类型检查通过（如项目有 type hints）
- [ ] 单元测试全绿（`pytest -v` 或对应框架）
- [ ] linter 通过（`ruff check` / `eslint`）
- [ ] 构建成功（`npm run build` / `make build`）
- [ ] ACP session_id 真实（从 `acp_sessions` 输出取）

### 研究/调研类（worker-researcher / product-researcher）
- [ ] 每个关键数字/结论有 file:line 或 URL 锚点
- [ ] 无编造数据（不输出"看起来合理"但无来源的数字）
- [ ] 关键结论至少 2 个独立来源确认
- [ ] 数据获取时间 + 数据时间窗口已标注

### 安全/渗透类（hack 团队）
- [ ] 关键发现至少 3 个独立来源交叉确认（ASN + DNS + 证书透明度）
- [ ] severity 有依据（critical/major/minor 分级明确）
- [ ] 复现步骤可执行（提供验证命令）
- [ ] 测试边界显式声明

### 教学/内容类（[已移除] 团队）
- [ ] 年龄适配已验证（参考 `child-profile.md` 动态计算）
- [ ] 反馈话术符合关系导向（禁"你不笨"→ 转"需要练习"）
- [ ] 过程性反馈具体可观察（非泛泛表扬）
- [ ] 妈妈可直接使用（务实、去学院腔）

### 运维/事件类（ops 团队）
- [ ] 回滚预案明确（可逆性分级：容易/可逆/不可逆）
- [ ] 影响面评估完成（blast radius 明确）
- [ ] 监控/告警已确认覆盖
- [ ] runbook/playbook 已同步更新

---

## 第三层：交接质量项

- [ ] `kanban_complete` 的 `summary` 是人类可读的 1-3 句（非"完成了任务"）
- [ ] `metadata` 包含 `changed_files` 列表（绝对路径）
- [ ] 如有后续工作，已 `kanban_create` 子任务（而非自己 scope-creep）
- [ ] 如有产物文件，已列入 `artifacts=[...]`（而非只放 metadata）

---

## 证据强度自评（参照 Better Harness 评分上限表）

kanban_complete 前自评当前任务的证据强度：

| 等级 | 上限分 | 判定标准 | 自检问题 |
|---|---|---|---|
| Missing / Unobserved | 59 | 机制不存在或未观测 | 我是否真的跑了验证，还是"假设它会工作"？ |
| Present | 74 | 机制存在但未接线 | 工具/脚本存在，但我真的用了吗？ |
| Wired | 84 | 机制已接线可用 | 验证步骤是否已集成到工作流？ |
| Exercised | 94 | 机制被使用且留有结果 | 本次任务是否实际执行了验证？ |
| Outcome-supported | 100 | 可比后续结果支持效果 | 之前的验证是否带来了可量化的改进？ |

**自评 ≤74 分 → 不应 kanban_complete，先补齐证据。**

---

## 反模式（常见"假完成"信号）

- ❌ "我看了 agent 输出，觉得没问题" → 没跑就是没跑
- ❌ "测试在另一个 PR 跑了" → 不在本任务就是没跑
- ❌ "看起来对" → 没有 `ls` / `py_compile` / 测试输出 = 没验证
- ❌ 跳过 linter / build 节省时间 → 历史教训：省 1 分钟炸 1 小时
- ❌ "大致完成了" → 验收标准逐条打勾，不接受模糊

---

## SOUL 内单行引用

```
完成定义清单（详见 _shared/dod-checklist.md）：通用 4 项 + 领域特定 + 交接质量 + 证据强度自评，≤74 分不 complete。
```
