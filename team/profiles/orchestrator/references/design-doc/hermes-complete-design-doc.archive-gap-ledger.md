# Hermes 集群设计文档 — gap 与调研演进归档卷

> 拆卷纪律见设计文档附录 B。本卷只增不改：新条目插卷首，旧条目保持入库顺序；修订以新条目追加，不原地改写。
>
> **重建声明（2026-11-02）**：10-19 重构时声称的旧 22 条正文（当时头部段记为「20 条」，实数 22），经仓内 git 历史（`git log --all -- '*archive-gap*'`）、外置冷存档区（`/Volumes/nvme2230/lab/archive/`）、本机全盘三方查证均未落盘——判定为当时拆卷未落盘。本卷自 2026-11-02 重建，从新条目起记；旧 22 条正文待从设计文档 git 历史恢复（入口：`git -C ~/lab/AIStudio show 2ae840050^:team/profiles/orchestrator/references/design-doc/hermes-complete-design-doc.md`），恢复前设计文档附录 B 索引行是唯一线索。缺口登记于 `gap-20261102-design-doc-sync`。

---

## gap-20261120-design-doc-sync：1103-1120 窗口复盘 → 设计文档口径刷新（编制 30→27 + 六融合节）

- **来源**：用户令「依据近期调研及更新等，更新整体设计文档」。窗口起点 = 上次同步 `gap-20261102-design-doc-sync`（正文尾批 commit 9b09fe4c5，11-02）。方法 = design-doc-sync-audit 五件套 + 6 路 digest 子代理全文消化（微信簇/1117 簇/hack 簇/知识栈簇/公文簇/科学技能簇，18 分钟并行回执）。
- **编制刷新（三域网关并入）**：aiteam/pay/data-orchestrator 三岗 2026-11-17 退役（`20261117-orch-merge`）→ 在册 30→27（26 worker + 1 orchestrator），正本 30+ 处口径全改（头部/§0.1/§2.0/§2.1 图/§2.2 范式表与 27 岗一览与编制明细/§2.3.1 三视图/§3.4/附录 A）；域知识库路径外置 `shared/domain-knowledge/{pay,data}/`（验证命令同步换新）；10 业务板口径不变。
- **计数复测（2026-11-20）**：skills 889→923 / 顶层 53→51；治理规则 95→97；bin 74→82；pay 库 32MB→34MB；research 目录 50 个；底座三件套 swarm-yuan v2.95.0（正本 11-08 自安装副本重建）/ hermes v0.23.2 / studio v0.8.28（cockpit 0.8.28-studio.1）。
- **新增 §4.42-§4.47 六融合节**：技能工程与评测（wechat3）/ 主动性治理（6A）/ hack 攻防双技能（moanju）/ 知识栈与 WeKnora（knowledge-stack）/ 微信情报增量管线（wechat-delta）/ 公文能力栈（gongwen-suite）；§3.5 补五类分账+存量对账三面法+台账第 8 行；§4.33 补调研方法论增量（scoop-check/release notes 口径/K-Dense）；§4.7.2 补五闸门随板分发注；§4.21 补 semantica 现状口径；附录 A +12 术语行；附录 B +9 索引行。
- **实现缺口顺手修复**：夜间域派工 `domain_nightly.py` + `gap_register.py`（life-workbench 正本 + ~/.hermes/scripts 副本）仍派 aiteam/data/pay 差距给已归档网关 profile——改投 aiteam-scout / data-arch / pay-fintech（语法校验过）；文正本 §4.10 域→岗映射同步。
- **验收**：新词 grep>0；`^||` 畸形行零新增；代码围栏偶数；§4.N 序列 4.42→4.47 递进；旧值复扫（29 worker/30 agent/889/95/74/47-47）非历史行零残留；stale 快照 `hermes-complete-design-doc.md.stale-pre-20261120-sync-1014` 留档。
- **状态**：done（2026-11-20）。挂账：① hermes 侧 RSI P0 三项仍未执行（见 gap-20261031-rsi-survey 行）；② AIStudio records 10-28 快照副本落后正本，按 aistudio-incremental-sync 另行同步。

## gap-20261120-scientific-agent-skills：K-Dense 科学技能簇方法论融合

- **来源**：K-Dense scientific-agent-skills v2.72.0（177 技能/22 类，MIT，arXiv:2609.00065v2）→ 裁决书 `~/.hermes/shared/research/20261120-scientific-agent-skills/FUSION-VERDICT-20261120.md`（20 机制：吸收 8/收缩 4/印证 7/不吸收 1）。
- **落地**：research-methodology v1.3→v1.4.0（59→64 条：T6/S12/E18/V6/R14，K-Bench 过度宣称打标/自验证频次/裁判自偏好、复现>生成、行锚引证 #L45-L52、PRISMA 三分、HARKing 冻结防线）；skill-library-slimming v1.1.0 合并路由证据锚（13.9x 常驻税实测行）；article-methodology-fusion v1.7.0。
- **验收**：四 skill 锚点独立复核在位（含 orchestrator symlink 视图与实体逐对 SAME）；grep「64 条」/五条新目全中。
- **不吸收**：177 领域技能本体（tap 已注册按需取用）；BYOK 桌面产品；NemoClaw/OpenShell 沙箱；M20 LLM 技能扫描器（登记 gap 低优先）；「25 万科学家用户」正典无此数不采信。
- **状态**：done（2026-11-20）；成色=语义+机制落地，效力待首次实战。

## gap-20261119-gongwen-suite：公文能力栈收敛单技能（三层栈 + 两逆向产物）

- **来源**：`20261112-gongwen-ai-reverse`（公文精灵 OmniMesh bundle 免登录逆向：OM 标签 18 要素 + GB9704 参数矩阵；新华妙笔官网实测：三级校对/四档差错/五类词库）+ `20261119-gongwen-wx-article`（super-official-writer 229 篇 91.4 万字量化参数 + ppt-studio 审美证据化两正典 clone）。
- **落地**：三技能收敛单技能 `devops/gongwen-suite` v1.0.0（452K；references 5 件 + scripts 4 件 2706 行；34 profile 挂载）；om2docx 29/29 断言（本轮亲测 rc=0）；gw-qa 七文体量化终检；gongwen-lint 18 规则（设计文档 §0.5 文风基线门禁消费件）；旧 gongwen-bifa 收编（tar 备份在案）。横切原则=内容与版式分离。
- **不吸收**：C 端定价/端侧硬件/亿级素材库宣称/领导人称谓词库/服务端 prompt（未取证）/ppt-studio Gallery。保留意见：妙笔 98.7% 等校对数字为厂商宣称未独立验证，吸收的是维度框架。
- **memory 勘误**：om2docx.py 实际在技能 scripts/ 下（非 ~/.hermes/bin/）；三层栈已收敛单技能（旧三技能名过期）。
- **状态**：done（2026-11-12/19 两轮）。

## gap-20261119-researchstudio-fusion：ResearchStudio 12 机制 + CCFA 14 条融合（scoop-check 落地）

- **来源**：微软 ResearchStudio（MIT，3,620★）回源正典 + CCFA-Skills → 裁决 `~/.hermes/shared/research/20261119-researchstudio-idea/FUSION-VERDICT-20261119.md`。
- **落地**：research-methodology v1.3.0→v1.3.1（多源检索 CLI/DOI 三级去重/语义过滤 Step 1.5/scoop-check 七步/ideation 模式库收缩/质量契约）；skill-tuning-production v1.0.1；CCFA 批次吸收 CS-7 完整性核验 auditor（R13）。
- **scoopcheck 效力首跑**：`scoopcheck-exercise/scoopcheck-report.md` 判 clef-jev 守门位 **Level 1 全撞**（this-that-model-1.0 arXiv 2609.23886 + Jev 1.13 实测 arXiv 2610.24649 覆盖；残余 delta=生产校准回路+编排治理决策点）；选项通道攻击（arXiv 2610.12292）实测所有防御可击破 → 维持 fail-closed。对外表述禁宣称首创。
- **不吸收**：idea_spark 执行管线与 idea-quality 评分（重入条件：idea card/CCF-A 量产需求）；Reel 半边；CCFA 18 skills 本体；CS-14 科研绘图。
- **状态**：done（2026-11-19）。

## gap-20261119-moanju-hack-fusion：模安局语料线二期（hack 攻防双技能 + 互测结构）

- **来源**：模安局（moanju.org 站点直抓）sitemap 枚举 142 篇真增量（精读 30）→ `~/.hermes/shared/research/20261119-moanju-hack-fusion/FUSION-REPORT.md`；基线=9 月 148 篇（§4.7.2）。卡 t_acf7ed74 done。
- **落地**：redteam-agent-injection v1.2.0（七大攻击面+双层选型决策树）+ skill-integrity-path-governance v1.2.0（六段三门 L0-L4+π 八策略+运行时门 v2）互为回归用例集（红蓝对照互测结构）；五闸门拷入 `scripts/moanju-gates/` 随板分发（56/56 复验）；6 hack profile symlink。
- **口径修正**：「大量 skill 本身恶意」不成立（恶意率 0.09%-5.2%），真实水位=漏洞密度 26%-64% × 全权限继承。报告两勘误入档：增量实际跨度 2025-10-11→11-17；profile 数 6 非 5。
- **不吸收**：112 篇未精读（manifest 分诊在案）；治理/域外类文章；27 机制矩阵非 P0 的 22 条；shinthink 单源待复核。
- **状态**：done（2026-11-19）。

## gap-20261117-research-capability-audit：调研吸收三面存量对账

- **来源**：用户问「历史调研吸收的渠道/能力是否已补齐」→ `~/.hermes/shared/research/20261117-research-capability-audit/`（AUDIT.md + 两 JSON 底账）。
- **落地**：P0 三修验证过（pentest §12 重落、daily-intel-brief v1.2.0、llm-wiki 回位）；程序固化为 skill `research-capability-absorption-audit` v1.0.0；机制结论=对账产物必落 shared/research/ 持久层。台账勘误：WeKnora 此前漏登（本卷 gap-20261113-knowledge-stack 补齐）。
- **不吸收**：P1 三项+4 子项择期；P2 14 项保持归档；9 行非调研豁免。
- **状态**：P0 done；P1/P2 open（择期）。

## gap-20261117-orch-merge：三域网关退役并入主 orchestrator

- **来源**：用户裁决（2026-11-17）「aiteam/pay/data 域网关退役，分解权收归主 orchestrator（k12edu 保留独立）」→ `~/.hermes/shared/research/20261117-orch-merge/`（manifest 3 tar sha256 全 verify=true）。
- **落地**：三 profile 冷归档 `/Volumes/nvme2230/lab/archive/20261117-orch-merge/`；路由知识蒸馏进 skill `domain-team-dispatch` v1.0.0（三域 SOUL 全文在 references/）；域知识库外置 `shared/domain-knowledge/{pay,data}/`（git 历史与 tag 随迁）；domain-registry owner 三行改 orchestrator；profiles.yaml 三条目删；三板 board.json profile_scope 去网关。
- **后续修复（2026-11-20 本轮 sync 发现）**：夜间域派工脚本 assignee 断链（aiteam/data/pay 仍指已归档 profile）→ 改投 aiteam-scout / data-arch / pay-fintech（domain_nightly.py + gap_register.py 正本与副本双修）。
- **不吸收**：三域 SOUL 全文不进设计文档；k12edu 不并入（隐私+独立微信通道）；三域 hindsight 记忆库不动。
- **状态**：done（2026-11-17；断链修复 2026-11-20）。

## gap-20261113-knowledge-stack：知识栈五线调研与 WeKnora 转正

- **来源**：`~/.hermes/shared/research/20261113-knowledge-stack-selection/`（REPORT + stream-a~e）+ POC 五件套 `20261113-knowledge-rag-selection/POC-FINAL-REPORT.md`（WeKnora vs RAGFlow：盲测 3:1、内存峰值 1.15GB vs 5.18GB）。
- **落地**：2026-11-14 终裁 WeKnora 转正（v0.9.0 五容器生产运行）、RAGFlow 退役观察（复查三条件入 skill `kb-platform-deployment` v1.0.0）；2026-11-15 投产 kb-search.py（混合检索+--ask）与生产库 hermes-research-prod（kb-config.json；嵌入=Ollama qwen3-embedding:0.6b 本地、LLM=glm-5.3 经 :18085 responses-桥）；nightly 03:10 导入/04:10 备份；设计文档 §4.45/§3.5 台账第 8 行（本轮 sync 收录——此前 SOUL 已用而设计文档零收录，为最大补位项）。
- **待办**：P0 LanceDB / P2 LightRAG / P3 llm-wiki 编译层未动工（条件触发）。
- **不吸收**：RAGFlow/Onyx/Kotaemon/向量库竞品/记忆中间件五家（与 Hindsight 同层）/Neo4j/Kuzu/全量 GraphRAG/Self-RAG/NotebookLM。
- **状态**：done（转正+投产）；三待办 open。附勘误：`20261113-ontostudo` 为取证脚本 typo 空壳目录（真实证据在 ontostudio/），已删除。

## gap-20261113-wechat3-skillfusion：微信三文融合（技能工程与评测体系）

- **来源**：三篇微信技术文（评测体系全景图/AntiFox/Skill 焚诀）→ `~/.hermes/shared/research/20261113-wechat3-hermes-fusion/REPORT.md`（裁决：吸收 4/判已有 3/部分增量 3；A3 原文 1141 行全文读毕）。卡 t_b1b44661 done。
- **落地**：skill `devops/skill-tuning-production`（反例必配——无反例路由 73%→53%、有反例 85%；bad case 五步法；三层套件一处定义）+ `devops/agent-eval-system-design`（六维矩阵+Pass^k+L0 全对门禁）+ security-tool-landscape-tracking patch（AntiFox 条目+自主渗透平台类目）。
- **不吸收**：A1 六维图仅审计透镜；AntiFox 本体（AGPL+本地靶场红线）；授权纸面/HITL（security-domain-delegation 已同构）。
- **状态**：done（2026-11-13）；设计文档 §4.42 本轮 sync 收录。

---

## gap-20261117-wechat-delta-pipeline：微信增量调研战役（15 篇精读 8 项落地 + 搜狗终局 + 论文升级 + 巡检管道）

- **来源**：用户令「跟进主要公众号的更新文章，完善 hermes agent teams」。存档 `~/.hermes/shared/research/20261116-wechat-delta/`（DELTA-FUSION-REPORT §一-§七 + corpus + sweep.py 管道 + 台账 wechat-accounts-ledger.yaml）。
- **深度批次（§一-§五，11-16）**：T1 四号合集通道（免墙）15 篇全文精读，8 项机制落地（死循环判定/评测成本工程/裁判偏见对抗/R1-R4/故障矩阵模板/R2 成本判据/五问/蜂群蓝图登记）。
- **搜狗批次（§六，11-17 凌晨）**：29/29 号穿透 0 墙、增量 10 篇；签名链（/link→s?src=11）被微信 poc 墙死（curl+真浏览器双实测 wappoc_appmsgcaptcha）；马赛克兜底 7 篇全为认知级/等效级（芯联汇/PaperAgent 均导流号，印证 8 月 readsemi 定性）。
- **论文升级（§七）**：EvoTeam（2610.39813）/ReflectPO（2610.30933）/Agent-Reflex（2610.17953）取 arxiv 一手源裁决——「技能跨板共享+板级规则隔离」获外部印证；Agent-Reflex 印证 flywheel 同构。
- **管道基建**：we-mp-rss 读书通道基建就绪（Cookie 有效/容器健康/cover 增量模式），待用户手机订阅 20 号激活；两个载体 cron job（wechat-patrol-t1 `08148fe72375` 每周一合集巡检 / wechat-sweep-t2 `cb2d52baacb6` 双周节流搜狗巡检）接入 unified_nightly_loop 周一门；顺手修复 skill-mining/ttvv 两载体 job 的过期 pin（hermes 新版凭据安全检查封杀 custom:cc-switch+base_url 旧形状，正确形状=cc-switch-route+glm-5.3+无 base_url，cron-job-management 技能已更新）。
- **挂账②当场转 done**：重试恢复率探针 `~/.hermes/evals/retry-recovery-rate.py`（ReflectPO 度量迁移，只读 immutable 零副作用），首基线：任务恢复率 94.6%（74 失败任务 70 恢复，30 天 9 板）；swarm run 级恢复率 22.4% 最低（147 失败 run 均摊 ~5 次/任务，连环崩特征，供 kanban-hostile-env-supervision 对账）。
- **挂账待派**：① 团队协作规则从执行痕迹演化（EvoTeam 机制候选：steer/comment/打回模式→per-board 协作规则修订回流，研究级不动手）；③ 用户手机微信读书订阅 20 号（人工，激活读书通道后增量全自动）。
- **状态**：调研/落地/管道 done；挂账①③ open（2026-11-17）。

## gap-20261114-proactive-6a：Proactive AI 6A 综述全量融合（干预五档/打断预算/挣得自主权/主动性评测）

- **来源**：微信文《下一代 Agent 到底需要什么能力？UIUC、Google、斯坦福等联合推出 Proactive AI 综述》→ 回源一手三件套：论文 PDF 204 页（storage.googleapis.com/gweb-research2023-media/pubtools/1048480.pdf，pdftotext 105 万字符）+ GitHub README 215K + 项目主页，全部存档 `~/.hermes/shared/research/20261114-proactive-ai-6a/`（FUSION-VERDICT-20261114.md + digest×8 + hermes-6a-mapping.md）。防重复扫描零命中=首次融合。
- **深读覆盖**：正文 8 章 632K 全量（§1-§2 orchestrator 亲读；§3-§8 八路子代理全文通读，机制条目 246 条）；References 区按书级蒸馏惯例不读。
- **裁决**：概念层 7 项（吸收 4/等效 2/收缩 1）+ 机制层 43 簇 = 吸收 12 / 收缩吸收 5 / 等效印证 18 / 不吸收 8。核心判断：五 A 已有强对位（多数印证），Anticipation 近空白；增量=干预交付五档阶梯/出手门与打断预算/挣得自主权通道/条件锚失效重访/主动性过程评测/便宜 oracle 配比六类，非新基础设施。
- **落地（2026-11-14）**：① 新 skill `devops/proactive-6a-orchestration` v1.0.0（操作面正本）；② alert-triage-rules 增补 §七 打断预算与断点搭车；③ delegation-brief-format v1.11.0 增补 §4.1 剩余决策空间 residual: 字段；④ agent-eval-system-design 增补 §6 主动性评测维度（机制层四+用户层二+负陷阱必测）；⑤ capability-ladder 增补 §13 挣得的自主权通道（normal 档待独立评审）。
- **登记待派缺口**：hack 变体搜索收尾（M6c-3）/ 持久情境模型机制面（M4a-1，影子起步）/ matter-state 事项级追踪（M6d-10）/ 雷达项目感知与多样性（S2/S4）/ dispatcher 可防危害维度（E14 增量）/ evals 负陷阱题组（A5 效力面）/ K12 四条（M6d-11/12/13/17/21，经 k12edu-orch 转交）。
- **状态**：融合与五落点 done（验收 grep 全过）；登记缺口 open 待派。

## gap-20261102-design-doc-sync：1031-1102 窗口复盘 → 设计文档口径刷新

- **来源**：用户令「根据上次设计文档更新之后的变化内容，更新整体设计文档」。窗口起点 = 正本上次更新 commit `d16b4b433`（2026-10-31 10:32，组件台账刷新批）。方法 = skill `design-doc-retro-rebuild` 五路盘点。
- **五路盘点结果**：
  1. git 时间线：AIStudio 仓窗口内 164 commit（全功能回归轮 7042→7231/0、run24 推演全周期、发布轮 v1.0.4→v1.0.7、hermes-studio 基线 v0.7.39→v0.8.0→v1.0.9 两连升、zcode 3.17.1 同步、离线安装包 D14/D15/D16、RSI R1-R12、super-agent 吸收批、DoD 完成契约门下沉）——均属驾驶舱/载体工程，按文档范围纪律（gap-20261019-scope-refresh）不入正文，仅刷 §3.8 底座版本锚。
  2. 看板 done 卡：窗口内全板 0 张（该批工作走 AIStudio 仓直提，不经 kanban）。
  3. 新调研目录 4 个：rsi-survey-20261031 / 20261101-rtx5090-ai-bubble / hack-teams-fusion-20261101 / wechat-article-20261102-hermes-teams——对应本卷 4 条新 gap。
  4. 运行态重探：:8650 hermes 0.22.5 healthy、clef-flash :8000 healthy、cc-switch :15721 200；evo 夜环 cache 逐日更新但 `evo_nightly.py`/evals 零改动（hermes 侧 RSI P0 未执行，挂账）。
  5. 计数当场重测：skills 807→889（口径修正：+`grep -v \.bak` 排 swarm-yuan.bak.* ×3 共 106 份备份；顶层 52→53 +teamai）、治理规则 90→95（failures 4 + hack-knowledge-index 1）、运维脚本 77→74、组件台账 37→42 行、底座三件套全换装（swarm-yuan v2.46.0→v2.98.2、hermes v0.21.0→v0.22.5、studio 上游 0.7.18→v1.0.9）。
- **落点对账（正本 12 处 patch）**：头部版本与责任行（复测日注）、§0.1 规模句、§2.0 表 4 行（看板/skill/治理规则/运维脚本）、§2.2 mermaid S5N/V2/V3 三节点、四维表 ②③行、§4.3 资产表 L1、§3.8 底座版本行、§4.3 治理节、§4.40 机制核心+落地表、附录 B 索引 +5 行与归档卷状态注。
- **验收**：旧值残留 grep（非漂移线 807/52 顶层/90 md/77 个/v0.21.0/v2.46.0/0.7.18 = 0）；章节序列 `grep -n '^## '` 不变；计数复核命令重跑三值一致（889/95/74）；快照对账 `diff scratch/hermes-complete-design-doc-pre-1102sync.md 正本` 逐 hunk 均属计划面。
- **状态**：done（2026-11-02）。**挂账三项**：① hermes 侧 RSI P0（improvement-plan-hermes.md P0-1 分级授权 report-only / P0-2 δ 噪声标定 / P0-3 奖励作弊探针 2 条）未执行；② 归档卷旧 22 条正文待从 git 历史恢复；③ AIStudio 仓 vendor/hermes-agent 工作区存在大量未提交 M 文件（v1.0.9 升级批的注入态），属仓侧工程待其自查收口。

## gap-20261102-codescan-artex：CodeScan-Artex 二开增量 12 项裁决与落地

- **来源**：微信文《二开 artex 的代码审计平台》→ 回源 github.com/Ernket/CodeScan-Artex README（16,239 字符全文通读，AGPL-3.0）。同源接续：原仓 ARTEX 已于 10-13 经 T1-T4 调研 + R2 8 项 staged 技能，本次只裁二开增量。存档 `~/.hermes/shared/research/wechat-article-20261102-hermes-teams/`（FUSION-VERDICT-20261102.md）。
- **裁决**：12 项 = 吸收 4（A3 被测源码只读红线 / A4 接口权限六档判定 / A5 依赖按需反编译三步 / A6 可达性三步判定）+ 收缩吸收 3（A1 三层防线兜底黑名单 / A2 写入侧优先级拦截 / A7 独立会话复核三态——均并入既有容器防双事实源）+ 等效印证 4 + 不吸收 1（多租户，无语境）。最高价值观察：T4 判原仓治理「全偏松」为反面教材，二开版恰是其系统性修复样本——「同项目前后两版治理对照」成为可复用评估框架（五问：授权门在不在/命令面收没收/规则可不可删/默认开还是关/分析对象可不可写）。
- **落地与验收（2026-11-02 全过）**：pentest-methodology-fusion v2.0.0→v2.1.0 新增 §12（grep `接口权限六档`/`类名索引`/`可达性三步`/`CodeScan-Artex` 命中）；fp-check §6 增补复核三态映射（grep `主动证伪优先` 命中）；evidence-governed-execution §2 增补三层防线（grep `配置也绕不过` 命中）；tech-components-ledger 追加 CodeScan-Artex 行（grep=1）。
- **状态**：done；效力待首次实战（下一次 hack-auditor 代码审计任务实测）。AGPL 边界：只吸收机制模式，禁 vendor 正文。

## gap-20261101-rtx5090-intel：RTX5090 停产传闻回源核验（不吸收）

- **来源**：微信转述文《RTX5090 紧急停产…》→ 一级源核验（SEC EDGAR、13F、TechPowerUp、Tom's Hardware）。存档 `~/.hermes/shared/research/20261101-rtx5090-ai-bubble/REPORT.md`。
- **裁决**：全文为 GPU 产能与宏观金融叙事，零安全技术内容——不构成 hack teams 能力改进素材，不吸收。两处如实修正：Burry 9.65 亿是 puts 名义规模非成本（实际 ~920 万美元）；微信文反而低估了 MLID 的 EOL 覆盖面（全系非仅 5090）。
- **唯一操作性关联（薄）**：5090 是 hashcat GPU 破解旗舰，GB202 转产数据中心 + 2027-01 EOL → hack-exploit 若规划本地破解 rig，采购窗口收窄——登记为预算/采购风险提示，非能力改进。
- **状态**：closed-不吸收（2026-11-01）。

## gap-20261101-hack-teams-fusion：hack 团队三源融合（sapper-v2 / awesome-RE / reverse-skill）

- **来源**：三篇微信文 + 三仓库 README 回源（sapper-v2 腾讯云攻防赛冠军 80.18 分；awesome-reverse-engineered 17,728 项目索引；reverse-skill 37k star 路由包 44 规则/175 回归 case）。共享 context 档案 `~/.hermes/shared/research/hack-teams-fusion-20261101/FUSION-DOSSIER.md`（三源全文通读 + gap 矩阵 grep 实证）。
- **吸收（hack-team 类目 +10 技能，2026-11-01 落地）**：knowledge-base（S1 事实图分层纪律+写回触发+同族迁移，原裸目录升格）/ skill-resolver（S3 routing 单一事实源方法论）/ firmware-pentest（OWASP FSTM）/ patch-diff-exploit / ctf-orchestration / js-api-reverse / reverse-ecosystem-index（S2 先搜再做三步+健康度四档）/ pentest-methodology-fusion 升级（ARTEX 实战三条：凭证写 goal 不写 constraint、MCP 补路由、凭证生命周期）/ fp-check / evidence-governed-execution。
- **关键机制入册**：升级规则查表（0-10min 战术→10-20min 加 worker→20-30min 派将军→30-45min 止损，「决策从推理变查表」同 flag 省 4.4× token）；文档三层注入（标签/一句话/完整打法按需自取，「省注入不省存储」）；taggant 提案与 marking-rules 交叉登记待社区成熟。
- **验收**：`find -L ~/.hermes/skills/hack-team -name SKILL.md -newermt 2026-10-31 | wc -l` = 10。
- **状态**：done（2026-11-01）。效力待实战。

## gap-20261031-rsi-survey：RSI/AI4AI 前沿增量调研与两侧方案

- **来源**：12 综述+技术栈增量调研（AIDE²、Anthropic 2026 新证据）。存档 `~/.hermes/shared/research/rsi-survey-20261031/`（survey-rsi-reviews.md + improvement-plan-hermes.md）。
- **一句话**：把既有 RSI 主干（evo 夜环 + RRSI 正则 + 四达标闸）从「提案-人审」升级为「按验证信号档位分级授权」——机械可验走自动通道（先 report-only），真值缺失走异构评审，治理月报量化。
- **两侧执行状态（2026-11-02 核）**：AIStudio 仓侧 R1-R12 四批已全落地（探针双修复/pass@k 背离告警/加权检索/验证信号分级/CHASE 变换器/heldout 准入门/gap 桥/任务族聚合/SQLite 持久化/反事实自动编排，commit 511f62cf0…3806e0615 等，全量 7153/0）；**hermes 集群侧 P0 三项未执行**（P0-1 evo 分级路由 report-only / P0-2 δ 噪声带标定 / P0-3 奖励作弊探针 2 条——`~/.hermes/evo/evo_nightly.py` 与 `~/.hermes/evals/` 窗口内零改动为证），挂账待派。
- **台账联动**：本调研吸收带动组件台账 37→41 行（2026-11-02 核 42 行含 CodeScan）。
- **状态**：调研 done；hermes 侧落地 open（挂账）。
