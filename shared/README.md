# Hermes Agent 统一配置管理

## 文件结构

```
~/.hermes/shared/
├── .env.common            # 共享密钥/通用环境变量 (单一事实来源)
├── profiles.yaml          # 9个profile的差异配置清单
└── generate-configs.py    # 生成脚本
```

## 用法

```bash
# 查看将生成的配置（不写入）
python3 ~/.hermes/shared/generate-configs.py --dry-run

# 查看与现有文件的差异
python3 ~/.hermes/shared/generate-configs.py --diff

# 生成全部9个profile的 .env + config.yaml
python3 ~/.hermes/shared/generate-configs.py

# 只生成单个profile
python3 ~/.hermes/shared/generate-configs.py --profile orchestrator
```

## 修改配置的流程

1. **改密钥/通用变量** → 编辑 `~/.hermes/shared/.env.common`
2. **改profile差异**（端口/toolsets/assignee等）→ 编辑 `~/.hermes/shared/profiles.yaml`
3. **运行生成脚本** → `python3 ~/.hermes/shared/generate-configs.py`
4. **重启Gateway** → `hermes -p orchestrator gateway run --replace`

## 设计原理

### config.yaml 中的 ${VAR} 引用

Hermes 的 `_expand_env_vars()` 函数（`hermes_cli/config.py:6378`）在加载 config.yaml 时，
会递归展开所有 `${VAR}` 字符串引用，用 `os.environ` 中的值替换。

例如 config.yaml 中：
```yaml
providers:
  damoxing:
    api_key: ${DAMOXING_API_KEY}
    base_url: ${DAMOXING_BASE_URL}
```

加载时自动展开为 .env 中的实际值。这意味着：
- **密钥只存在 .env 中**，config.yaml 里只有变量引用
- **所有 profile 共享同一份 .env.common**，修改一处即生效
- config.yaml 本身可以安全提交到版本控制（不含明文密钥）

### 精简模式 config.yaml

每个 profile 的 config.yaml 只包含 ~60行 override 配置：
- model / providers（用 ${VAR} 引用）
- toolsets（每个 profile 不同）
- agent.environment_hint（指向各自的 rules.md）
- platforms（api_server 端口、matrix 开关）
- kanban.default_assignee
- plugins

其余所有字段（auxiliary、display、tts、stt、browser 等 ~50 个配置段）
由 Hermes 的 `DEFAULT_CONFIG` 自动补全（`_deep_merge` 合并）。

`mcp_servers`、`platform_toolsets`、`_config_version` 等自动管理的段
从现有 config.yaml 中保留，不被覆盖。

### .env 合并策略

每个 profile 的 .env = `.env.common` 全量复制 + `profiles.yaml` 中的 `env_extra` 追加。
当前 9 个 profile 的 .env 内容完全相同（因为 env_extra 都为空），
如果未来需要给某个 profile 添加专属变量，在 profiles.yaml 的 `env_extra:` 下添加即可。
