---
name: orchestrator-lessons
description: "Orchestrator 实战教训：崩溃恢复/教条审查/patch 生命周期/fleet 传播纪律。"
version: 1.3.0
metadata:
  hermes:
    tags: [orchestrator, crash-recovery, dogma-audit, patch-persistence, fleet-propagation]
    related_skills: [kanban-orchestrator, kanban-crash-recovery, fusion-governance-patterns, soul-framework-propagation]
---

# Orchestrator 实战教训（本会话沉淀）

> 只记**在本会话里踩坑并修正后验证过**的规则。通用知识在各母本 skill 里，此处只存 orchestrator 亲历的实测修正。

## 一、崩溃恢复：先验证磁盘再写恢复包

**坑**：worker 在收尾前崩溃（卡 90% 完）。我差点写恢复包重派，实际磁盘产物已全在、质量合格。

**规则**：
1. 恢复包前**必先 grep 磁盘**：任务关键锚点是否真实存在（grep 目标文件/关键词/行号）
2. 若完整且满足 frozen 验收 → 直接 orchestrator complete，跳过重派
3. 若部分 → 恢复包只列缺失项，不重做
4. 若环境级失败（worktree locked / git timeout） → 先修环境，再注入恢复包说明“根因已修，勿重复诊断”

**验证**：本会话 t_4eb5ebc3 worker 重派前三次失败，run 273 实际已干完 90% 并落盘，最终 orchestrator 独立验收通过后直接 complete，零重派成本。

## 二、教条审查：先二分再处置

**坑**：发现“无消费方”即想剪裁，结果把“先于使用存在”的方法层资产（四问/透镜/偏差清单）差点误删。

**二分判据**：
- **假声称**（文档/版本记录与实况不符）→ 立即改声称，不需裁决——唯一不可容忍项
- **无消费方的契约层设备** → 移档案（带来源头+复查条件+指路行），检查上游脚本断链
- **先于使用存在的方法层资产** → 保留，标注状态/Exercised 判据；设观察期（30 天零调用且零产物影响→归档），**不因无留痕即删**

**三通道验证**：
- A 结构化（铸进格式与门，产物天然携带证据）
- B 决策界面（按需加载，抽查产物质量，**不查 comment 仪式**）——四问/透镜/偏差清单走此通道
- C 仪式化（强制 comment+执行率统计）**仅限有实测失败基线且复发频繁**；无基线不新建（Goodhart 诱饵）

## 三、patch 生命周期：三件套 + 回放登记 + 行为验证先行

**本会话教训**：F-2 stamp patch 两次被 update 洗掉（20:28/20:46），根因：只存私有目录、未登记 apply-source-patches.sh 清单。

**完整链路**：
1. 源码改动标记区块 `# >>> swarm:feature >>>` 成对
2. git diff 生成标准 patch（untracked 先 `git add -N`）
3. **行为验证先行**：先写样例集跑修复后逻辑，再生成 patch
4. 复制到 `~/.hermes/patches/hermes-<feature>.patch`
5. **登记进 `~/.hermes/patches/apply-source-patches.sh` 的 SPECS 清单**
6. 幂等实测：跑 apply 脚本 → 输出 PRESENT skip（rc=0），不能假定登记即生效

**验证**：update 41844 连跑两轮，apply 重放两次恢复，rc=0，机制闭环。

## 四、fleet 传播：单一事实源 charter + 三通道应用

**坑**：先在 47 个 SOUL 全文写四问，再发现 charter 变版要改 47 处。

**修正**：
- charter (`_shared/02-org-orchestration/four-lenses-charter.md`) 做单一事实源
- SOUL 只挂一行引用（`four-lenses-charter.md` 字符串 grep 命中即达标）
- 方法层资产走 B 通道（决策界面），**不造 comment 仪式**
- charter 本身已加《应用通道三分法》与《反 Goodhart》声明

**验证**：t_e7a7462e 批量写入 46 文件，grep 逐字节一致，47/47 全挂接；后续 charter 修订（v1→v2 融合重写），SOUL 零改动自动生效。

## 五、进度汇报：只报三点，禁事务清单

用户风格：选项编号裁决、费曼标准、批判性分析。

**汇报模板**：
1. 资源效率 — 吞吐/复用率/释放产能
2. 系统风险 — risk-register Top3 + 红黄绿灯
3. 能力沉淀 — 新增 skill/对策库/经验入库

**禁止**：逐步骤流水账、自述完成率、未经验收的预测。

## 六、路由建卡：triage/running/created_cards/board 三个判定边界

**坑 1：误用 triage=True**。重型任务路由时机执行 `kanban_create(triage=True)`，但 body 已完整写完，卡进了 triage 无人拾取。根因：`triage=True` 是给 specifier 补 body 用的；body 完整时应直接 `initial_status='running'`。

**坑 2：kanban_complete 传 created_cards=[自己的 id]**。路由卡 complete 时把当前卡的 task_id 塞进 `created_cards`，被 phantom_cards 校验拒绝。根因：`created_cards` 只验证“本 worker 在同 run 创建的子卡”，路由卡自身不算。

**坑 3：kanban_comment 漏 board 参数**。在非默认板（aiteam）上 comment 时漏 `board='aiteam'`，报 "unknown task"。根因：`board` 参数不是可选的，所有 kanban_* 调用都必须显式传。

**坑 4：CLI 收卡 `--board` 旗标位置错**。`hermes kanban complete --force t_xxx --board swarm` 报 unrecognized arguments；去掉 `--board` 重试又报 unknown id or terminal state——实际卡在 swarm 板，命令静默查了 default 板。根因：`--board` 是 kanban 子命令级旗标，必须放在子命令之前：`hermes kanban --board <slug> complete --force <id>`。

**坑 5：自持卡被 complete 工具的 live-claim guard 误拒**。即建即干的卡 claim_lock=本会话自身 gateway 地址，kanban_complete 工具仍报 running under a live worker claim——工具参数不带 expected_run_id，也没有别的 run 可等，重试工具纯浪费轮次。正解=operator override 走 CLI：`hermes kanban --board <slug> complete --force <id> --summary "..." --metadata '{...}'`，收完 sqlite 验终态 done 才算闭合（收尾契约=complete 被拒不放弃，换路径收口）。

**坑 6：工具层 kanban_create 报 raci 注入类错误**。create 调用被工具层 raci 注入步骤报错拒绝时，同参重试工具纯烧轮次（错在注入步骤不在参数）。正解=body 先 write_file 落盘，走官方 CLI 建卡：`hermes kanban --board <slug> create --body-file <body.md> ...`（assignee/title 等其余旗标同常规用法），建后 `hermes kanban --board <slug> show <id>` 验卡在位。与坑 5 同一模式：工具层被守门/注入步骤卡死时，官方 CLI 是平级替代写路径——先换路径保交付，再回查工具层根因。

**规则**：
1. body 已完整 → `initial_status='running'`（不要 triage=True）；body 确实需补充 → triage=True + 指派 specifier
2. 路由卡 complete 时 **不要传 created_cards**，或传空列表；只有 fan-out 出子卡时才列子卡 id
3. 所有 kanban_* 调用必须显式传 `board=<board_slug>`，即使在非默认板上操作也要传——静默默认到 root DB 会造成 "task not found" 假象
4. triage 卡想直接推进 → kanban_unblock/complete 均被拒，且 **dispatcher 永不拾取 triage 栏**（comment 留痕不会让它动）。正解=write_file 落盘脚本走 sanctioned API `kb.specify_triage_task(conn, tid, author="orchestrator")`（triage→ready；bare sqlite UPDATE 会被 guard trigger 在 prepare 阶段拒），随后验证 status=running+worker_pid 才算恢复。**排查进度发现 triage 停滞后必须当轮 promote+验证+comment 留根因，不得只报告「等 dispatcher 拾取」**——用户问进度的隐含期待是恢复，不是转述状态

5. **triage/路由壳卡禁挂成 worker 卡的父依赖**。壳卡不进 dispatcher 正常生命周期（永不自然 done），挂它当 `parents=[...]` 会把实现/研究子卡永久锁在 todo/ready-gated——症状是子卡 ready 但 dispatch 空转不 spawn。建卡纪律：gate 实现卡的父只挂会自然 done 的普通 worker 卡（如研究卡）；壳卡/锚点卡的 id 只写进子卡 body 引用，不建链。发现误挂当轮修复：官方 CLI `hermes kanban --board <slug> unlink <parent> <child>`（child 立即转 ready）→ `dispatch --max 1` 拉起 → SQLite 验证 running+worker_pid。同一任务书建出重复卡（同 assignee 同交付物）→ `kanban_comment` 留痕 + `hermes kanban --board <slug> archive <id>` 归档（archive 直接跟卡 id，不支持 `--json`），勿重跑

**验证**：本会话 t_9707f12e 三次操作（complete 带 created_cards、unblock triage 卡、comment 漏 board）全部失败，修正后第四次成功。

## 七、工程验收：机械重测不沿用旧值

- 设计文档数字一律重测（find/sqlite/ls/skills list），grep 旧值扫残留
- archive 新文件计入全量计数 → 规模表同步（46→47 扩展资产）
- cq 脚本修复判据：**实跑 rc=0 并贴输出摘要**，不以“改完”为准
- sqlite DELETE 前先 `.backup` 快照，只删夹具行，真实数据禁动
- 双库（_shared + workspace）分别 commit，hash 写进 metadata

## 七、风险登记：update 期间的竞态

- `hermes update` 正在跑时**绝不并发修改源码树**（等 update 结束后再核验+重放）
- update 结束后必跑 `bash ~/.hermes/patches/apply-source-patches.sh` 验证所有 patch 重放
- watchdog 心跳自动跑 apply（幂等 PRESENT skip），不需人工记忆
- **update / npm ci 类长任务必须后台跑（terminal background=true + notify），禁前台长 timeout 干等**——前台调用超时后运行器 SIGTERM 整个进程组，update 内部的 npm ci 中途死，留下 node_modules 半成品，下次构建报 missing，极易误判为 lockfile 缺口而重跑无效。诊断特征：错误日志里的 `signal SIGTERM` 行——见到它先归因「进程被杀」再怀疑依赖清单

## 八、ready 卡堆积：官方 CLI 手动分派 + 验证 running

**坑**：发现 ready 卡长期不被消费、launchd 无独立 dispatcher 进程时，不能干等，也不能裸 SQL UPDATE。

**规则**：
1. `hermes kanban --board <slug> dispatch --dry-run --json` 先确认本次会 spawn 哪些 ready 卡
2. `hermes kanban --board <slug> dispatch --max 1 --json` 真分派
3. SQLite 只读验证 `status='running'` 且 `worker_pid` 非空——**仅 spawn 声称成功 ≠ 真跑起来**；停留 ready 无 pid = dispatcher 侧未接住，转查 gateway 服务
4. 父卡仍 triage/blocked 时子卡被父依赖 gate 住，强制分派只起链头卡

**验证**：t_5545eb0d 研究卡先 dry-run 确认、`--max 1` 拉起，SQLite 验证 running + worker_pid。

## 九、已知反模式（本会话修正）

| 反模式 | 修正 |
|---|---|
| body 完整却用 triage=True 建卡 | 直接 `initial_status='running'`；triage 仅当需 specifier 补 body |
| 路由卡 complete 传 created_cards=[自身 id] | 省略 created_cards 或传空列表；仅 fan-out 子卡才列 id |
| 非默认板 kanban 调用漏 board 参数 | 所有 kanban_* 显式传 `board=<slug>`，否则静默默认 root DB |
| CLI kanban 命令把 --board 放在子命令后 | `--board` 是子命令级旗标：`hermes kanban --board <slug> <subcmd> ...`；放后面=unrecognized，去掉=查错板报 unknown id |
| 自持卡 complete 工具被 live-claim 拒后继续重试工具 | claim_lock=本会话 gateway 时无 run 可等，直接 CLI `hermes kanban --board <slug> complete --force` 收，sqlite 验 done |
| 工具层 kanban_create 报 raci 注入错误后原地重试 | body 落盘走 CLI `create --body-file`，建后 show 验 id（见六·坑 6） |
| 发现无消费方即想剪裁 | 先二分：假声称改声称；先于使用存在=保留+观察期 |
| 批量写 SOUL 全文而非挂 charter 引用 | 单一事实源 charter，SOUL 只挂一行引用 |
| patch 只存私有目录不登记回放清单 | 标准位 + SPECS 清单 + 幂等实测 |
| 发现 worker 崩溃即写恢复包 | 先验证磁盘，完整即直接 complete |
| 设计文档数字沿用旧值 | 机械重测，grep 旧值扫残留 |
| 为“可验证”给所有知识加 comment 仪式 | 无失败基线不新建仪式（Goodhart 诱饵） |
| 处置意见先于二分 | 先分类（假声称 vs 先于使用），再选动作 |
| ready 卡堆积干等或裸 SQL 改状态 | 官方 CLI `dispatch --max 1`，验 running+pid（见第八节与 references/kanban-dispatch-manual-fix.md） |
| triage 壳卡挂成 worker 卡 parent | 父只挂会自然 done 的普通卡；误挂即 `kanban --board <slug> unlink <parent> <child>` 解链再 `dispatch --max 1` |
| 同一任务书重复建研究卡 | 保留在跑那张，另一张 comment 留痕 + `archive <id>` 归档，勿重跑 |
| grep 到调用链指向旧脚本/旧路径即宣布断链 | 先跑一次调用链验证运行时实际打开的文件（cd/os.chdir 会让同一相对路径解析到不同文件）；静态指向只是待验证假设，运行时事实为准 |
| 用户说「所有/不要漏」时只盘子集台账 | 按全量口径开工（全单元面+全欠账面），子集只能是全量的报告切片——方向错跑满一轮再重跑=白烧预算 |
| 运行中 worker 短暂无新产物即干预或接管 | 先过三信号（进程 CPU/产物 mtime/日志尾部），任一为真=在推进勿动；steer 只走卡 body 下发侦察事实 |

## 十、patch/write 多字节损坏：脚本内容 ASCII 化

- **往脚本文件（.sh 为主）写中文注释或中文字符串前先想一遍**：patch/write 管线对多字节内容有低频首字节损坏——实证两种形态：行首 `#` 变 `|`（bash -n 可能不报错但语义已变）、字符串中段断字节（`set -u` 下炸 unbound variable）。脚本内 echo/注释一律 ASCII，中文说明放 commit message 或外部文档。
- **patch 报成功 ≠ 内容无损**：写后必跑 `bash -n` + 回读刚编辑的行段（sed -n 抽样行首），发现损坏当场修，勿等运行时炸。回读要含结构校验：列表/表格混排区（SOUL 红线节类）patch 时前缀写错会把 `- ` 列表行变 `| ` 表格行并残留行尾 ` |`，改后 grep 该节行首前缀当场抓出。

## 十一、launchd kickstart 验证时序

- **kickstart 后先等再读日志**：首跑若含当日外部 API 调用（冷缓存 6-10s），立刻 tail 日志会误判「服务没跑」。`launchctl kickstart -p gui/501/<label>` 返回 PID 即确认 spawn；退出码用 `launchctl print` 的 `last exit code` 验。
- 手动直跑入口脚本与 kickstart 各验一次：手动验业务逻辑，kickstart 验 launchd 装配（stdout 重定向、WorkingDirectory 等只有真实 launchd 环境才暴露）。

## 十二、运行中 worker 的进度判读与 steer 通道

- **停滞 ≠ 失败，先过三信号再决定干预**：① worker 进程 CPU 时间持续增长（`ps -o pid,etime,time -p <pid>` 隔几分钟对比）；② workspace 产物 mtime 在推进（evidence/reports 出现新文件或时间戳变新）；③ 会话日志尾部在产出新工具调用。任一为真=仍在推进，勿干预勿接管；全部为假才走崩溃恢复流程（见第一节）。
- **运行中 kanban worker 的唯一 steer 信道=卡 body**：delegate steer 对 dispatcher 拉起的 worker 无效（不在本会话子代理树）。orchestrator 亲测的侦察结论（哪个入口可达、哪些是死路）写进卡 body 高优先级段，worker 下次读卡即见，一轮 steer 即可让它掉头。命令级细节（CLI edit 多行 body 的 subprocess 传参、防覆盖拼接、落库验证）见 skill `security-domain-delegation` Pitfalls「steer 子代理」条。
- **steer 下发侦察事实，不接管执行**：把「实测哪个入口 200、哪个是死路」喂给 worker 让它自己走，不替 worker 执行下载/分析——接管使验收主体错位且烧双份预算。
- **前台 sleep 轮询 >180s 必显式 `timeout=`**：terminal 前台默认 180s 即杀（exit 124），`sleep 300` 这类等待直接超时；要么 timeout 设大于等待值，要么缩短单次 sleep 拆多轮。

---

**一句话**：orchestrator 只管路由、分解、验收、传播；不亲自干活；不编造状态；一切以磁盘/机械实测为准。