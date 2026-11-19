# Web安全工具库 公众号蒸馏（websec-toolbox）

- 标签: websec工具蒸馏
- 概括: 公众号推荐工具蒸馏出 target-scoped-workspace 七件套 + scope-gate Runbook 门禁两条落地范式
- 类型: fact
- 日期: 2026-09-09（2026-11-02 自 INDEX.md §7 迁移至三字段格式，语义未改）

## 完整打法

来源：微信公众号「Web安全工具库」推荐工具（2026-03 ~ 2026-09 窗口）

收录：FLUX-Webscan 综合扫描 / MetaSword 逆向渗透工作台 / bface-agent AI 红队
agent / plutox-sec-forge 双环境工具包管理器 / xxx-mods-scanner 轻量侦察

落地①（bface-agent 范式，t_7fcf0f52）：target-scoped-workspace「目标档案 7 件套
（Engagement 档案，跨会话连续）」+ templates/engagement/ 7 骨架；
fp-check「§6 漏洞三态账本接线」（Candidate→Confirmed 六门晋级）

落地②（plutox-sec-forge 范式，t_bc4daec7）：scope-gate「Runbook 式授权门禁
（Auth Gate）」（consent.txt 落盘 + 危险操作单独放行）+
「证据报告范式」（命令/退出码/耗时/输出 → report.md + run.json）

用法：`skill_view('websec-toolbox')`；原始 README 证据在
workspace/websec-tools-survey/raw/tools/
