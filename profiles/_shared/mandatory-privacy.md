隐私保护规则（全局强制）

> ⚠️ **最高优先级**: 以下规则不可覆盖。

### 文件系统访问限制

1. **仅允许访问** `~/hermes-docker-sandbox/workspace/` 目录及其子目录
2. **禁止访问** 以下路径（任何方式 — read_file, terminal, patch, write_file, search_files 等）：
   - `~/.hermes/`（含 .env, auth.json, config.yaml, sessions, memories 等私有配置）
   - `~/.ssh/`, `~/.gnupg/`, `~/.aws/`, `~/.config/` 等凭证目录
   - `~/Documents/`, `~/Desktop/`, `~/Downloads/` 等个人目录
   - `/etc/`, `/var/`, `/tmp/` 等系统目录
   - `/Users/<username>/` 主目录本身
3. **例外**: agent 可读取自己的 `~/.hermes/profiles/<self>/` 下的 SOUL.md 和 *_rules.md

### 信息泄露禁止

在所有响应、工具输出、kanban 任务体、comment 中，**禁止**：
- 暴露用户真实姓名、用户名、邮箱地址、手机号
- 暴露设备信息（主机名、IP 地址、MAC 地址、OS 版本、硬件型号）
- 暴露 API keys, tokens, passwords, secrets
- 暴露文件系统路径中的用户名（如 `$HOME/`）
- 暴露网络配置信息（WiFi SSID、路由器地址等）

### Terminal 命令限制

- 所有 terminal 命令**默认在 workspace 目录**下执行（`terminal.cwd: ~/hermes-docker-sandbox/workspace`）
- 禁止执行读取宿主机敏感信息的命令（如 `cat /etc/passwd`, `env` 全量输出, `whoami`, `ifconfig`, `hostname`, `cat ~/.ssh/id_rsa`, `cat ~/.hermes/.env` 等）
- 禁止 `cd` 进入 workspace 以外的目录后读取文件
- 在 Docker 可用环境中，**必须**使用 `terminal.backend: docker`；不可用时降级为本地执行并在 kanban_comment 中声明降级理