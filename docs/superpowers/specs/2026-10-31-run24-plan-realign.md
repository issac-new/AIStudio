# run24 前重锚：方案正本与报告模板对齐 v1.0.4-overlay 基线＋守门窗口修复＋run24 前置正本

日期：2026-10-31 ｜ 类型：docs（方案/模板重锚）＋test（守门窗口）＋docs（run24 prelude）

触发：用户指令「基于最新基线，修正全流程推演方案及报告模板，完成前置准备工作，启动 run24」。方案正本末次修订=049f7bbd8（run23 复盘批），其后 main 合入 studio v0.7.39→v0.8.0 大版本、品牌扫尾 718、RSI 二批/P2、恢复图 run 详情（4c181cf72）、zcode 3.17.1、v1.0.4 发布——方案与采集面存在被打穿的陈述。双路并行对照（方案×基线、模板×采集面）产出差异清单后逐项处置。

## 1. 变更

### 一、方案正本（docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md）

1. **品牌名 12 处** SwarmStudio→AIStudio：主标题/总述/词表·工作台/§1.1.1 loop graph/§1.5 副驾定义/§1.5 范围展开/§2.1 组件表首行/§2.1.1 治理面/步 3 指引/§2.6.2 根因段/§2.6.9 消费位/§4.4 服务表。**保留 3 处**：L266 加粗裁定原句与 L1236「用户裁定原文口径」引文（改写历史裁定=篡改）；L402 `com.swarmstudio.sim`（Matrix wire 协议前缀，10-26 品牌轮保留清单，实现侧仍此值）。
2. **L1069 重定向矩阵**：`/app/runs/:runId→/app/sim?run=` 失真——恢复批（4c181cf72）已改图 run 详情实体路由 RunDetailView；同句 `/app/runs→/app/sim` 列表重定向保留。
3. **L375 mermaid L4 标签**：`→zcode`→`→Ycode`（对齐方案自身词表统称；`zcode-acp-server`/`~/.zcode/skills` 等标识符不动）。

### 二、采集面与入口表（simharness/mux/）

1. `capture-plan.env` 六处：重定向矩阵（同上）；房间深链陷阱备忘改「roomList 竞态 2026-10-31 已根治（初始快照＋watch 双路，活体 4/7→8/8），none 态待活体复测重估；?event= 缺口仍真」；预留位「同步未修」注同步；步 7 动态位 /app/cases 改阶段页规范 URL；步 23 候选位 deposit-template 改指 /app/runs/:runId（testid=rd-deposit-template，随恢复批退役旧称）；V8.29 预留位 orchestration 改独立页 URL。
2. `steps_entry.py` 头注四段重锚（2026-10-31 标注）：侧栏五组→日常/推演两模式（整轮组已撤）；29 签→37 签（②launch 删、⑥12 签三组聚类）；「运行总览」→「导演台」（默认签）；补推演七项/导演台运行详情/图 run 详情实体路由。

### 三、报告链（mx-report-gen.py 三处）

第 3 章数据源注「治理中心（#/app/board 治理页签组，v0.7.30 起…）」三重失真→改指⑥治理阶段页（/app/stage/govern）；台账回查与 footer 渲染载体两处「治理中心」→⑥治理·问题清单/⑥治理·文档评审。STEPS_META_RUN1-9 与 narrative 历史注册表为按轮档案（R17 防旧轮冒充），禁改未动。

### 四、模板（templates-pending/）

1. `test-report.md`：§6 补 §2.7 强制字段「跨模块契约用例清单」（接口×断言形状表+释义注释；无跨模块接口须写「无，理由」）；§9 机械判据增第 17 条。方案 §2.7 G4 行、§5.3 G4⑦、步 19 合格线三处一致要求而模板缺项（单一事实源真冲突，run24 G4 审计会判缺）。
2. `README.md`：挂账候选清单补 test-design 三行（UC/INT/QUALITY——对账发现清单漏列，非模板冲突）。

### 五、守门修复＋run24 前置正本

1. `tests/harness-gate-integrity.test.ts`：g5_pass_finalize 函数体正则窗口 9200→12000（run23 复盘批审批历史探测入函数后实测 10251 字符，main 基线自带红——主检出复跑同断言证实非本批引入；判据零变化）。
2. `simharness/docs/2026-10-31-run24-prelude.md` 新增：run24 操作清单（v0.8.0 首轮三个不同/必绿/起跑顺序/narrative_run24 两必带/六观察项/决策记录）。

## 2. 决策记录

| # | 决策 | 理由 | 否决的备选 |
|---|---|---|---|
| D1 | 裁定引文保留旧品牌名（L266 加粗句+L1236 原文口径） | 用户裁定原文按当时口径留痕，改写=篡改历史裁定；方案叙述性品牌名收敛 AIStudio | 全量替换 13 处（否决：含引文篡改） |
| D2 | 契约用例清单补进模板而非降方案字段 | 方案第五部分是验收正本（冲突以它为准）且 §2.7/§5.3/步 19 三处一致；模板缺项=载体缺口 | 从方案删字段（否决：砍掉 G4⑦ 验证项） |
| D3 | 契约清单落位 §6 内表格而非新增独立节 | 最小扰动（节号顺移会波及 16 条既有判据的节引用习惯）；G4⑦ 判据 17 按标题词正则核对，不依赖节号 | 插 §7 新节（否决：连锁改号无收益） |
| D4 | roomList 备忘写「待活体复测重估」而非直接改判可拍 | 产品侧根治有守门+活体 8/8 证据，但采集环境（无头）是另一前提；run24 观察项 3 承接复测 | 直接改「可拍」（否决：未经采集环境实测） |
| D5 | 守门窗口随批修（非挂账） | prelaunch 以守门全绿为准入，run24 开跑前必须收敛；main 基线自带红已实测定性 | 挂账（否决：阻断开跑准入） |
| D6 | prelude 决策 D3 沿袭「值守监控等用户显式令建」 | run21/22/23 惯例；不自动复制监控定时先例 | 自动建监控（否决：越权先例） |

## 3. 验证

- 方案正本：品牌残留 grep=2（有意保留的两处裁定引文）；重定向矩阵/mermaid 替换各 1 处唯一命中（python assert）。
- 语法：steps_entry.py 与 mx-report-gen.py `py_compile` 过。
- 守门 sh 段：`bash tests/run-gates.sh` rc=0（ALL-PASS，含 dm-send-tracked/venv-preflight/r18 端到端）。
- 守门 vitest 段：借主检出 vitest 跑 `--root worktree/simharness`＝**217/217 全绿**（窗口修复后；修复前 216/217，1 红=main 基线自带，主检出复跑同断言证实）。
- 清偿面（run24 开跑前置实测）：`check-clearance` ✓ 无 open 代偿；`check-issue-clearance` ✓ 延后桶=0。
- 中途事故记录：窗口修正曾误落主检出（相对路径写错树），已 `git checkout --` 恢复后在 worktree 重放，主树 simharness 干净。

## 4. 设计文档影响

DESIGN_SYNC: touched——方案正本《2026-10-05-mux-v8-fullflow-plan.md》同批修订（品牌 12 处+重定向矩阵+mermaid 标签），本文件即其 spec；闸名/26 步/判据数值/阈值零改动，整合正本数字总账无需变更。
