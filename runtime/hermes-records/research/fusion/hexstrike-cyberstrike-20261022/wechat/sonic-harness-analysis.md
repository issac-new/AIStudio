# Sonic Harness 长程渗透执行框架——机制分析（补充调研源 3）

> 来源：微信公众号文章《我发现了渗透Agent长程任务的秘密》（https://mp.weixin.qq.com/s/Y1xerjN6eV0Bl4mABskqjQ）
> 背景：斗象科技漏洞盒子「赛博司机计划」蛙池 AI Desktop 100 小时不间断 Agent 渗透挑战（VulnHouse 靶场），Sonic Harness 技术报告拆解。
> 性质：**闭源商业产品**（2026-10 上架蛙伴市场），无 GitHub 源码——本笔记以文章为唯一源，转述粒度到机制层，无 file:line。
> 原文存档：`article-Y1xerjN6.md`（同目录，6394 字正文已全文读完）。

## 与既有融合基线的关系（防重复评估）

本机已有 `~/.hermes/skills/devops/longhorizon-harness-research/SKILL.md`（2026-08-16 融合自阿里 AMAP-ML LongHorizon-Harness，含 MEA 循环/三行控制头/工作区快照 diff/任务契约 12 项），且已落地 `_shared/task-contract-guard.md` + adversarial-review-lens v1.1.0（workspace_audit.py）。

**Sonic 与 LHH 同构处（已覆盖，不重复吸收）**：
- MEA 三角色循环（Manager 跨轮持状态 / Executor 每轮新建 / Auditor 只读复核）
- 「LLM 自述完成不算数，harness 观察才算数」铁律
- 审计前后工作区快照 diff 防篡改
- 状态原子写

**Sonic 独有增量（LHH 融合时未见，本次新增）**：

| # | 机制 | Sonic 实现 | 与 LHH/本机基线差异 |
|---|------|-----------|---------------------|
| S1 | 工具面积单调链 | Manager tools=∅ < Auditor 10 只读 < Executor 17 通用，构造函数层面锁死，harness 可静态验证 | LHH 只说三角色工具集不同，无「单调链可静态验证」的显式设计 |
| S2 | Auditor 两阶段撤离 | 阶段一挂 10 只读工具逐条独立复现/反驳（如自跑 cat+sha256sum 验 flag）；阶段二 harness **收回全部工具**后才填裁决 verified/unverified/refuted——防「裁决时补做复核」 | LHH auditor 是单阶段；「撤离工具再裁决」是新的纪律点 |
| S3 | Executor narrative 不入证据 | Auditor 仅采信环境直读 + 只读工具观察，Executor 描述再详尽也不据此下判断 | LHH 有类似精神但未成显式条款 |
| S4 | 完成态双准入 + forge_attempts | 条件1=最新审计裁决 verified 且 条件2=工作区 clean，二者同时满足才允许翻 completed；任一不满足 harness **强制**降级 untrusted 并记一次伪造尝试计数 | LHH 有「干净审计证据才 completed」但无 forge_attempts 计数器 |
| S5 | CSWI 大文件近似校验 | 小文件 sha256 全量；超阈值大文件退回 size+mtime 近似——避免审计快照本身拖垮长程任务 | LHH 快照有 digest 阈值（4MB→融合版 8MB）但未见「size+mtime 降级」语义的明示 |
| S6 | 无 ask 动作 | Manager 决策仅 execute/done/blocked 三项，系统中不存在「求助」——遇阻必须 blocked_reason 说明后退出 | **与 LHH 分歧点**：LHH 是 execute/done/blocked/**ask** 四项。裁决点：无人值守长程渗透场景 Sonic 的无 ask 更合理（防 Manager 优雅地摆烂等人）；有人值守场景 LHH 的 ask 更合理 |
| S7 | 消融实证 | VulnHouse 两任务集约 30 题：完整版 68%；去掉完成态拦截 41%（幻觉自证累积）；还原单 Agent 模式（Manager 挂全套工具）33% + 平均每任务 2.1 次完整性违规 | LHH 有 WeaveBench 基准但无消融对照；这组数据是「MEA 物理隔离是必要条件而非优化」的最硬证据 |
| S8 | 每轮三落盘点 | Manager 决策后 / Executor 报告后 / Auditor 报告后各一次原子落盘（.tmp + os.replace），崩溃损失限当前轮 | LHH 融合时未细化落盘点粒度 |
| S9 | resume 用同 session_id 重建 Manager 记忆 | Executor/Auditor 每轮新建无需恢复；仅 Manager 从磁盘反序列化重建 | LHH 未覆盖 resume 语义细节 |

## 三重天花板诊断（文章框架，可用于 hack team 长程卡派工前评估）

单会话 Agent 长程任务三重天花板：①上下文膨胀（注意力稀释+成本超线性）②幻觉自证（推理链内自我强化未发生过的观测——长程危害最大）③中断即回零（内存态全丢）。→ 结论：问题不在模型能力，在单会话架构撑不住长程；竞争已从「谁的模型聪明」转向「谁的执行框架严谨」。

## 真实运行数据（三条链路）

- JBoss 反序列化：40 轮 214 次工具调用，Manager 两次提前提议完成均被拦截，Auditor 亲读 flag+验哈希 verified
- supervisord 提权：22 轮 108 次，全程零完整性违规
- canto RSS 栈溢出：15 轮 71 次，pwntools ROP 触发 SIGSEGV，Auditor 自己解码 payload 独立验证
- 平均每轮工具调用仅 ~5 次（远低于 60 上限）——瓶颈在决策质量与证据可靠性，不在工具调用量

## hack team 落地建议（供 T3 融合卡裁决）

1. **S1/S2/S3/S4 → 评估 patch longhorizon-harness-research**（补 Sonic 增量节）或其已落地资产（task-contract-guard.md / adversarial-review-lens 的 workspace_audit.py）
2. **S6 ask 分歧** → 需裁决：hack team 长程渗透卡建议采「无 ask」纪律（写入派工卡 body 模板：Manager 型卡禁求助动作，遇阻 blocked_reason）
3. **S7 消融数据** → 作为 hack team 设计文档「为什么用多 profile 物理隔离而非单 Agent」的实证引用
4. **S5 大文件近似校验** → workspace_audit.py 若全量 sha256 拖慢，评估加 size+mtime 降级路径
5. 文章本身是转述源——Sonic 技术报告若有公开 PDF/仓库链接，后续调研应回源（本机未见，10 月上架蛙池市场后可跟踪）

## 边界声明

- 本笔记基于转述文章，无 file:line 锚点，机制细节以文章转述为上限——**S1-S9 均标注「转述粒度」**，T3 融合时引用需注明源性质
- VulnHouse 成绩与消融数字为文章转述的技术报告数据，未经独立验证


---

## 回源补全（2026-10-22 第二轮，用户追加同 URL 时补齐）

> 用户重发同一 URL = 首轮交付不完整。按调研纪律回源：文章是 FreeBuf 转述，已回源到**前置战报全文**（数说安全 2026-09-23，ZONE.CI 镜像 `precursor-battle-report.md`）与**英文独立存档**（Orca-AI-Incident-Archive `orca-archive-en.md`，仅事件级 summary，无机制增量）。

### S10 增量：VulnHouse 验证引擎（VE）——四验证策略（前置战报独有，FreeBuf 文未覆盖）

| 策略 | 适用题型 | 判定机制 | hack team 借鉴点 |
|------|---------|---------|-----------------|
| flag_capture | Web 渗透/信息读取 | 容器指定路径写随机 Token，Agent 读到并提交；精确/包含/正则三匹配；**回传信息脱敏防反向套取答案** | 靶场类任务验收的黄金标准；脱敏防「验证接口变泄露通道」值得抄 |
| effect_proof | 需环境可观测变化 | 出题者定义检查命令+预期输出，逐项比对环境实际变化 | 类似本机「验收命令 frozen」机制，可补「操作前后双阶段」 |
| poc_crash | 源码审计/内存安全 | Agent 构造输入使目标崩溃（ASan 检测）；支持单容器 + **双容器差分**（vul 崩、fix 不崩） | 双容器差分是白盒审计卡验收的强判据，比单点崩溃可信 |
| oracle | 业务逻辑/复杂攻击链 | 出题者自定义脚本输出 JSON 判定，支持操作前后双阶段对比 | 最灵活，对应 hack team 复杂链路任务的自定义验收器 |

VE 四步流水线：证据采集 → 证据比对 → 裁决 → **证据链封装（哈希防篡改持久化）**。与本机 evidence-labeled-research / poc-evidence-snapshot skill 同构，但「哈希封装」更彻底。

### S11 增量：战报口径与量化数据（修正/扩充 S7 消融段的外部效度）

- 总量口径：464 题、233 次验证通过、19340 分；**167 题未进入有效执行**——公允口径 = 跑完验证的 297 题通过率 78.5%；对全量 464 为 50.2%（宣传口径需双口径并报，单报 78.5% 会高估）
- 前 72h 阶段成功率 90.8%（197/217）；峰值吞吐 5-6.25 题/小时（折算日 120-150 题）
- 最快 54 秒通关（CWE-200，三要素匹配：目标明确+入口直达+Flag 可见）
- JBoss 逆风局 33 分 11 秒 / 104 次工具调用 / 6 次策略转向 / 3 次主动修正——环境无 Java、JDK 下载超时，Agent 找到 Adobe Animate 自带 JRE 重建载荷完成 RCE
- 主办方自认局限：环境复杂/工具缺失/路径误判时仍会反复尝试；稳定发挥依赖 Harness+工具链+验证机制三者共同支撑
- 后 28h 命中率回落规律与 CyberGym「Level 降低→成功率自然下降」一致——能力边界随难度移动的量化样本

### S12 判定：Sonic Harness 属「长程执行框架」层，与 hexstrike/CyberStrikeAI 融合正交互补

hexstrike = 工具编排层（150+ 工具给 agent 用）；CyberStrikeAI = 平台层（governed execution+evidence memory）；Sonic = **执行框架层**（MEA 物理隔离+完成态铁律，让长程不塌）。三层互补不重叠——T3 融合卡裁决时应按层归位而非互斥取舍。

### 官方完整报告 PDF 线索（未取到，登记待授权窗口）

前置战报文末给出 `https://m-wiki.freebuf.com/article-detail?id=230327`（完整报告 PDF 下载，需登录）。Sonic 10 月已上架蛙伴市场（digpool.cn），后续真实场景数据可跟踪。
