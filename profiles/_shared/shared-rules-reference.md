# 共享规则引用入口

> 本文件是所有 Hermes agent profile 的共享规则索引。
> 每个 SOUL.md 只需在末尾引用本文件，无需内联复制共享规则块。
> 修改共享规则时只需改 `_shared/` 下的对应文件，全集群自动生效。

---

## 共享规则文件清单

| 文件 | 用途 | 适用范围 |
|------|------|---------|
| `_shared/mandatory-acp.md` | 🔴 编码开发必须通过 ACP 调用 Claude Code | 33/33 profile |
| `_shared/forward-deployed-protocol.md` | 🔴 前线侦察 + Staged Action + Mission Coordinator | 33/33 worker profile |
| `_shared/ontology.md` | 🔴 共享对象模型（6 对象+22 动作+8 标记） | 33/33 profile |
| `_shared/marking-rules.md` | 🔴 安全标记传播（合取 AND + 机械校验） | orchestrator + 跨 board 路由 |
| `_shared/loop-engineering-gates.md` | 🔴 Loop Engineering 验证门 | 33/33 worker profile |
| `_shared/mandatory-privacy.md` | 🔴 隐私保护规则 | 33/33 profile |
| `_shared/chart-rules.md` | 🔴 绘图工具优先级（ECharts/AntV 首选） | 33/33 profile |

---

## 加载方式

在标准作业循环中，按需 `read_file` 以下文件：

```
~/.hermes/profiles/_shared/mandatory-acp.md          # 编码前必读
~/.hermes/profiles/_shared/forward-deployed-protocol.md  # 执行前必读（前线侦察）
~/.hermes/profiles/_shared/ontology.md               # kanban_complete metadata 必读
~/.hermes/profiles/_shared/marking-rules.md           # 跨 board 路由时必读
~/.hermes/profiles/_shared/loop-engineering-gates.md  # kanban_complete 前必读
~/.hermes/profiles/_shared/mandatory-privacy.md       # 全程生效
~/.hermes/profiles/_shared/chart-rules.md             # 绘图时必读
```

---

## 标准作业循环（所有 worker profile 通用）

1. `kanban_show()` — 读任务 body + 上游交接物
2. **前线侦察** — `read_file` + `search_files` + `session_search` + `hindsight_recall` + `skills_list`（详见 `_shared/forward-deployed-protocol.md` §2）→ 摘要写入 `kanban_comment`
3. 执行任务（编码通过 ACP 委托，见 `_shared/mandatory-acp.md`）
4. 验证（真实执行，非自述，见 `_shared/loop-engineering-gates.md`）
5. `kanban_complete(summary, metadata)` 或 `kanban_block(reason)` — metadata 用 `_shared/ontology.md` 定义的 property 名

---

## 退出协议

每次 run 的最后一个动作**必须**是 `kanban_complete` 或 `kanban_block`。以普通文本结尾 = 协议违规。
