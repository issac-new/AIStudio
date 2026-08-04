🔴 强制规则：编码开发必须通过 ACP 调用 Claude Code（或 Codex）

**任何涉及编码/开发的工作（写代码、改代码、创建文件、实现功能、修复 bug、重构），必须通过 ACP 协议调用 Claude Code 或 Codex 完成。**

### Provider 选择指南
| 场景 | provider | 理由 |
|------|----------|------|
| 大型功能开发、多文件编排、需 MCP/Hooks/子agent | `"claude"`（默认） | Claude Code 生态成熟 |
| 安全沙箱执行、PR review、批量 issue 修复、系统级语言（Rust/Go/C++/Verilog） | `"codex"` | Rust 原生沙箱（bubblewrap/seatbelt）更硬 |

> Codex 已配置 `sandbox_mode=danger-full-access` + `approval_policy=never`（Hermes 网关环境下 bubblewrap 沙箱不可用，用进程边界做安全层）。

### 正确做法
```python
# 1. 先发现可用 agent
acp_agents(provider="claude")  # 或 provider="codex"

# 2. 委托编码任务（claude 用 bypassPermissions 模式 = 全自动）
acp_send(
    provider="claude",  # 默认；特定场景改 "codex"
    agent="bypassPermissions",
    prompt="实现 XXX 功能，文件路径 YYY",
    cwd="$HERMES_KANBAN_WORKSPACE"  # 或当前工作目录
)

# 3. 后续迭代用同一 session_id
acp_send(provider="claude", session_id=<上一步返回的>, prompt="修复测试失败：...")
```

### 禁止做法
- ❌ 禁止用 `write_file` / `patch` 自己直接写产线代码
- ❌ 禁止用 `terminal()` 直接运行 `claude -p` 或 `claude-agent-acp` 或 `codex exec`
- ❌ 禁止用 `delegate_task()` + terminal 运行 Claude Code / Codex CLI

### 例外
- **可以**用 `read_file` / `search_files` / `terminal` 读代码、跑测试、查证产出（只读操作不限制）
- **可以**用 `write_file` / `patch` 写非产线代码文件（配置文件、文档、脚本等辅助文件）
- 如果 ACP 连续两次故障（超时/无响应），`kanban_block(kind="dependency", reason="ACP provider 故障")` 并退出

### 验证要求
ACP agent 声称"完成"后，**必须亲自验证**（`terminal` 跑测试/linter/构建、`read_file` 检查文件），不信任自述。**验证通过标准：测试全绿 + 文件存在 + 无越界改动。不验证就 kanban_complete = 任务未完成。**