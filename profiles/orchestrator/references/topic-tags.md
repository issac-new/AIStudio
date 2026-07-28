## 6. 话题标签规范 (Topic Tags)

### 6.1 标签定义

话题标签作为 tenant 字段的第二段（話題摘要），用于任务分类和筛选：

| 话题标签 | 用途 | 示例任务 |
|---------|------|---------|
| `feature` | 新功能开发 | 实现用户认证、添加报表导出 |
| `bugfix` | Bug 修复 | 修复登录失败、解决内存泄漏 |
| `review` | 代码 Review | Review PR #123、检查认证模块 |
| `research` | 技术调研 | 调研最佳认证方案、评估框架选型 |
| `refactor` | 重构 | 重构认证模块、优化数据层 |
| `deploy` | 部署 | 部署到生产环境、配置 CI/CD |
| `docs` | 文档 | 编写 API 文档、更新 README |
| `test` | 测试 | 编写单元测试、集成测试 |
| `infra` | 基础设施 | 配置监控、搭建开发环境 |

### 6.2 标签提取规则

**话题摘要格式**：`<话题标签>|<简短话题摘要>`

话题摘要作为 tenant 字段的第二段，完整格式为 `<标签>|<简短摘要>`。
**注意**：话题摘要内部使用 `|` 分隔，避免与 tenant 字段分隔符（冒号 `:`）冲突。

**话题标签来源（优先级从高到低）**：

1. **用户明确指定** `[标签]` 前缀 → 使用指定标签 + 提取简短摘要
2. **Channel Topic** 中包含标签 → 使用该标签 + Topic 作为摘要
3. **Agent 智能推断** → 根据消息关键词推断标签 + 提取简短摘要
4. **以上都无** → 話題摘要留空

**智能推断规则**（当无明确标签时）：

| 关键词模式 | 推断标签 | 示例 |
|-----------|---------|------|
| `bug/修复/报错/崩溃/失败/问题` | `bugfix` | "修复登录失败" → `bugfix|修复登录失败` |
| `实现/开发/添加/新建/功能` | `feature` | "实现用户认证" → `feature|用户认证` |
| `review/检查/审核/审查` | `review` | "review 认证模块" → `review|认证模块` |
| `调研/研究/分析/评估` | `research` | "调研认证方案" → `research|认证方案` |
| `重构/优化/改进/清理` | `refactor` | "优化数据层" → `refactor|数据层` |
| `部署/发布/上线/上线` | `deploy` | "部署到生产" → `deploy|生产部署` |
| `文档/README/API文档/说明` | `docs` | "编写API文档" → `docs|API文档` |
| `测试/单元测试/集成测试` | `test` | "编写单元测试" → `test|单元测试` |
| `监控/配置/环境/搭建` | `infra` | "配置监控" → `infra|监控配置` |

**简短摘要提取规则**：
- 从消息文本中提取核心名词或动词短语
- 限制在 10-20 字符内
- 去除停用词（的、了、一下、这个等）
- 保留关键信息（模块名、功能名、问题点）

### 6.3 标签示例

```python
# 用户明确指定标签
# 用户消息: "[bugfix] 修复登录失败问题"
tenant = "团队协作群:bugfix|修复登录失败:成员A:...:matrix"

# 用户消息: "[feature] 实现用户认证模块"
tenant = "团队协作群:feature|用户认证模块:成员B:...:matrix"

# 用户消息: "[review][P0] Review PR #123 认证逻辑"
tenant = "团队协作群:review|PR123认证逻辑:成员C:...:matrix"

# Channel Topic 包含标签
# Channel Topic: "feature|认证模块开发"
tenant = "团队协作群:feature|认证模块开发:成员D:...:matrix"

# Agent 智能推断（无标签前缀）
# 用户消息: "修复登录超时问题"
# Agent 推断: bugfix（匹配"修复"关键词）
tenant = "团队协作群:bugfix|登录超时:成员E:...:matrix"

# 用户消息: "调研一下最佳认证方案"
# Agent 推断: research（匹配"调研"关键词）
tenant = "团队协作群:research|认证方案:成员F:...:matrix"

# 用户消息: "部署到生产环境"
# Agent 推断: deploy（匹配"部署"关键词）
tenant = "团队协作群:deploy|生产部署:成员G:...:matrix"

# 无标签且无法推断
# 用户消息: "大家好"
tenant = "团队协作群::成员H:...:matrix"  # 話題摘要留空
```

### 6.4 标签筛选命令

```bash
# 查看所有 bugfix 任务
hermes kanban list --tenant "团队协作群:bugfix"

# 查看特定标签+摘要
hermes kanban list --tenant "团队协作群:bugfix:登录"

# 查看所有 review 任务
hermes kanban list --tenant ":review:"  # 跨群聊筛选

# 组合筛选
hermes kanban list --tenant "团队协作群:feature" --status running
```

---
