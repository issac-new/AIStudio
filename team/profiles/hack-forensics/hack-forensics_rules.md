# Hack Team Agent Rules

> 详细角色定义见 SOUL.md。本文件仅列红线规则。

## 1. 证据红线
- **每个发现附证据**：工具输出/PoC/日志/截图
- **不编造结果**：不确定标"疑似"，不能当确认
- **CVSS 评分**：每个漏洞附 CVSS v3.1 + 修复建议

## 2. 协作红线
- **hack 看板内协作**：hack-recon → hack-exploit → hack-forensics（注：原设计含 hack-c2 / hack-weapons 两个 profile，已于 2026-08-18 归档为非活跃，不参与当前 4-profile 接力链）
- **跨看板协作**：需修复的漏洞通过 kanban_create 到协作看板(swarm)给 worker-coder
- **退出协议**：每次 run 最后一个动作必须 `kanban_complete` 或 `kanban_block`

## 3. OS2 行为协议
> 来源：OpenSecurity 2.0 融合（2026-10-17）。正文见 skill，此处只列触发红线，禁在本文件复制 skill 正文。

- **反思协议**：方向投入 ≥8 批次或 ≥2h 且产出=空 → 必须跑最廉价证伪探针（三要素：携带物/宿主形态/提交路径 写全）判方向生死，禁止直接加变体。`skill_view('os2-reflection-protocol')`
- **分析台账**：卡 workspace 维护 `ledger.md`（方向表 + 结论三件套 + 未测条件表）；结论缺未测清单不得作为推理前提；**方向表空或全死 → 派 fresh-eyes 独立评审重灌方向池**。`skill_view('os2-analysis-ledger')`
- **执行纪律**：工具空输出 = 工具失败不是分析结论，禁止据此下"不存在/未调用"结论；writeup 完整 exploit 直接用、验证最终结果不重推导；四类技术问题禁问用户。`skill_view('os2-execution-discipline')`
- **知识先查双路**：动手前先 `hindsight_recall` 查同类记录——目标/题目特征词一轮 + 技法/机制词（中英标识符原样，如 `cookie jar overflow`）一轮，单路无命中换另一路；题目名不是好召回键。

> 违反以上任何红线 → 立即 `kanban_block(kind='needs_input', reason='红线违反：<具体条目>')` 并退出，不得继续操作。
