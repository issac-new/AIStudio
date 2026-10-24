# 存量项目排障流水线（bugfix runbook）

> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# 存量项目排障流水线（bugfix runbook）。

## 定位

fix 任务类型在开发工作流②探查～⑥测试节点的专项展开：连研发环境取证（日志、数据库、远程断点），把"线上现象"变成"根因定论 + 修复 + 回归证据"。任务档位走 `assets/task-type-gates.conf` 的 fix 条目（核心门禁 + 简化 spec：§1-§4 + §5.5 + §12）。六步如下，每步有输入、动作、证据落盘，不许跳步宣布根因。

## 六步流水线

| 步 | 输入 | 动作与工具 | 证据落盘 | 产出 |
|----|------|-----------|---------|------|
| ① 日志定位 | 现象描述/时间窗/traceId | ELK 或远端日志：`ops-readonly-guard.sh shell -- "ssh <堡垒机> 'tail/grep …'"`；连接方式见 [mcp-tools.md](../scripts/mcp-tools.md) | ops.jsonl | 异常堆栈 + 首个异常时间点 + 关联 traceId |
| ② 查库取证 | ①的怀疑对象（订单/状态机/配置） | 只读账号经隧道连库（`tunnel.conf` 的 db 条目），SQL 先过 `ops-readonly-guard.sh sql --` 再执行 | ops.jsonl | 数据形态：佐证或排除根因假设 |
| ③ 远程断点复现 | ①②缩小后的代码路径 | 按 [remote-debug-jvm.md](remote-debug-jvm.md)：隧道 jdwp 条目 → IDE attach → 条件断点复现 | trace.jsonl + spec 证据段 | 复现路径 + 断点处变量/栈帧 |
| ④ 根因定论 | ①②③证据 | 写入简化 spec 的根因段；**日志、数据、断点三类证据至少两类互证**才许下结论；单证据只能写"推测+缺口" | spec 文件 | 一句话根因（为什么走到错误分支） |
| ⑤ 修复 | ④+影响面 | 回⑤编码节点正常纪律：本地测试先行、最小改动面；禁止"顺手"扩范围 | 代码 + 本地测试 | 修复提交（worktree/分支纪律不变） |
| ⑥ 回归验证 | ⑤ | fix 门禁集全绿（修复点 + 相邻路径都跑）；三账本对账：ops.jsonl 无未审写操作、trace.jsonl 链完整、review-record 落盘 | gate-runs.jsonl + review-record | 验证通过的修复 |

## 只读三道防线（研发环境操作纪律）

AI 对研发环境只读取证，写操作一律走人审通道。防线从强到弱：

1. **凭证层（第一道，最硬）**：连接串里的数据库账号必须是只读账号（只授 `SELECT`）；SSH 用受限用户。守卫拦不住凭证本身的权限——账号能写，静态判定再严也会漏，所以这层必须先行。
2. **守卫层（第二道，fail-closed）**：一切对外部资源的命令/SQL 先过 `bash scripts/ops-readonly-guard.sh sql|shell -- '<操作>'`：只读放行、写拒绝、未识别默认拒绝（exit 22）。绕过守卫直连 = 违反本 runbook，review 节点对账 ops.jsonl 时会发现。
3. **账本层（第三道，事后审计）**：守卫每次判定追加 `.swarm-yuan/ops.jsonl`（与 trace.jsonl 同目录同构），⑥回归时核对全账无写操作放行记录。

**升级路径**：修复确实需要改研发环境数据/配置才能验证时——停下来，写清"需要什么写操作、为什么、影响面"，由人来执行；AI 不代写。

## 失败路径与降级

| 卡点 | 降级动作 |
|------|---------|
| 堡垒机不可达/账号失效 | `bash scripts/tunnel.sh doctor` 定位；不通则本 runbook 只做本地代码侧排查，spec 明示"研发环境取证未做" |
| 数据库无只读账号 | 不许用读写账号"小心点查"——申请只读账号，期间以日志+断点两证据推进 |
| 服务端开不了 JDWP | 按 [remote-debug-jvm.md](remote-debug-jvm.md) 降级段：日志加密度 + jstack/jstat/jinfo 三件 |
| 断点版号对不上 | `git checkout <部署 commit>` 后再 attach；对不上不猜行号 |

## 工具配套一览

| 工具 | 承载 | 本流水线中的角色 |
|------|------|----------------|
| `scripts/tunnel.sh` + `scripts/tunnel.conf` | 堡垒机 ProxyJump 隧道 up/down/status/doctor | db 与 jdwp 两条隧道的统一编排 |
| `scripts/ops-readonly-guard.sh` | 外部操作只读守卫 + ops.jsonl 账本 | ①②步每条命令的判定与留痕 |
| [mcp-tools.md](../scripts/mcp-tools.md) | 数据库/ELK 连接信息登记（用户填充） | ①②步的连接入口 |
| [remote-debug-jvm.md](remote-debug-jvm.md) | JDWP 远程调试全链路 | ③步展开 |
| `assets/task-type-gates.conf` fix 档 | 简化 spec + 核心门禁 | ④⑥步的档位与验收 |
| `scripts/trace-log.sh` | 全链路调用留痕 | 各节点动作记账 |

## 与九节点的映射

本 runbook 不新开节点：①②=②探查节点的研发环境取证面；③④=②探查→spec 节点的根因定论面；⑤=⑤编码；⑥=⑥测试+⑦独立审查。被拦时按工作流通用规则处理：门禁给原因与解除路径，修复后重跑该步。
