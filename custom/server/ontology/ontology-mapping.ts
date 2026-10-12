# SwarmStudio 本体↔物理载体映射注册表（P1-2，2026-10-12——本体论透镜分析落地件）
# 每条=语义实体在系统里的可反查载体。mapping-v1；实体ID 见 ontology-seed.ts，载体类型限四值：
#   kanban（看板板面）/file（仓库文件域）/endpoint（REST）/event（事件或台账行）
# entity | 中文名 | 物理载体 | 载体类型 | 字段或键 | 映射方向 | 来源
term-map:Agent | 智能体 | profiles/<user>/ | file | profile 目录名 | write | ontology-ingest.ts
term-map:Human | 人类协作者 | docs/admin/roster.md | file | 行记录 | read | roster
term-map:Role | 角色 | docs/admin/roster.md | file | 角色列 | read | roster
term-map:Squad | 小队 | profiles/<user>/kanban | file | 板目录 | write | mx-setup
term-map:Task | 任务 | kanban JSON（cards/*.json） | kanban | title/assignee/status | both | ontology-ingest.ts
term-map:Board | 看板 | kanban JSON（board.json） | kanban | team 名单 | both | ontology-ingest.ts
term-map:Deliverable | 交付物 | 中央仓路径（docs/apps/runtime） | file | 相对路径 | read | mx-report-gen.py
term-map:Gate | 关卡 | state.env 键 | event | g1_frozen…report_done | read | state.env
term-map:Patch | 补丁 | overlay/patches/<n>-*.patch | file | 编号/名称 | read | overlay
term-map:Repo | 仓库 | upstream/* / overlay / central | file | 仓库名 | read | —
term-map:WikiPage | 知识页 | docs/wiki/*.md | file | 路径 | read | wiki 轮
term-map:RFD | 需求单 | docs/requirements/RFD-*.md | file | 需求号/标题/AC 清单 | read | aipay-scenario.sh
term-map:Verdict | 判词 | matrix 事件 + 看板卡判词字段 | event | 行首判词/卡面字段 | both | gate_review
term-map:Run | 轮次 | runs/<runId>/ | file | state.env/evidence/ | write | mx-lib.sh
term-map:EvidenceFrame | 证据帧 | runs/<runId>/evidence/screenshots/steps/*.png | file | 步键-时刻-前后 | write | capture_step
term-map:IssueRow | 问题单行 | issues.log「ISSUE」行 | event | 类型段/主体/级别 | write | 全链路
term-map:DispRow | 处置行 | issues.log「DISP」行 | event | 三态分桶词/锚 | write | 全链路
term-map:Milestone | 里程碑 | .swarm-yuan/milestones.jsonl | file | 节点/卡号/状态 | write | trace-log
