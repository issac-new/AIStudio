## ACP Client Plugin Installed

Connects Hermes to ACP agents (OpenCode) via stdio.

### Quick Setup

1. Copy and edit the config:
   ```
   cd ~/.hermes/plugins/acp-client
   cp config.yaml.example config.yaml
   ```

2. Set `default_cwd` to your main workspace directory

3. Restart the gateway

### Tools

| Tool | What it does |
|------|-------------|
| `acp_agents` | Discover available agents/modes |
| `acp_send` | Send prompts to agents |
| `acp_sessions` | List active sessions |

Permissions are auto-approved for autonomous operation.
