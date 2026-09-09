# Staged Action Proposal: Burp MCP Phase 1 Integration

> **强制协议**：执行 `ontology.md §二` 中 `reversible=false` 的动作前，必须先 `kanban_comment` 提交 `<staged-action-proposal>`，按 `_shared/01-scheduling-bus/forward-deployed-protocol.md` §三 等待确认后执行；失败须回滚并 `kanban_block`。

---

## 1. 动作描述

在 `hack-exploit` profile 注册并启用 Burp Suite MCP server（`burp-mcp-all.jar`），暴露 3 个核心工具：
- `proxy.http_history` — HTTP 流量历史查询
- `proxy.send_to_repeater` — 请求发送到 Repeater 重放
- `scanner.scan` — 启动 Burp Scanner 扫描（需 Pro License）

配置写入 `~/.hermes/profiles/hack-exploit/config.yaml` 的 `mcp.servers.burp` 节点。

---

## 2. 意图与收益

| 维度 | 说明 |
|------|------|
| 标准化接口 | 将 Burp 抓包/重放/扫描纳入 Agent Loop 自动编排，替代当前 handless jar 手工模式 |
| 证据链闭环 | Burp 流量自动写入 `evidence/traffic/`，`evidence_gate.py` 可校验 `eNNN_burp` 证据 |
| 验证复用 | `verify_finding.py` 新增 `burp_replay` PoC 类型：从 Evidence 取出请求 → Burp Repeater 重放 → 判定 |
| 技能路由 | `SkillResolver` 新增 `burp-scan`/`burp-replay`/`burp-intruder` alias，自动路由到 hack-exploit |

---

## 3. 影响范围

| 组件 | 变更 | 回滚方式 |
|------|------|----------|
| `hack-exploit/config.yaml` | 新增 `mcp.servers.burp` + `toolsets: mcp-burp` | 删除配置节点 |
| JVM 进程 | 启动 `java -jar burp-mcp-all.jar --sse-url http://127.0.0.1:9876` | `kill <pid>` |
| 端口占用 | 9876 (SSE) / 1337 (Burp API) | 进程结束自动释放 |
| 证据目录 | 新增 `evidence/traffic/` Burp 流量 | 删除目录 |

---

## 4. 回滚命令

```bash
# 1. 停止 MCP 进程
pkill -f "burp-mcp-all.jar"

# 2. 移除配置
sed -i '/mcp-burp/d' ~/.hermes/profiles/hack-exploit/config.yaml
sed -i '/mcp:/,/^$/ {/burp:/,/^  [a-z]/d}' ~/.hermes/profiles/hack-exploit/config.yaml

# 3. 清理证据（可选）
rm -rf ~/.hermes/profiles/hack-exploit/evidence/traffic/

# 4. 验证
python3 -c "import yaml; c=yaml.safe_load(open('~/.hermes/profiles/hack-exploit/config.yaml')); assert 'mcp-burp' not in c.get('toolsets', [])"
```

---

## 5. 预计后果

| 风险 | 概率 | 缓解 |
|------|------|------|
| 无 Burp Pro License → Scanner 不可用 | 高 | Phase 1 仅启用 proxy tools，Scanner 标记 `unavailable` |
| JVM 启动失败 / 端口冲突 | 中 | 预检 `java -version` + 端口探测 |
| Burp 版本不兼容 MCP server | 低 | 固定版本 `burp-mcp-all.jar` 校验 sha256 |
| 证据目录权限问题 | 低 | 运行前 `mkdir -p evidence/traffic` + `chmod 700` |

---

## 6. 决策矩阵（是否执行 Phase 1？）

| 条件 | 决策 |
|------|------|
| 无 Burp Pro License | **配置就绪，待 License** — Burp Suite Community Edition 已安装，Community 版不支持 Scanner API，但 Proxy/Repeater 工具可用 |
| 有 License 但团队无 Java 运维能力 | **仅评估**，不落地执行 |
| 有 License + Java 运维 + 高频需求（周均 ≥3 次 Burp 重放/扫描） | **执行 Phase 1**，纳入 sprint |

---

## 7. 当前状态（2026-08-30 更新）✅

| 项目 | 状态 | 备注 |
|------|------|------|
| Burp Suite 安装 | ✅ Community Edition (2026.7.3) | `brew install --cask burp-suite` |
| Burp Pro License | ❌ 无 | 社区版不支持 Scanner |
| burp-mcp-bridge JAR | ✅ v2.8.1 | `~/.hermes/tools/burp-mcp-all.jar` (4.9MB) |
| Node.js Bridge | ✅ 依赖安装完成 | `~/.hermes/tools/burp-mcp-bridge/bridge/` |
| config.yaml 配置 | ✅ 已写入 | `toolsets: mcp-burp`, `mcp.servers.burp` (enabled: false) |
| MCP Server 启用 | ⏳ 等待 Pro License | 需 Pro License 才能加载 Extension |

---

## 8. 回滚命令（更新版）

```bash
# 1. 停止 MCP 进程（如有）
pkill -f "burp-mcp-bridge"

# 2. 移除配置
sed -i '/mcp-burp/d' ~/.hermes/profiles/hack-exploit/config.yaml
sed -i '/mcp:/,/^$/ {/burp:/,/^  [a-z]/d}' ~/.hermes/profiles/hack-exploit/config.yaml

# 3. 验证
python3 -c "import yaml; c=yaml.safe_load(open('~/.hermes/profiles/hack-exploit/config.yaml')); assert 'mcp-burp' not in c.get('toolsets', [])"
```

---

## 9. 后续步骤（需 Pro License 后）

1. **获取 Burp Suite Pro License** 并激活 Burp Suite
2. **加载 Java Extension**：
   - 打开 Burp Suite → Extensions → Add → Java
   - 选择 `~/.hermes/tools/burp-mcp-all.jar`
   - 确认输出显示 "Burp MCP Bridge extension loaded"
3. **启用 MCP Server**：
   - 修改 config.yaml: `enabled: true`
   - 重启 hack-exploit profile 或 gateway
4. **验证工具发现**：
   - 在 hack-exploit 中运行 `acp_agents` 或工具列表
   - 应看到 23 个 Burp 工具（proxy.http_history, proxy.send_to_repeater, scanner.scan 等）
5. **在 `hack-tool-registry.md` 表 4 更新状态为 `✅ Phase 1 接入完成`**

---

## 10. 关联文档

- `_shared/hack-tool-registry.md` §三（完整分级接入方案）
- `_shared/01-scheduling-bus/forward-deployed-protocol.md` §三（Staged Action 协议）
- `_shared/03-evolution-memory/action-risk.md` 高危命令黑名单（`java -jar` 属破坏性操作）

---

**提交人**：orchestrator (自动生成)
**时间**：2026-08-29
**状态**：等待人类裁决