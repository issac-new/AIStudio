# ACP 协议细节：claude-agent-acp

手工调试 ACP 协议时发现的关键细节。**日常使用推荐走 `acp_send` 插件工具**，以下用于底层调试和问题定位。

## 支持的客户端能力

```json
{
  "clientInfo": {"name": "hermes", "version": "1.0"},
  "clientCapabilities": {
    "fs": {"readTextFile": true, "writeTextFile": true},
    "terminal": true
  }
}
```

- 无需 `auth: {terminal: true}` 以避免弹出交互式登录提示

## 支持的方法

| 方法 | 状态 | 参数 | 说明 |
|------|------|------|------|
| `initialize` | ✅ | `protocolVersion: 1` | 必需，返回 `agentInfo` |
| `session/resume` | ⚠️ | `sessionId, cwd, mcpServers` | **异步处理**，`communicate()` 关闭 stdin 后响应可能丢失 |
| `session/prompt` | ✅ | `sessionId, prompt` (数组格式) | `prompt` 必须是消息数组，非字符串 |
| `notifications/initialized` | ❌ | — | 返回 "Method not found"，非致命 |

## 已知问题

### 1. session/resume 在 batch 模式下无响应

**现象**: 使用 `subprocess.communicate()` 同时发送 init + session/resume 时，只收到 init 响应，没有 session/resume 响应。

**根因**: `claude-agent-acp` 的 `runAcp()` 通过 `connection.closed.then(shutdown)` 注册了 stdin 关闭时的退出处理。`communicate()` 发送完数据后关闭 stdin，触发 `shutdown()`。如果 session/resume 还在异步处理中，响应在 shutdown 过程中丢失。

**解决方案**: 走插件路径，不要手动调用 ACP 协议。

### 2. session/prompt 参数格式

`prompt` 参数必须是 **消息数组**，不是字符串：

```python
# ✅ 正确
{"prompt": [
    {"role": "user", "content": [{"type": "text", "text": "Say hello"}]}
]}

# ❌ 错误
{"prompt": "Say hello"}
```

错误提示: `"Invalid input: expected array, received undefined"`

### 3. 方法名差异

| Provider | 会话创建方法 |
|----------|-------------|
| opencode-acp | `session/new` |
| codex-acp | `session/new` |
| claude-agent-acp | `session/resume` |
| 通用 ACP 协议 | `session/create` |

`session/new` 和 `session/create` 对 claude-agent-acp 都返回 "Method not found"。

## 安全认证认证

初始化时，`authMethods` 字段的行为：

- **不含 `auth: {terminal: true}`** → `authMethods: []`（通过 env var / proxy 静默认证）
- **含 `auth: {terminal: true}`** → 显示 Claude Subscription / Anthropic Console 登录选项

推荐不声明 terminal auth 能力，让认证通过环境变量自动处理。

## acp-cli 工具

社区实现了 [acp-cli](https://github.com/motosan-dev/acp-cli)（Rust），用于 headless ACP 调用：

```bash
# 安装
cargo install acp-cli

# 验证生成（需 ANTHROPIC_* 环境变量）
acp-cli --approve-all claude "Write hello world" --timeout 60

# 或 exec 模式
acp-cli claude exec "Write hello world"
```

已知问题：
- `exec` 子命令不支持 `--approve-all`（仅顶层命令支持）
- 默认权限模式需要 `--approve-all`，否则会卡在权限确认
- 超时设置对长时间任务需要加长（Claude Agent SDK 初始化可能需 30s+）
