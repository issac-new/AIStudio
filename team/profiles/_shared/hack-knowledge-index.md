# 本地安全知识索引 + 韧性（KnowledgeIndexService / 持久化恢复 对标 YunkunSec）

> 来源：YunkunSec 两大组件 —
> ① `KnowledgeIndexService`（本地安全数据索引、搜索、状态管理）；
> ② **持久化与恢复**（命名运行实例 / 会话状态保存 / Checkpoint 与 Snapshot / 异常中断恢复 / Run Resume / Writer Lease / **目标状态记录与比较**）。
> 作用：本机 hack team 每次运行都临时 `curl cve.circl.lu`、重新拉 OSINT，缺**跨任务沉淀的本地索引**；kanban 已提供任务级持久化/恢复（task 跨 session 存活），但**任务内无 checkpoint、无目标状态前后比对**。本文补齐这两处。

---

## 一、本地知识索引（KnowledgeIndexService 等价）

统一落盘目录：`~/.hermes/profiles/_shared/hack-kb/`，三类索引：

```
hack-kb/
├── poc/          # 已验证可复现 PoC（按 CVE/产品）
├── cve/          # CVE→产品/版本→利用条件 映射
└── intel/        # 目标画像/资产/IOC 沉淀（带 markings）
```

### 索引写入约定

每个已确认 finding 在 `kanban_complete` 前，向 `hack-kb/{poc|cve|intel}/` 追加一条 JSONL 记录：

```json
{"ts":"2026-08-29T20:00:00","cve":"CVE-2024-xxxx","product":"apache 2.4.49","cond":"path traversal + RCE","poc":"poc/CVE-2024-xxxx.py","markings":"TLP:AMBER","evidence":["e001"]}
```

WIH 敏感信息发现（wih_engine.py 产出）同构接入：records JSON 的 `content`/`source`/`fnv_hash`/`risk_level` 键直接映射 evidence 记录，`--output` 落盘文件归档至 `hack-kb/intel/`，凭据值脱敏后入报告（保留前 8 字符）。

### 检索（run 内复用，替代重复外网拉取）

```bash
# 按产品/版本查已知可用 PoC
grep -rl '"product":"apache 2.4.49"' ~/.hermes/profiles/_shared/hack-kb/poc/ | head
# 或简单 sqlite（若索引量增长后迁移）
python3 - <<'PY'
import json,glob,os
for f in glob.glob(os.path.expanduser('~/.hermes/profiles/_shared/hack-kb/cve/*.jsonl')):
    for line in open(f):
        r=json.loads(line)
        if 'apache' in r.get('product','').lower(): print(r['cve'], r['cond'])
PY
```

> 注：初始 `hack-kb/` 为空，首个写入动作即建库。与既有 `hack-team/knowledge-base` skill（方法论知识）分工明确——本索引存**运行期实证资产**，knowledge-base 存**静态方法论**。

---

## 二、任务内 Checkpoint / Resume / 目标状态比对

### 2.1 Checkpoint（任务内断点续作）

kanban task 本身是跨 session 的 resume 单元。任务**内**长链路（exploit 多步、forensics 大镜像）需显式 checkpoint：

- 每完成一个 Phase 门（见 `constraint-policy.md` §三），`kanban_comment` 落一次结构化 checkpoint（含已确认 finding 编号、下一步、未决项）。
- 异常中断（进程被杀/超时）后，dispatcher 重派同 task → worker 首步 `kanban_show` 读取历史 comment，从最近 checkpoint 续作，**不从头跑**。
- **Writer Lease 等价**：同一 task 同一时刻仅一个 worker 持有（`claim_lock` 已由 dispatcher 保证），无需自实现。

### 2.2 目标状态记录与比较（attack-surface drift）

YunkunSec 的"目标状态记录与比较"= 任务前后对目标状态做快照并 diff。本机落地为**评估前后基线比对**，写入报告：

```markdown
## 目标状态前后比对（attack-surface drift）
| 维度 | 评估前 | 评估后 | 变化 |
|------|--------|--------|------|
| 暴露端口 | 22,80,443 | 22,80,443,8080(新发现) | +1 |
| 已知漏洞 | 0 | 2 (1 HIGH/1 MED) | +2 |
| 资产/子域 | 5 | 7 | +2 |
```

- **前快照**：recon 阶段 `coverage JSON`（`(subdomain,port,service)` 三元组，hack-recon L98）即前基线。
- **后快照**：exploit/auditor 完成后在报告中生成 `后快照`，diff 出新增暴露面/漏洞，作为"本次评估增量"的证据。

---

## 三、与既有机制的边界

| YunkunSec 机制 | 本机对应 | 本文新增 |
|----------------|----------|----------|
| 命名运行实例/Run Resume | kanban task + dispatcher reclaim | 任务内 checkpoint 落 comment |
| Checkpoint/Snapshot | 无 | 2.1 续作协议 |
| 目标状态记录与比较 | 无 | 2.2 drift 比对表 |
| KnowledgeIndexService | 临时 curl + hack-team/knowledge-base | 1. 本地实证索引 hack-kb/ |
| Writer Lease | claim_lock（dispatcher） | 无需新增 |

---

## 四、finding 结构化事实库（按靶标聚合检索）（DSH RedTeam 模式融合，2026-10-14）

> 来源：DSH RedTeam 模式（Jueze-2019/dsh-redteam-mode）「资产/漏洞/凭据/会话/攻击链实时落本地 SQLite 事实库（22 表 + FTS5）」；裁决矩阵 `workspace/research/hermes-teams-fusion-20261014/FUSION-VERDICT-20261014.md` R2（收缩吸收——只收「结构化事实库+按靶标聚合」思想，不搬 22 表 schema；JSONL+grep 已满足当前量级，上 DB 属 over-engineering，量级超限是翻案条件）。

### 写入增补

§一 的 finding JSONL 记录增补两个可选字段（既有字段不动，旧记录无此两字段视为 `target=null/chain=[]`）：

```json
{"ts":"…","cve":"…","product":"…","cond":"…","poc":"…","markings":"…","evidence":["e001"],
 "target":"example-ltd", "chain":"recon-20261014#3"}
```

- `target`：靶标单位短名（与授权 scope.txt 的靶标名一致，大小写不敏感），同靶标 finding 聚合的聚合键。
- `chain`：所属攻击链任务引用（`<任务短名>#<步序>`），把离散 finding 串成攻击链视图。

### 按靶标聚合检索

```bash
# 某靶标全部 finding（跨 poc/cve/intel 三类）
grep -rh '"target":"example-ltd"' ~/.hermes/profiles/_shared/hack-kb/{poc,cve,intel}/ 
# 某靶标攻击链时序视图（按 ts 排序）
grep -rh '"target":"example-ltd"' ~/.hermes/profiles/_shared/hack-kb/{poc,cve,intel}/ | python3 -c "import sys,json;[print(json.loads(l)['ts'],json.loads(l).get('chain','—'),json.loads(l).get('cve') or json.loads(l).get('cond','')) for l in sorted(sys.stdin,key=lambda x:json.loads(x)['ts'])]"
```

报告引用约定：红队/审计报告的 finding 汇总表直接由聚合检索产出，禁手工抄录（防报告与事实库漂移）。

### 供应链风险归档参照轴（AI-Infra-Guard 融合，2026-10-14）

审计/MCP 投毒类 finding 入 `hack-kb/intel/` 归档时，`risk_class` 字段优先引用 AIG 两套分类法作命名对照（登记见 `hack-tool-registry.md` §五）：
- MCP 侧：MCP01-MCP10（一手 mcp-scan 分类）；
- Skill 侧：SkillTrustBench T01-T09。
本机 skillguard（SG-xxx）/mcp_poison_scan（MP-xxx）检出结果人工归档时，可在 JSONL 记录附 `aig_ref` 字段记对照类目（如 `"aig_ref":"MCP04"`），用于跨工具聚合与对外报告的通用命名。两套本机规则仍是判定正典，AIG 分类法只作归档命名轴，不参与扫描判定。

---

## 修订记录
| 版本 | 日期 | 内容 |
|---|---|---|
| v1.0 | 2026-08-29 | 调研 YunkunSec KnowledgeIndexService + 持久化恢复后补齐本机 hack team 本地索引与任务内韧性 |
| v1.1 | 2026-10-14 | DSH RedTeam 模式融合：finding 记录增补 target/chain 字段 + 按靶标聚合检索约定（§四） |
| v1.2 | 2026-10-14 | AI-Infra-Guard 融合：供应链风险归档参照轴（§四 aig_ref 字段，MCP01-MCP10/T01-T09 命名对照） |
