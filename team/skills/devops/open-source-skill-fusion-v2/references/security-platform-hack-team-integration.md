# Security Platform Research + Hack Team Integration Reference Case

> 来源：YunkunSec（云鲲安全 v0.4.0）调研 + VulnClaw (MIT, 250 .py files) 对标落地
> 日期：2026-08-29
> 范围：YunkunSec 商业产品无源码 → 以 VulnClaw 开源实现对标 → 落地到本机 hack team（4 profile）+ orchestrator/dispatcher 集成

---

## 任务背景

用户要求：深入调研分析 YunkunSec（云鲲安全）微信公众号文章，优化本机 Hermes hack teams。

**关键发现**：YunkunSec v0.4.0 是 Commercial 交付目录，整仓只有 README.md（1 commit），无任何源码。
改以 **VulnClaw (MIT, 250 .py files)** 作为架构等价的开源实现对标。

## YunkunSec 核心组件 vs 本机 hack team 差距映射

| YunkunSec 组件 | VulnClaw 源码锚点 | 本机原状 | 落地结果 |
|---|---|---|---|
| `AgentEngine` + 证据控制 | `agent/solver.py:_completion_gate` (475-515) | 提示性纪律（SOUL 文字） | **A. evidence_gate.py 机械闸门（fail-closed）** |
| `ConstraintPolicy` | `agent/reasoning_state.py:11-65` ReasoningConstraint(severity=BLOCKING) | 分散在各 SOUL 红线 | **`_shared/constraint-policy.md` 统一五维约束层** |
| `ToolRegistry` | `mcp/registry.py:34-160` 健康状态机 + 滑动窗口 | 无统一注册视图 | **`_shared/hack-tool-registry.md` 工具注册表** |
| `KnowledgeIndexService` | 无直接对应（用 `agent_state.py` evidence） | 每次临时 curl CVE | **`_shared/hack-knowledge-index.md` 本地实证索引 + checkpoint 续作 + drift 比对** |
| `SkillResolver` | `skills/resolver.py:1-45` 纯函数评分路由（无 LLM） | 人工 SOUL 表格记忆路由 | **B. resolver_cli.py + skill_routing.json 量化路由** |
| `Verifier` | `report/verifier.py:33-139` PoCGenerator + 真跑判定 | "人工确认 + curl" 提示性纪律 | **C. verify_finding.py 独立验证模块（PoC 执行级复跑）** |
| `RunContext` (持久化/恢复) | 无直接对应 | 任务级已有（kanban），任务内无 checkpoint/drift | **hack-knowledge-index.md §2 checkpoint 续作 + drift 比对表** |

**刻意不移植**：YunkunSec 是单 agent 一体化程序，架构与本机多 profile 看板编排根本不同；RAG 已由 hack-team/knowledge-base + skill_view 覆盖；C2/武器化已按纪律归档。

---

## 交付物清单（13 核心文件 + 4+2 代码钩子 + 5 SOUL 补丁）

### 共享锚点（_shared/）
| 文件 | 类型 | 核心能力 |
|---|---|---|
| `constraint-policy.md` | 共享锚点 | Scope/风险/阶段/确认/资格 五维机械校验 + `scope.txt` 统一格式 + Phase 硬门 |
| `hack-tool-registry.md` | 共享锚点 | 工具注册映射 + **Burp MCP Phase 1-3 分级接入方案 + Staged Action 引用** |
| `hack-knowledge-index.md` | 共享锚点 | `hack-kb/{poc,cve,intel}` 本地实证索引 + checkpoint 续作 + **攻击面 drift 比对表** |

### 可执行脚本（_shared/scripts/）
| 文件 | 类型 | 核心能力 |
|---|---|---|
| `evidence_gate.py` | 可执行脚本 | findings/report/claim 的 evidence id 存在性 + 关键 token 逐字符命中，**fail-closed (exit 0/1/2)** |
| `verify_finding.py` | 可执行脚本 | pending finding → 确定性 PoC(6类) → subprocess 真跑 → 仅 `VERIFIED` 入报告 |
| `resolver_cli.py` | 可执行脚本 | 五维信号归一化 + 纯函数打分(W_TYPED=3.0/W_ALIAS=1.0/W_FORMAT=1.5) → 1主+≤2辅 + provenance全程可审计 |
| `drift_compare.py` | 可执行脚本 | 从 recon coverage.json + exploit findings.jsonl 自动生成 Markdown 漂移对比章节 |
| `burp_mcp_activate.py` | 可执行脚本 | Burp MCP Phase 1 一键激活脚本（License验证、Extension加载、配置启用、工具发现验证） |

### 数据/模板
| 文件 | 类型 | 核心能力 |
|---|---|---|
| `skill_routing.json` | 数据索引 | 25 skills 完整的五维 routing metadata + aliases + is_broad_knowledge |
| `burp-mcp-phase1-staged-action.md` | Staged Action | Burp MCP Phase 1 完整评估、回滚命令、决策矩阵、Guardian二审要求、当前状态表 |
| `drift-comparison-template.md` | 报告模板 | 攻击面漂移对比表（基线→快照 diff） |

### 核心代码集成
| 文件 | 集成点 | 效果 |
|---|---|---|
| `kanban_tools.py` | `_handle_complete` (line 892) + `_handle_create` (line 1495) | evidence_gate 完成前钩子 + resolver_cli 派单前钩子（代码级 fail-closed） |
| `kanban_db.py` | `_dispatch_once_locked` (line 10339) | **dispatcher tick 预检钩子** - resolver 验证 + evidence_gate 运行中任务检查，**失败即 block** |

---

## SOUL 强制钩子（4 hack profiles + orchestrator）

| Profile | evidence_gate | resolver_cli | verify_finding | YunkunSec锚点 |
|---|---|---|---|---|
| **hack-recon** | 2处 | 2处 | — | 1 |
| **hack-exploit** | 2处 | 2处 | **2处 (TEST→EXPLOIT间)** | 1 |
| **hack-auditor** | 2处 | 2处 | — | 1 |
| **hack-forensics** | 2处 | 2处 | — | 1 |
| **orchestrator** | — | 1处 (Hack板路由节) | — | **攻击面漂移对比（必含）+ drift_compare.py 强制调用 + 合并报告自动化** |

---

## 端到端验证结果

```
步骤1 resolver 选型：
  "对 https://target.example.com 完整渗透测试"
  → primary=autonomous-godmode-hunter(22.5), supports=[pentest-methodology-fusion(18), scope-gate(15)], confidence=1.0

步骤2 hack-recon 产出 findings + evidence
步骤3 evidence_gate 校验：
  claim token 匹配 evidence 原文 → [SUMMARY] 2/2 passed, exit=0
  claim token 不匹配 → [FAIL] finding F2 含未命中 token, exit=1  ✅ fail-closed 生效

步骤4 hack-exploit verify_finding：
  目标不可达(DNS失败) → [SUMMARY] 0 verified / 2 rejected, exit=1  ✅ 真实执行级校验生效

步骤5 drift_compare 自动生成：
  python3 drift_compare.py --baseline coverage.json --snapshot findings.jsonl --output drift.md
  → 生成标准化 Markdown 漂移对比表（含子域/端口/漏洞/向量/证据关联度 diff）
```

---

## 关键经验教训

### 1. 商业产品无源码 → 改用架构等价的开源实现对标
YunkunSec 只有 README → 改以 VulnClaw (250 .py, MIT) 对标。
**原则**：README 营销层不可信，必须读 src 代码（file:line 锚点）做差距映射。

### 2. 提示性纪律 → 代码级硬门
本机 hack team 原有的"反幻觉纪律"只是 SOUL 文字约束。
落地 `evidence_gate.py` + `verify_finding.py` + `resolver_cli.py` 做成 **可执行脚本**，集成到 `kanban_tools.py` + `kanban_db.py` 形成 **代码级 fail-closed**。

### 3. Dispatcher tick 预检比完成前钩子更早拦截
`kanban_db.py:_dispatch_once_locked` 中集成 `_run_hack_preflight_checks`：
- Spawn 前运行 resolver 验证 assignee（confidence<0.3 → block）
- 检查运行中 hack 任务的 evidence_gate（防止证据链断裂）
- 预检失败 → 任务标记 blocked，不 spawn，记录 `preflight_blocked` 到 DispatchResult

### 4. 重型任务合并报告自动化
Orchestrator SOUL 强制：重型 hack 任务合并报告**必须**调用 `drift_compare.py` 自动生成漂移对比章节，嵌入合并报告。
- Baseline: recon 阶段 `coverage.json` (基线)
- Snapshot: exploit/auditor 阶段 `findings.jsonl` (快照)
- 自动 diff 生成标准化 Markdown 漂移对比表

### 5. Burp MCP 接入需 Pro License
- Burp Suite Community Edition 已安装，但不支持 Scanner API
- burp-mcp-bridge v2.8.1 JAR 已下载，Node.js Bridge 依赖安装完成
- config.yaml 已写入 `mcp-burp` toolset + `mcp.servers.burp` (enabled: false)
- **Phase 1 配置就绪，待 Pro License 激活**

---

## 关联文件清单

```
_shared/
├── constraint-policy.md              # 五维约束层（Scope/风险/阶段/确认/资格）
├── hack-tool-registry.md             # 工具注册表 + Burp MCP 分级方案 + Staged Action 引用
├── hack-knowledge-index.md           # 本地实证索引 + checkpoint 续作 + drift 比对表
└── scripts/
    ├── evidence_gate.py              # 机械证据闸门 (fail-closed)
    ├── verify_finding.py             # 独立验证模块 (PoC 执行级复跑)
    ├── resolver_cli.py               # 确定性 Skill Resolver (纯函数打分)
    ├── drift_compare.py              # 攻击面漂移自动对比生成器
    ├── burp_mcp_activate.py          # Burp MCP Phase 1 一键激活脚本
    ├── skill_routing.json            # 25 skills 五维 routing metadata
    ├── burp-mcp-phase1-staged-action.md  # Staged Action Proposal
    └── drift-comparison-template.md  # 漂移对比报告模板
```

---

## 后续可选增强（需用户裁决）

| 项 | 价值 | 工作量 |
|---|---|---|
| **Burp MCP Phase 1 实际激活** | 获取 Pro License → 加载 Extension → 启用 enabled: true → 验证 23 工具 | 中（需购买 License） |
| **drift_compare 集成到 orchestrator 代码路径** | 彻底替代人工嵌入，自动从子任务 workspace 提取 baseline/snapshot | 小（改合并报告生成逻辑） |
| **dispatcher 自动心跳集成 evidence_gate/resolver** | 在 dispatcher tick 中预检，提前拦截不合规任务 | 中（改 dispatcher tick 逻辑） |

---

## 蓝军对抗审查要点（参考 `references/blue-army-review-template.md`）

1. **忠实性**：对照 VulnClaw 源码逐条抽查关键机制转译——有无编造/弱化/添加源项目没有的内容
2. **一致性**：产物文件间交叉引用（路径/节号/版本号）一致，section 编号无重复断号
3. **可执行性**：脚本/命令真实跑通（--help + 最小 case + 边界 case），SKILL.md 用法 copy-paste 可执行
4. **越界**：mtime/git 扫描改动清单，对照申报清单找计划外修改

---

## 关联技能

- `multi-agent-orchestration-design` — orchestrator 配置、dispatcher tick 预检、Hack 板路由
- `security-team-soul-enrichment` — 4 hack profile SOUL.md 批量强制钩子注入
- `multi-board-team-deployment` — hack 看板 4 profile 部署与 board.json scope
- `kanban-triage-stall-recovery` — triage 卡不拾取的恢复与 dispatcher 行为

---

## 修订记录

| 版本 | 日期 | 内容 |
|---|---|---|
| v2.1 | 2026-08-29 | 新增 Security Platform Research + Hack Team Integration 参考案例（YunkunSec→VulnClaw 对标 + hack team 集成 + dispatcher/orchestrator 集成） |
| v2.0 | 2026-08-16 | LHH 融合实测 + 蓝军对抗审查模板 + 多源并行调研编排 + 双通道分流框架 |
| v1.0 | 2026-08-06 | BMAD + maestro + swarm-yuan 三源融合实践提炼 |
