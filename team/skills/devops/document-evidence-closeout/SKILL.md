---
name: document-evidence-closeout
description: Use when closing multi-pass doc edits with runtime evidence.
version: 1.0.0
metadata:
  hermes:
    tags: [devops, documentation, verification, orchestrator]
    related_skills: [design-doc-sync-audit, doc-runtime-consistency]
---

# 文档证据收口（document-evidence-closeout）

用于多轮设计文档 / 差距台账编辑，尤其是把运行时修复、临时兼容层或未完成门禁写入设计文档时。目标：文档同时保留成功路径与证据边界，避免「能写入」被误报成「机制已恢复」。

## 执行流程

1. **先定位唯一事实源**：确认正文设计文档、差距台账、运行时实现的实际路径；不把 workspace 镜像、profile 副本、历史快照当运行时事实源。
2. **分层记录证据**：「模块可导入」「调用路径可执行」「允许路径通过」「拒绝路径拦截」「篡改/重放测试通过」分别记；临时 pass-through 最多证明前两层。
3. **先查再写**：写入事件块或 gap 条目前按唯一 ID / 标题统计出现次数。0 才追加，1 才定点更新，>1 先去重。禁全局替换掩盖重复。
4. **保留失败边界**：成功写入、状态变更或健康探针不能覆盖原始失败证据；缺失的 `GateBlockedError`、证据校验、fail-closed、负向回归必须列为未完成。
5. **正文与台账同措辞**：正文记机制状态与证据边界，台账记可追踪 gap ID、判定、触发条件、关闭条件；不得一处写「已恢复」另一处写「未恢复」。
6. **终验唯一性**：事件块、gap ID、关键边界声明各出现一次；旧的过强措辞零残留。大文件先完整读取或用受控脚本去重再 patch（分页快照 / 并发改写会让 patch 报 no_change 或误改）。

## 常见陷阱

- **不要把临时恢复写成 canonical 修复**：pass-through 绕过原门禁逻辑，只可报告可达性，不得宣称 fail-closed 已恢复。
- **不要用 `replace_all=true` 编辑内容块**：多匹配会同时改写事件段造成重复；全局替换只用于符号级替换。
- **不要把台账条目当普通追加日志**：gap 台账依赖唯一锚点幂等，重复 ID 破坏 docsync 去重契约。
- **不要只验成功路径**：状态写入成功不证明拒绝路径、篡改检测、重放防护成立。
- **分页读取不是完整编辑基线**：读取被截断或文件被并行进程改写后必须重新取当前内容、确认唯一上下文再写。

## 机械验收模板

```bash
rg -n -c '事件锚点|gap-[0-9a-z-]+' <design-doc> <gap-ledger>   # 唯一性
rg -n '完整.*恢复|canonical.*已恢复|fail-closed.*通过' <design-doc> <gap-ledger>  # 过强措辞残留
git diff --check
git status --short
```

验收输出必须分三类：**已验证** / **仅可达（局部验证）** / **仍待验证**。