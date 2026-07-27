---
name: hermes-acp-claude-code
description: "集成 Claude Code 与 Hermes Agent 通过 ACP 协议 — 安装、配置、使用"
version: 1.0.0
author: Hermes Agent
platforms: [macos, linux]
metadata:
  hermes:
    tags: [ACP, Claude, Claude-Code, Integration, Plugin]
    related_skills: [claude-code, hermes-agent]
---

# Hermes ACP Claude Code 集成手册

通过 `@agentclientprotocol/claude-agent-acp` + `hermes-plugin-acp-client`，让 Hermes Agent 通过 ACP (Agent Client Protocol) 协议调用 Claude Code。

## 架构概览

```
Hermes Agent  ←→  hermes-plugin-acp-client  ←→  claude-agent-acp (ACP server)
                         ↑                           ↑
                    config.yaml             ANTHROPIC_AUTH_TOKEN / API_KEY
```

`claude-agent-acp` 将 Claude Agent SDK 包装为 ACP JSON-RPC 2.0 标准协议服务器，通过 stdin/stdout 通信。

## 环境要求

- Node.js ≥ 18（Hermes 自带的 Node 可用）
- Claude Code CLI 已安装并认证（可选，用于复用 OAuth 代理）
- 以下之一：
  - **选项 A**: `ANTHROPIC_API_KEY` — 直连 Anthropic API
  - **选项 B**: `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` — 通过代理（如 CC Switch、Kimi Proxy）

## 完整安装步骤

### 1. 安装 claude-agent-acp

```bash
# 使用 Hermes 自带 Node.js 全局安装（必须 --prefix 指向 Hermes node 目录）
npm install -g @agentclientprotocol/claude-agent-acp@latest --prefix ~/.hermes/node

# 验证安装（--version 可能输出为空，正常现象）
claude-agent-acp --version
which claude-agent-acp
# → ~/.hermes/node/bin/claude-agent-acp

# ⚠️ 注意：如果系统有多个 Node.js（如 Homebrew），裸 `npm install -g` 会装到系统
# node_modules 而非 Hermes 的 ~/.hermes/node/，导致 Hermes 找不到新版本。
# 必须加 --prefix ~/.hermes/node 确保 Hermes 的 node 用到正确版本。

# 验证 ACP 初始化握手
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"verify","version":"1.0"},"clientCapabilities":{}}}' | \
ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED \
ANTHROPIC_BASE_URL=http://127.0.0.1:15721 \
timeout 15 ~/.hermes/node/bin/claude-agent-acp 2>/dev/null | \
python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',{}); ai=r.get('agentInfo',{}); print(f'Agent: {ai.get(\"name\",\"?\")} v{ai.get(\"version\",\"?\")}')"
# 期望输出: Agent: @agentclientprotocol/claude-agent-acp v0.61.0
```

### 2. 安装 acp-client 插件

```bash
hermes plugins install anpicasso/hermes-plugin-acp-client
```

### 3. 修改插件代码，添加 claude provider

编辑 `~/.hermes/profiles/<profile>/plugins/acp-client/__init__.py`，在 `_resolve_provider()` 函数中（`codex` 分支之后）添加：

```python
elif name == "claude":
    # 方式1：直接二进制路径（推荐）
    binary = provider_cfg.get("binary", "")
    if binary:
        binary = os.path.expanduser(binary)
        if not os.path.isfile(binary):
            raise FileNotFoundError(
                f"Claude ACP binary not found at '{binary}'. "
                f"Install with: npm install -g @agentclientprotocol/claude-agent-acp"
            )
        return [binary], "Claude Agent"

    # 方式2：通过 npx（备用）
    npx = provider_cfg.get("npx", "npx")
    npx_path = shutil.which(npx)
    if not npx_path:
        for candidate in [
            "/home/linuxbrew/.linuxbrew/bin/npx",
            "/usr/local/bin/npx",
            os.path.expanduser("~/.nvm/current/bin/npx"),
        ]:
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                npx_path = candidate
                break
    if npx_path:
        package = provider_cfg.get("package", "@agentclientprotocol/claude-agent-acp")
        return [npx_path, package], "Claude Agent"

    raise FileNotFoundError(
        "Claude ACP provider requires either:\n"
        "  1) binary path to claude-agent-acp, or\n"
        "  2) npx (Node.js) to run @agentclientprotocol/claude-agent-acp"
    )
```

同时在 `else` 分支的错误信息中添加 `claude`：

```python
raise ValueError(
    f"Unknown ACP provider: '{name}'. Available: opencode, codex, claude"
)
```

### 4. 创建插件配置

编辑 `~/.hermes/profiles/<profile>/plugins/acp-client/config.yaml`：

```yaml
# ACP Client Plugin Configuration
default_provider: claude
default_cwd: ~/hermes-docker-sandbox/workspace   # 推荐绝对路径
# default_cwd: "~"   # 如用 ~，必须加引号，否则 YAML 解析为 null
auto_approve: true

providers:
  opencode:
    binary: ~/.opencode/bin/opencode
  codex:
    npx: npx
    package: "@zed-industries/codex-acp"
  claude:
    # 直接指定二进制路径（推荐）
    binary: ~/.hermes/node/bin/claude-agent-acp
    # 或通过 npx:
    # npx: npx
    # package: "@agentclientprotocol/claude-agent-acp"
```

### 5. 配置认证

在 `~/.hermes/profiles/<profile>/.env` 中添加：

```bash
# 选项 A：直连 Anthropic API
ANTHROPIC_API_KEY=sk-ant-************

# 选项 B：通过 CC Switch 代理（复用 Claude Code OAuth）
ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED
ANTHROPIC_BASE_URL=http://127.0.0.1:15721
```

### 6. 启用插件并重启

```bash
# 启用插件
hermes plugins enable acp-client

# 重启 gateway
hermes gateway restart
```

## 多 Profile ACP 配置

当在某个工作 profile（如 `worker-coder`）中启用 ACP 插件后，**orchestrator profile 也需要同步更新**，否则 orchestrator 无法通过 `acp_send` 委托任务。

### 检查清单

| 项目 | 位置 | 说明 |
|------|------|------|
| `acp` toolset | `config.yaml` 的 `toolsets` | 必须包含 `acp`，否则 agent 看不到 `acp_send` 等工具 |
| `default_provider: claude` | `plugins/acp-client/config.yaml` | 设为 `claude` 使默认走 Claude Code |
| `_PROVIDER_DESC` 含 `'claude'` | `plugins/acp-client/__init__.py` ~L1036 | 必须列出 `'claude'`，否则 LLM 认为不合法 |
| Claude ACP 二进制路径 | `plugins/acp-client/config.yaml` 的 `providers.claude.binary` | 指向 `claude-agent-acp` |
| `default_cwd` 存在 | `plugins/acp-client/config.yaml` | 推荐绝对路径，如 `~/hermes-docker-sandbox/workspace`；如用 `~` 必须加引号 `"~"` |

### 修改 Profile 配置

`config.yaml` 是安全敏感文件，不能直接用 `patch` 修改。需要使用 `hermes config set` 命令：

```bash
# 给 orchestrator 添加 acp toolset
hermes config set toolsets "hermes-cli,acp,kanban,memory,messaging,terminal" --profile orchestrator

# 给 worker-coder 添加 acp toolset（如尚未添加）
hermes config set toolsets "hermes-cli,acp,kanban" --profile worker-coder
```

### 跨 Profile 文件编辑

当需要修改**其他 profile** 的插件文件时（如当前在 `orchestrator` 下，要编辑 `worker-coder` 的 `__init__.py`），`patch` 工具会触发跨 profile 写保护：

```python
# 需要在 patch 调用中添加 cross_profile=True
patch(
    path="~/.hermes/profiles/worker-coder/plugins/acp-client/__init__.py",
    old_string="...",
    new_string="...",
    cross_profile=True   # 绕过保护
)
```

仅当用户明确指示编辑其他 profile 的文件时才使用此标志。

### 快速同步配置

```bash
# 列出所有 profile
ls ~/.hermes/profiles/

# 检查每个 profile 的 ACP 状态
for p in ~/.hermes/profiles/*/; do
  name=$(basename $p)
  echo "=== $name ==="
  grep 'toolsets' "$p/config.yaml" 2>/dev/null
  [ -f "$p/plugins/acp-client/config.yaml" ] && echo "  ACP plugin: YES" || echo "  ACP plugin: NO"
  echo ""
done
```

## 验证集成

```bash
# 终端验证 ACP 初始化链路
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"verify","version":"1.0"},"clientCapabilities":{}}}' | \
ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED \
ANTHROPIC_BASE_URL=http://127.0.0.1:15721 \
timeout 10 ~/.hermes/node/bin/claude-agent-acp 2>/dev/null | \
python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',{}); print(f'Agent: {r.get(\"agentInfo\",{}).get(\"name\",\"?\")} v{r.get(\"agentInfo\",{}).get(\"version\",\"?\")}')"
# 期望输出: Agent: @agentclientprotocol/claude-agent-acp v0.61.0
```

## 日常使用

在新会话（`/reset` 或新窗口）中：

### 列出可用 agent

```python
acp_agents(provider="claude")
```

### 发送单次任务

```python
acp_send(
    provider="claude",
    prompt="实现一个 FastAPI 用户认证模块，包含 JWT 登录和注册接口"
)
```

### 多轮对话

```python
# 第一轮
r1 = acp_send(provider="claude", prompt="分析项目结构并创建骨架代码")
# → 返回 session_id: "ses_xxx"

# 后续轮次（传递 session_id 继续对话）
acp_send(provider="claude", prompt="添加数据库模型", session_id=r1["session_id"])
acp_send(provider="claude", prompt="添加测试用例", session_id=r1["session_id"])
```

### Agent Mode 选择

Claude Code ACP 提供多种 agent mode，通过 `acp_agents()` 可查看完整列表：

| Agent Mode | 文件写入 | 终端执行 | 适用场景 |
|------------|----------|----------|----------|
| `default` | 弹窗询问 | 弹窗询问 | 交互式开发，需要人工确认 |
| `bypassPermissions` | ✅ 自动放行 | ✅ 自动放行 | **全自动工作流（推荐）** |
| `acceptEdits` | ✅ 自动放行 | 弹窗询问 | 只信任文件编辑的场景 |
| `dontAsk` | ❌ 拒绝 | ❌ 拒绝 | 只读审查 |
| `plan` | 不执行工具 | 不执行工具 | 纯规划，无代码执行 |
| `auto` | 模型判断 | 模型判断 | 交给模型自主判断权限 |

```python
# 查看可用 agent mode
acp_agents(provider="claude")

# 使用全自动模式（自动批准文件写入和终端操作）
acp_send(provider="claude", agent="bypassPermissions",
         prompt="实现一个排序算法")
```

⚠️ **重要区别**：`auto_approve: true`（config.yaml 配置）处理的是 **ACP 协议层面的权限请求**（Claude Agent SDK 发出的 permission 通知），而 **agent mode** 控制的是 Claude Code 自身的行为策略。最佳实践：两者都配置——`auto_approve: true` + `agent="bypassPermissions"`。

⚠️ **已知限制**：`default` 模式下即使 `auto_approve: true` 已启用，Claude Code 的 "harness" 仍可能拒绝文件写入（类似 sandbox 保护）。此时必须切换至 `bypassPermissions` 模式才能继续。

### ⚠️ 关键规则：Claude Code 返回确认项时必须转交用户

**任何时候** Claude Code 返回待确认问题时（包括选项 A/B/C/D、询问数组规模、设计选择、边界条件等），使用 Hermes 的 Agent **绝对不可以自行决策或代替用户回答**。

正确的处理流程：
1. **停止执行**，将 Claude Code 返回的待确认问题完整截取
2. **@用户转发问题**，等待用户给出明确指示
3. **用户决策后**，再用 `acp_send(session_id=..., prompt="用户的决策")` 传给 Claude Code 继续

```python
# ❌ 错误：自行回答了 Claude 的提问
# acp_send(session_id=sid, prompt="选方案2")

# ✅ 正确：转发给用户确认
# [orc]: Claude Code 询问数组规模选哪个：
#  A. 10 元素（肉眼验证）
#  B. 100 元素
#  C. 10000 元素（性能对比）
#  D. 你来自定义
# @TL 请确认选哪个？
#
# [TL]: 选 D
# → 然后才传给 Claude Code 继续
```

### 确认返回场景测试

需要测试 Claude Code 返回"待确认问题"的行为时：

1. 使用 `default` agent mode（或 `agent` 参数留空）
2. 给一个含多个选项的模糊任务（如"实现排序算法——选择建议哪个？"）
3. Claude Code 会分析并返回建议，`stop_reason: end_turn` 等待确认
4. **必须转交用户确认**，得到用户指示后再传给 Claude Code

```python
# 步骤 1：发送模糊任务（default mode）
r = acp_send(provider="claude",
    prompt="我需要实现排序算法。推荐选项：单文件/多算法包/CLI？先给建议，等我确认再写")
# → 返回建议，stop_reason: end_turn
# → ⛔ 不要自行继续！转发给用户确认

# 步骤 2：用户确认后继续
r = acp_send(provider="claude", agent="bypassPermissions",
    prompt="选方案2，开始创建", session_id=r["session_id"])
```

### 跨 Provider 编排

```python
# Codex 做代码审查（只读）
review = acp_send(provider="codex", agent="read-only",
    prompt="Review the codebase for security issues")

# Claude Code 修复发现的问题
acp_send(provider="claude",
    prompt=f"Fix all security issues found in review: {review['text']}")
```

## 协议细节

详见 `references/acp-protocol-details.md`。关键要点：

- `session/prompt` 的 `prompt` 参数必须是**消息数组**，非字符串
- `session/resume` 在 `subprocess.communicate()` 模式下**无响应**（异步处理 + stdin 关闭触发 shutdown）
- 不同 provider 的会话创建方法名不同（claude 用 `session/resume`，opencode/codex 用 `session/new`）

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `acp_agents/provider not found` | 插件未加载 | 执行 `/reset` 或重开窗口 |
| `FileNotFoundError: binary not found` | 二进制路径错误 | 检查 `which claude-agent-acp`，更新 config.yaml |
| ACP 初始化超时 | 代理不通或 API key 无效 | 验证 `curl http://127.0.0.1:15721` |
| `ConnectionError: ACP subprocess died` | claude-agent-acp 启动失败 | 直接运行看 stderr 输出 |
| `authMethods: []` 但请求失败 | OAuth token 过期 | 在 Claude Code 中 `claude auth login` 刷新 |
| `expected str, bytes or os.PathLike object, not NoneType` | `default_cwd: ~` 被 YAML 解析为 null（`~` 是 YAML null 字面量） | 改为 `default_cwd: "~"`（加引号）或使用绝对路径 |
| 手动 ACP call 无响应 | session/resume 异步问题 | **走插件路径**，不要手动调 ACP 协议 |
| **agent 调用的是 OpenCode 而非 Claude** | `_PROVIDER_DESC` 没写 `claude` | 详见下方 ⚠️ 关键陷阱 |

### ⚠️ 关键陷阱：调用 Clode Code 必须走 ACP

当通过 Hermes 调用 Claude Code 时，**必须只走 `acp_agents()` / `acp_send()` 工具**，不得使用替代方式：

- ❌ **禁止**：`delegate_task()` + terminal 直接运行 Claude Code CLI
- ❌ **禁止**：`terminal()` 直接启动 claude-agent-acp
- ✅ **正确**：`acp_agents(provider="claude")` → `acp_send(provider="claude", agent="bypassPermissions", ...)`

如果 ACP 插件出现故障，应当**修复插件本身**（如修正 config.yaml、更新 `_PROVIDER_DESC`），而不是绕开 ACP 改用其他方式。否则失去 ACP 的会话管理、流式更新、权限系统等核心能力。

### ⚠️ 关键陷阱：工具描述遗漏 `claude` 导致 agent 调用 OpenCode

该插件 `__init__.py` 中的 `_PROVIDER_DESC` 字符串（约第 1036 行）仅列出了 `'opencode' or 'codex'`，没有提及 `claude`：

```python
_PROVIDER_DESC = (
    "ACP provider to use: 'opencode' or 'codex'. "
    "Defaults to config default_provider."
)
```

当 LLM（如 deepseek-v4-flash）看到 `acp_send` 工具的 `provider` 参数描述时，会认为合法值只有 "opencode" 和 "codex"。即使：
- `config.yaml` 设置了 `default_provider: claude`
- `SOUL.md` 指示使用 `provider="claude"`

许多模型仍会信任工具 schema 描述，默认选择 "opencode"（因为它是第一个列出的）。

**修复方法**：将 `_PROVIDER_DESC` 更新为：

```python
_PROVIDER_DESC = (
    "ACP provider to use: 'opencode', 'codex', or 'claude'. "
    "Defaults to config default_provider."
)
```

添加完 `_resolve_provider()` 的 `claude` 分支后，**务必同步更新 `_PROVIDER_DESC`**，否则 agent 行为会异常。

## Kanban Worker 集成

ACP 插件可与 Hermes Kanban 系统配合使用：worker-coder 收到编码任务后，通过 `acp_send(provider="claude")` 委托给 Claude Code 执行。

详见 `skill_view(name="acp-agent-integration", file_path="references/kanban-worker-acp-pattern.md")`。

关键配置：
```bash
# 在 worker-coder 配置中添加 acp toolset
toolsets:
- hermes-cli
- acp
- kanban
```

## 替代方案：acp-cli

社区 Rust 工具 [acp-cli](https://github.com/motosan-dev/acp-cli) 提供 headless ACP 客户端：

```bash
cargo install acp-cli
acp-cli --approve-all --timeout 120 claude "你的任务"
```

注意 `exec` 子命令不支持 `--approve-all`；权限批准用顶层选项。

## 卸载

```bash
hermes plugins disable acp-client
hermes plugins remove acp-client
npm uninstall -g @agentclientprotocol/claude-agent-acp
```
