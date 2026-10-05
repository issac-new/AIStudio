# 推演历史与工程档案

> **文档定位**：全流程推演方案（2026-10-05-mux-v8-fullflow-plan.md）的过程层配套档案。正本只承载终态；本文承载：版本沿革与修订记档、历轮事故与违例先例、执行纪律台账（带先例锚）、执行态与开放事项、工程附录（上游吸收谱系/维护规范/harness 隔离运维）。正本条款与本文先例冲突时以正本为准；本文先例仅供判定参照与追溯。
> 维护纪律：正文只增不改写（先例锚随文保留）；正本验收条款增改时在本文"条款↔原编号映射"补行。

## 一、版本沿革

| 版本 | 文件 | 要点 |
|---|---|---|
| V3 | docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md（workspace 根） | 初版 26 步+把关括注；2026-10-05 前曾长期作为报告解析源（正本分叉实录见下 §四） |
| V5 | 2026-09-29-mux-v5-fullflow-plan.md | 契约层冻结（26 步/六闸/模板）；changelog 见 changelog-archive |
| V6 | 2026-10-02-mux-v6-fullflow-plan.md | 终态版（能力底座/七问题域/设计实现清单） |
| V7 | 2026-10-03-mux-v7-fullflow-plan.md | 运行韧性版（并发预算/环境重置/驱动韧性/完成凭证一体化/补丁收编）；已转存档 |
| V8 初版 | 2026-10-05-mux-v8-fullflow-plan.md（本次重写前的中间态） | 五层分离+每步四问+验收线 R19-R24（结构排查输入） |
| **V8 终态** | 2026-10-05-mux-v8-fullflow-plan.md（现行） | 五层分离正文去脚手架：R/D 编号与违例先例移入本文，附录 A-E 收敛为本文 §五-§七与正本 §3.3；契约层语义零改写 |

**V7→V8 修订记档**（结构排查=2026-10-05-v7-plan-structure-audit.md）：①五层分离重排，逐步条目只留场景动作+机制约束+尾行把关括注（解析锚）；②验收归一（第五部分唯一事实源+层级声明）；③报告规范重写（每步四问+反凑数负面清单）；④正本解析源切换；⑤收编 run8 复盘五补遗（fail-visible 静态门禁/活性判据共因提示/三载荷采集挂驱动步/导读层模板化）。
**V8.1 补强记档**（二轮排查输入）：场景段↔步号映射正本化、字段级模板核对、审计 FAIL 不得收官、必采矩阵、覆盖率与组织计数口径——终态规则已并入正本 §3.3/§5.4/§5.5/§5.6。

## 二、报告验收线台账（原 R1-R24；终态条款见正本 §5.5，本表保留历轮违例先例供判定参照）

| 原编号 | 要求 | 违例先例（历轮实录） | 正本归属 |
|---|---|---|---|
| R1 | 判词真值 | run2 G5：日志行"发布准出通过（04:49）"系词面误配，真实评审卡 body=READY-GATE-FAIL | §5.5 真值组 |
| R2 | 落键完整 | run1 六闸表 G3 落键时间为"—" | §5.5 真值组 |
| R3 | UAT 逐条判词 | run2 AC-4/AC-7 有条件通过，验收书却写"全部 AC 通过" | §5.5 真值组 |
| R4 | 发布基线守卫 | run2 基线 69ba333→0ab43de 非快进重建丢 23 提交 | §4.3 第 13 条 |
| R5 | 问题单 100% DISP | run1 台账 19 行 ISSUE/0 行 DISP | §5.5/§2.6 |
| R6 | 证据锚点密度 | run1 内联锚点仅 1 个、run2 仅 6 个 | §5.5 呈现组 |
| R7 | 截图红线 | 既有红线；缺图步补拍对位机制已落 | §5.5 呈现组 |
| R8 | 数字实算+组织数字自 roster 实算 | run8 叙事写"12 人 24 账号"，state.env 实有 14 账号 JWT（28 账号） | §5.5 真值组 |
| R9 | 报告步自证 | run1/run2 均自标 ⬜ | §5.5 真值组 |
| R10 | 工件新鲜度 | run2 步 20/21/23/24 用 09-26/09-27 旧工件顶替 | §5.5 真值组 |
| R11 | 交付物真容 | 两轮报告 15+ 类交付物零呈现 | §5.5 呈现组 |
| R12 | 截图内容一致性 | 两轮共 15 处图证不一致（快门守门由此固化） | §5.6 快门七条 |
| R13 | 工件真实可编辑 | 现状已闭环（治理工件编辑链） | §2.1 设计初衷 |
| R14 | skill 过程展示 | 两轮报告零呈现（skill 生成在推演前置，未设采集位） | §5.5 呈现组 |
| R15 | 协作顺序总述 | 历轮报告无第 0 章（用户 10-01 指认） | §5.4 十章骨架 |
| R16→R16' | 操作入口→操作记录真值化 | run8 报告 26 处无锚模板串；steps_entry 表步 13/14/16/17/22 与方案步语义不符、步 26 引用已退役工具 | §5.5 呈现组 |
| R17 | 按轮真值 | run6 实锤审计四类旧账冒充（生成器四修根治） | §5.5 真值组 |
| R18 | 全量呈现不裁剪 | 用户 2026-10-03 指令立线 | §5.5 呈现组 |
| R19 | 空态禁渲染 | run8 报告 26 处"（截图缺失）"+空 R18 块连发 | §5.5 反凑数组 |
| R20 | 每步问题可见 | run8 报告逐步块零问题面板 | §5.5 反凑数组 |
| R21 | 术语规范 | run8 黑话清单（564/41 棒/带伤完成/顶包等无全称） | §5.5 反凑数组 |
| R22 | 方案解析源单一 | 解析器硬编码 V3 旧版达五版（见 §四） | §5.5 反凑数组 |
| R23 | 步语义对齐 | run8 叙事表把场景段顺序套进方案步号，步 8-25 整体错位；步 12 键名错配误判 ⬜ | §5.5 真值组+§3.3 |
| R24 | 覆盖率与计数口径 | run8 头部标"14/26 覆盖"，按必采矩阵实算 6/11（11 步仅一句手工效果陈述、帧 0 组） | §5.5 呈现组 |

## 三、执行纪律台账（正本 §4.3 的先例锚；D 编号历史沿用）

| 正本条 | 原 D 编号 | 先例锚 |
|---|---|---|
| 4.3-1 | D1/D3 | run6 排期任务 40-60min 实跑撞 2400s 窗口（窗口已改 7200s）；UAT 证据核验 40min 场景 2400s 硬窗必炸 |
| 4.3-2 | D2/D20 | 网关 active_agents 误判快照重启腰斩双会话（run7）；在线面板三档量纲（回归轮 F6 定口径） |
| 4.3-3 | D2 补 | run8 五起活性误诊全走弯路；564 投递兜底落地后预期消失，run9 验证 |
| 4.3-4 | D4 | run6 群线程派发部分账号静默丢失实录 |
| 4.3-5 | D5 | run7 三人验证一致；重发后 2 分钟内 API call 即接单 |
| 4.3-6 | D6 | Matrix 403"对方未入群"（overlay f8382131 根治） |
| 4.3-7 | D7 | run7 四类尾部动作被丢（回执×3/双@×4/评审卡/raci 字段） |
| 4.3-8 | D8 | run2 G5"04:49 通过"stub 词面误配（H8 根治） |
| 4.3-9 | D9 | run1 G3 落键"—"、run2 审计#4 跳闸（H10 根治） |
| 4.3-10 | D10 | run1 12 键补账+run2 R-A5 6/6 回灌；DISP 措辞误桶先例 |
| 4.3-11 | D11 | run1 先例 |
| 4.3-12 | D12 | run6 三条推送类问题单共 8 条事件源于口径缺失 |
| 4.3-13 | D13 | run2 基线丢线 23 提交（H11 根治） |
| 4.3-14 | D14/D15 | run7 集成分支 run6 旧测试报告险情（repo_has 存在性判真）；devimpl 4/4 全新鲜实证 |
| 4.3-15 | D18 | run2 审计#5/#8（R-A4 根治） |
| 4.3-16 | D16 | run2 导演侧"通过"被独立审计 10 项推翻（R-A6 改判） |
| 4.3-17 | D17 | run2 R-A1：REL-* 三卡冻结至 R1-R4 闭环 |
| 4.3-18 | D19 | run7 gate_review jq 裸键语法错三连死循环（c24a9d60 热修） |
| 4.3-19 | D21 | run8 六型静默死亡各烧 20 分钟-3 小时（set -euo pipefail：全角吞字/空数组/pipefail 赋值/算术 -n/local 自引用/curl22） |
| 4.3-20 | D22 | run7 director-nudge-mislead 实录 |
| 4.3-21 | D23 | run8 跑完才补采，帧类无法补实录 |
| 4.3-22 | D24 | run8 注册劳动落在收官夜实录 |

## 四、正本分叉与解析源实录（结构排查 §二，R22 先例）

1. mx-report-gen.py PLAN_PATH 曾硬编码 workspace 根 V3（2026-09-25，197 行），与 V5-V7 正本分叉五版——报告"把关标准（方案原文）"引的从来不是正本。已根治：解析链=MX_PLAN_PATH 覆盖→主工作树 V8→NVMe 镜像兜底（simharness e70b02b）。
2. 工作区双树并存（/Users/cuishi/lab/ncwk 主树与 /Volumes/nvme2230/lab/ncwk 镜像树，overlay 各自独立 git）——同步靠 git，勿在镜像树留未提交改动。
3. 操作入口表（steps_entry.py）自述"轮次无关的产品事实"，与实际执行动作（harness 驱动）脱节——终态处置=正本 §5.5 操作记录真值化。

## 五、执行态与开放事项（原附录 D）

**轮次执行态锚**：run6（RUN=20261001-v5-run6）26 步全闸收官，报告 runs/20261001-v5-run6/evidence/final-report.html；run7（RUN=20261002-v5-run7）13h05m 收官，六闸全落键、UAT 判词 7/7，收官链全绿（42 图/审计全过/视觉 5/5），overlay 收官批 9ee4299f；run8（RUN=20261004-v7-run8）带伤收官 ≈17h，交付率 2/4（hu/xiao 停摆，根因=网关响应投递丢弃〔patch 564 已修〕），报告审计 FAIL（缺图+全量呈现缺口）按正本 §5.6② 视为未达标轮，总账见 `docs/2026-10-05-run8-retrospective.md`。

**开放事项（跨轮有效）**：
1. 长线记档项：SBOM+依赖白名单；graphify 代码图谱接入 IDE 面；影子运行/双跑对比（口径已立）；逃逸缺陷率与 revert 率长线数据；KG 跨批次实体消歧/实体链接。
2. 待验证项：MX_APPROVE_MODE=hybrid 起跑实测；`!refine` 治理卡点链路实测；IDE↔运行详情交叉跳转；564 投递兜底与六型脚本坑护栏的 run9 实跑验证。
3. 回归轮遗留（2026-10-03）：mx-up 偶发退出码 1 且网关未起（根因未查，起跑以双 health 显式断言兜底）；patch 540 重生成版重放失败（锚在漂移态树，记档未根治）；改已记账补丁后 inject 跳重放未根治（升级后须手工全链重放对账）；fanfan UI 出站 Enter 在合成键盘下不触发（待真实键盘人工复验）；L10 Changelog NModal 在后台标签不渲染（待装机/Electron 验证）。
4. run8 遗留：补拍轮（报告截图 0 张，studio 在线时补采帧与图）；中栏浮卡入口冗余（计划 3 面/子代理 4 面/队列 2 面）待裁决。
5. run9 定位=验证轮：564 补丁+护栏+驾驶舱三件套首次全量生效；验收指标=交付率回升 ≥3/4、假停摆零复发、接力棒数 <50、全量呈现帧类当轮采集。不引入新剧本变量。

## 六、工程附录 A-C（原 V7 附录全文要点，运维与核查时查）

**附录 A 上游吸收谱系（截至 2026-10-02）**：一期 x20 IDE 吸收（d5f70537+83e5413b；a34a15aa）；二期消息面（系统事件折叠/permalink/房间排序/同名房悬停）+治理工件编辑链+settings-layers 四层+IDE Fork 网关真分叉（POST /api/sessions/{id}/fork）+蓝图画廊 16 模板+ekko/JEV 开门+网关能力卡（absorb-round2 走查 10/10）；QGate v0.3：13→44 门四档裁剪+rawOutput 交叉核验+输入快照新鲜度+元门二轮通道+task-intent 意图漂移对账+四族 22 检查+CLI 生命周期四命令，符号接地门 2844→0（main ab6c101c；套件 156/156；全量三连 3584 绿）；四源文 12 提案甲乙丙三组（KG 演化治理 A1-A4/驾驭工程 B1-B4/无损换窗 C1-C4，P18 全表）；保真开关面（P19：MX_BGREVIEW/gate_review v3/MX_APPROVE_MODE/MX_REASONING_EFFORT/memory 对齐 8f93a048…d1e24f9e；分类器 14/14+poll jq 4 用例）。

**附录 A.2 网关 api_server 通道**：常驻 127.0.0.1:8650（config.yaml platforms.api_server.extra.port），鉴权 API_SERVER_KEY（~/.hermes/.env），路由含会话全套（fork=CLI /branch 语义）/api/jobs CRUD/v1/capabilities；studio 接入=runtime-caps 域只读代理（TTL 缓存+单飞锁防 CLI 风暴+HERMES_SKIP_UPDATE=1 阻断自更新）；launchd 重启窗口内短拒属瞬态（实录自愈）。

**附录 A.3 补丁族记档**：539/541=/hermes/history 死导航清族；540=看板选板迁分层；537/538 深链+badge 注入树实施；542=kg-evolution 六路挂载；543=harness 四子路由挂载；544/545=context-archive+ctx-notes 挂载；546=压缩边界史表；540/543 已重生成锚到纯净重放态（8251f51d，LIVE==REPLAY 确定性验证）。回归轮补丁族（2026-10-03，main 37aa4c64→f80429bc 线）：524 补遗=ConnectionsPanel connectionsExtras 缺 import（整页空白+导航冻结级联，P0）；539 补遗+551=HistoryView 悬空 name:'hermes.historySession' push 清族（改路径式 /app/history）；547=看板抽屉未指派卡不滤（NULL assignee 滤光=抽屉打不开根因，回归实测 0→2 有效）；548/549/550/552=i18n 回归四连——rebalance/rebase 丢键复发族（ia2 九键/journey toast/changelog 0.7.27 八键/usage costStates+pricing 块），守门 i18n-upstream-keys-gate.test.ts 已立；553=A-H 八项 UX 晦涩修复（原编 552 撞号让位改号）。非编号锚：D4 三壳 overflow:clip（6dc3c436e，顶栏操作区死区 P0）；merge-review 裁决死循环根治（0a3ffe32，board-adjudicated-<slug>.json 持久台账+keep-existing 豁免）；网关 platforms/base.py 与并发测试入库存档（原被 .gitignore 挡库外）。

**附录 A.4 开放线**：①设置步三互斥声明（与插件宿主同批，接缝文档 2026-10-01-plugin-seam-definition.md）；②webhooks 管理面（dashboard 常驻依赖，运维裁决）；③KG 跨批次实体消歧。

**附录 B 维护规范**：①过程与终态分离（正文只承载终态；修订过程入本档案）；②正本合并守卫（正本变更直接在 main 提交；分支合 main 前验证 `git diff main...<branch> -- <正本路径>` 为空或为本次变更本体，禁无关整文件重写）；③证据锚不可丢（条目修订时 commit/事件/文件锚随文保留，删除内容先入归档件）；④契约层稳定（26 步主链与六闸语义变更须整轮推演验证；执行纪律按轮追加只增不改写）；⑤运行时补丁收编三步（正本入 overlay/runtime/、登记 runtime-manifest.json、deploy-agent-runtime.mjs --apply 验证收敛；工作区态视为未部署——hermes 自更新会擦，run6/run7 三次实录；每次 mx-up 后 deploy dry-run 对账）；⑥注入链纪律五条（manifest-树失配自愈=三树 clean+删 manifest+全量重注入，勿信 manifest 自报；改已记账补丁 inject 不自动重放，须 HEAD+全链重放并 LIVE==REPLAY 逐字节对账；补丁编号唯一，撞号让位改号，series 按编号排序，插入行后 hunk recount+补末行换行；注入生效边界=overlay→upstream 后 8647/8649 重启、runtime→hermes 后重启各 profile 网关；反向操作禁止=脏树 clean 可能逆放补丁，clean 前查 manifest 与树一致性）。

**附录 C 推演 harness 分树隔离（2026-10-03 隔离轮）**：目标=推演栈与产品仓彻底解耦，根治四类历史事故（mx-clean 逆放擦产品补丁/共享执行面互踩/自更新与补丁部署互擦/产品构建期间推演断供）。①两仓分界：harness 独立为 simharness 仓（ncwk 根下与 overlay 平级，commit ddb4484）；overlay 侧 scripts/aipay/ 已删；overlay 对 simharness 只读消费（隔离边界测试三断言：产品零反向依赖/引用全落白名单/零写原语指向产品上游树）。②执行面三参自持：STUDIO_DIST/HERMES_BIN/HERMES_PYTHONPATH 缺省指向 SIM 自有快照（ncwk-sim-mux/），缺位回落宿主/活树并大声告警；HERMES_PYTHONPATH 只余 agent 源码快照（installs site-packages 进 PYTHONPATH 即与宿主 venv 混载原生扩展，pydantic_core 炸载→mcp SDK 导入环实录）。③hermes-sim wrapper：`venv python -I` 复刻官方 wrapper 语义+sys.path 前置快照源；验收=网关进程命令行带 `-I …/hermes-sim.py`、env PYTHONPATH 仅快照路径。④快照语义：agent 源码快照=宿主 git 跟踪文件的工作态（HEAD+脏态指纹；git archive HEAD 漏未提交补丁层实录），git 化+provenance 档案；product-dist 快照=dist+node_modules 全量镜像（bundle 外部依赖 9 包从仓库根解析；dist 重灌 `--delete` 必须加 `--exclude=node_modules`）。⑤D3 覆盖事故防复发四件：模板回灌宿主 .bak（幂等备份是恢复源，KEEP_BACKUPS=3 勿清）；runtime/ 移出 .gitignore（模板无版本控制即漂移——事故直接根因）；manifest 增补未跟踪分发件（快照只取 git 跟踪文件，未跟踪运行件走 manifest 通道，共 23 件）；marker 扫描面=六代码目录（390 marker 在 hermes_cli/、533 在 tests/，只扫 gateway/ 必漏）。⑥验收基线（每次 mx-up 后）：8801/health+8802/health/ready 双绿；gateway.log 零 AttributeError/pydantic/告警环；deploy dry-run 对账全相同；守门套件+isolation-boundary 三断言全过。
