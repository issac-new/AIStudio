# 九点对账·三正本与报告模版同步批（2026-10-26）

分支：`fix/nine-point-docs-sync`（worktree `docs-sync`，自 origin/main 0a5f213da 起）

## 变更

九点对账轮后续实证（500 根因更正、技能装载根对照、引擎四级解析序）与并行轮新落（692/693/694 补丁、design-sync 机制）需同步进三正本与报告模版：

1. **全流程推演方案 V8.53→V8.54（编码委托证据位批）**：
   - 词表 Ycode 词条更新：ZCODE_BIN 口径改为四级解析序（显式 env > 官方捆绑（过渡默认）> 分叉部署位 > 桥兜底）。
   - 步 25 措辞同步：编码引擎注入口径同上；26 步/六闸/判据零改动。
   - **§5.4.3 呈现底线新增「编码委托证据位」**：编码步（G3 承载面）的 `materials/delegate-log.txt` 须含引擎身份行（`engine_bin_source=`/`engine_bin=`/`session 模型已设置`）与终态行（`RESULT exit=`）；技能装载位声明（项目技能落 `.agents/skills` 或 `.claude/skills`＋用户级 `~/.zcode/skills` 软链两方案之一）随 G3 证据呈现。报告步块字段级核对（§5.4.2 ②）以本条为字段源之一。
2. **整合正本 R11→R12**：版本行随批；§3.2 编码委托链与技能装载根两方案已由技能根批入册（本批核对在位，不重复改动）。
3. **数字总账随批对账**：补丁 404/8（新增 692 kanban-patch-running-reject、693 element-web-dir-override、694 element-web-wasm-csp、zcode 009 claude-skills-compat-root）；specs 350；V8.54；全量测试行更新为注入态主树实测 6,366 过/4 败（并行 TDD 红测）/11 跳过（2026-10-26）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 报告模版更新走 §5.4.3 增条（证据位），不动 §5.2/§5.3 判据与步语义 | §5.4 是报告规范唯一事实源（§5.5 验收清单引用它）；增证据位沿 V8.45/V8.46 先例（评测面/治理结果均是 §5.4 增条升版），不触冻结面故不需整轮推演 | 改 mx-report-gen 生成器代码（否决：报告能力正本在产品侧 custom/server/report/，生成器是兼容消费壳；且生成器改动需接线断言，超出文档同步批边界） | 是 |
| D2 | 委托证据位字段以 delegate 日志现有行为准（engine_bin_source/engine_bin/RESULT），不新造字段 | 这些行已由 delegate 驱动落盘（2026-10-26 起四级解析+--model 批），报告侧只规范「呈现什么」，零新仪器 | 新增独立 evidence 文件（否决：第二真值，delegate-log 已是 G3 既有指纹） | 是 |
| D3 | 总账全量测试行改为「注入态主树实测」口径并注明 4 败=并行 TDD 红测 | 主树默认未注入时全量出 115 假败（本日实录）；口径不注明会把环境假红当基线 | 沿用侧栏轮 6336/3 旧口径（否决：落后两轮，且未注明注入前提） | 是 |

## 设计文档影响

DESIGN_SYNC: touched
- docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md — 版本行 V8.54；词表 Ycode 词条；步 25 一句措辞；§5.4.3 增「编码委托证据位」一条。
- docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md — 版本行 R12（正文无改动，§3.2 已由 2026-10-26-skill-roots 批入册）。
- docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md — 补丁 404/8、specs 350、V8.54、全量测试行口径。

## 验证

- 锚点核对：编辑后 grep 逐锚（版本行/V8.54 计一处、词条、步 25、§5.4.3 新条、总账四行）。
- 冻结面核对：26 步主链/六闸/§5.3 判据零改动（diff 仅限四处既定编辑）。
- 本批为纯文档批：不涉代码与测试面；gongwen-lint 机械首查过一遍新增段。
- 未验证项：生成器/审计器对新增证据位的接线（按 D1 属产品侧报告正本后续批次，本批只立规范）。

## 挂账

- custom/server/report/（报告能力正本）对「编码委托证据位」的验收断言接线——下一产品批（本批只入规范）。
- mx-report-gen 兼容消费壳同步呈现引擎身份行——同上批。
