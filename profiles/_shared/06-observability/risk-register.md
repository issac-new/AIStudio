# 集群风险登记册（risk-register）

> 来源：PMO前沿 53 篇调研融合 G2（2026-09-02，`research/pmo-frontier/REPORT.md`）
> 增补：2026-09-06 FDE 文20 融合——新增「触发阈值（量化）」列，Top 开放风险配机械触发条件与升级动作（观察→处置的边界数字化，替代"持续观察"模糊态）；阈值本身为工程约定值，可随实测修订
> 口径：PMO 风险管理五步法（定位→判断→归纳→措施→归档）的归档层；红区（概率高×影响高）必须附应对计划并仪式化 Review
> 维护纪律：
> ① 重型任务合并报告验收时强制 Review Top3 开放风险状态（并入 DoD）
> ② 概率/影响取 低/中/高 三档；状态 = open / mitigating / closed
> ③ 新增条目须有实锤锚点（事故记录/审计报告/实测数据），禁止假想风险
> ④ 关闭条目须注明关闭依据（机制落地证据），移至文末「已关闭」区

| 编号 | 类别 | 概率 | 影响 | 状态 | 风险描述 | 触发条件/领先指标 | 触发阈值（量化） | 应对预案 | 锚点 |
|---|---|---|---|---|---|---|---|---|---|
| R-01 | 资源 | 中 | 高 | open | cc-switch 单点故障=全集群 33 profile 失能 | 127.0.0.1:15721 健康检查失败；503 熔断频次突增 | **10 分钟内 ≥3 次 503 熔断**（健康检查 `curl -sS http://127.0.0.1:15721/health` 连续失败）→ 24h 内升级处置：评估 fallback chain 切换或启用直连供应商 | cc-switch 自身熔断/队列兜底；换 provider 配置极简（已显式接受该风险）；`cc-switch-provider-troubleshooting` skill | 设计文档 §3.2「单点风险显式接受」 |
| R-02 | 资源 | 高 | 中 | **closed 2026-09-02** | ~~Kimi 并发=4 硬上限导致重型任务并行波排队~~ | — | — | 全局 cc-switch 代理后上游切换/限流收口代理层，该供应商特定约束失效；并发控制由 cc-switch proxy_config 统一管理 | 用户裁决归档（2026-09-02） |
| R-03 | 流程 | 高 | 中 | mitigating | profile compression 漂移：33 个 profile config 实测 0.5/0.2，不继承主 config 0.35/0.15 | generate-configs 重建/新增 profile 即回默认值 | — | 根治方向=生成管线内固化（generate-configs.py 补丁）；手工批量同步会被再次覆盖（已否决） | 设计文档 §四待裁决 |
| R-04 | 流程 | 中 | 高 | open | 跨板 parent 依赖哑链：promote_task 父检查是板内 JOIN，跨板 parents 静默落空→子卡被错误放行 | 跨板 kanban_create 带 parents 参数 | **每周一次机械扫描**：`for b in swarm hack product ops [已移除] platform [已移除] data; do sqlite3 ~/.hermes/kanban/boards/$b/kanban.db "SELECT id FROM tasks WHERE parents LIKE '%t_%' AND parents NOT IN (SELECT id FROM tasks);"; done` 出现任一跨板 parents 残留 → 立即补 context_from 注入并记 hotspot | 跨板编排只用子卡 body 引用父卡 ID + `context_from` 注入；纪律已入 SOUL；根治需改 dispatcher（kanban_db.py:6799） | 2026-08-27 蓝军 F-A 实锤 |
| R-05 | 流程 | 中 | 高 | mitigating | delegate 子代理绕过 kanban CLI 护栏直写生产板（.py 脚本 mutate / sqlite3 裸写，tasks 表 0 触发器） | 非预期任务状态变更；task_events 缺对应事件 | — | 守栏方案=33 个 ABORT 触发器+打标连接，guardrail-test 板先行；跟踪 t_086567b7/t_22399871 | evals 事故 2026-09-01 |
| R-06 | 资源 | 中 | 中 | mitigating | 卡 done 触发 scratch 清理导致证据蒸发（未 attach 的产物随工作区删除） | workspace_kind=scratch 的任务完成 | — | workspace_kind 禁 scratch 已入 SOUL 强制规则；即时 attach 或 dir 模式兜底 | evals 事故 2026-09-01 |
| R-07 | 技术 | 低 | 中 | open | 长 base64 拼 kanban_attach 引字节错（两次实测） | 附件 >2KB | **任一 attach 后 24h 内 kanban_attachments 列出 size=0 或拉回内容 sha256 ≠ 本地源文件** → 该附件立即重传并改走 kanban_attach_url 通道 | >2KB 走评论归档+小附件；附件须 diff 校验 | evals 事故 2026-09-01 |
| R-08 | 技术 | 中 | 高 | open | 47 worker 直跑 macOS 宿主无 OS 级隔离：web 调研内容（夜间雷达每日抓取第三方站点）若含环境混淆型载荷（模块遮蔽/降级诱导，参照 Claude Code Opus 5 Auto Mode 击穿链），可致宿主级 RCE + HOME 凭据暴露 | worker 任务流中出现解压第三方归档后在解压目录内执行 Python；web 内容诱导 WebFetch→curl 降级 | **命令流命中「解压后 cd 进归档目录执行 python 导入」或「curl 下载归档并解压执行」模式即触发** → Guardian 二审 + 人工复盘该任务全部产出 | P1 规则层先行（Guardian 补失陷清理 fast-track 判例 + 出口红线入 constraint-policy）；P2 容器化评估卡 t_31da0315（复用 hermes-docker-sandbox 资产）；长期出口 allowlist | gap-20260908-platform-f0e023 / t_3cb9c4e0（2026-09-08 实勘：无 /.dockerenv、HOME=/Users/YOURNAME 全暴露、_shared grep egress=0 命中） |

## 已关闭

| 编号 | 关闭日期 | 关闭依据 |
|---|---|---|
| — | — | （暂无） |

## 类别口径（对齐 PMO 24 类高发风险清单的 agent 化四分法）

- **需求类**：卡 body 验收模糊、隐性诉求未澄清、跨卡同名决策分叉
- **资源类**：provider 熔断/并发上限/上下文溢出/token 配额
- **流程类**：护栏绕过、留痕遗忘、跨板依赖落空、scratch 蒸发
- **执行类**：L0-L4 压力升级触发、SPINNING 连败、工具缺失
