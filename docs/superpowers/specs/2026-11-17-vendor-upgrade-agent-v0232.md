# 2026-11-17 vendor 升级批：hermes-agent v0.23.1 → v0.23.2

> 上游身份：v0.23.1 = `3b4215785` → v0.23.2 = `ae2a81ccc`（上游 2026-11-16 发布），8154 提交 / 5211 文件 / +239,733 −22,788（史上最大单版差量，超 0.23.1 轮的 2781 文件；主题=plugin-catalog/catalog 双 scope 1809 提交＋gateway 575＋approval 213＋telegram 164＋redact 111＋desktop 100＋cron 88）。探查证据：agent 面 115 补丁中 **77 枚目标文件与上游变更有交集**（本 spec 附前清单），实际失配数以净基线重放实测为准（含级联假阳性归因，v0231 批方法论）。

## 变更

1. **vendor/hermes-agent 基线换血**：vendor-sync 显式通道整树替换（worktree `feat/vendor-agent-v0232` 内执行），upstream/hermes-agent 缓存树同批 checkout 至 v0.23.2（pristine 规则）。`.gitignore` 误伤面（export* / electron `*.d.ts` 等）按 2026-11-02 复核批立规同规则 `git add -f` 补录。
2. **agent 面 99 枚补丁新基线落位：17 枚手解（16 重锚＋1 API 适配）＋82 枚 direct，零退役**（探查预判 77 枚交集，实际根失败 16 枚——lane 级 block 掩盖了后续真失配，逐失败迭代暴露）：118（上游 `_bootstrap_profile_dir` 加 `seed_model` 参数＋**顺带清除历史死引用段**——`from hermes_cli.setup_profile import release_setup_copy` 的模块在三棵树均不存在，带源克隆必 ImportError 的存量雷）、391（`_profile_exists_fn` docstring 措辞漂移）、400（上游拆分 instructions/source_material 致尾 hunk 锚漂，4 hunk 过 1 hunk 手解）、410（上游 `_run_batch` 加 detached_only/begin_delegation_run 致尾行 hunk 重锚）、450（`_JOB_ARG_FIELDS` 尾加 wrap_response）、593（cache key 加 `hosted_scope() is not None` 维度）、599（finally 后上游插 fence/lead 两段）、602（`_hmwa_compression_exhaustion_reset` 加 `event=event` 参数）、603（602 后形态级联，A/B 差分重生成）、612（`_persisted` 后上游新增 hosted persist 通道）、732（仅 import hunk 重锚——`_startup_fast` import 插入；其余 5 hunk 原样，run15 首版误丢 5 hunk 致 741 级联，从 git HEAD 取原版补全）、741（双 import 重锚＋`_handle_create` 上游改 `_redact` 形态＋connect 的 `logging` import 链内回归）、753（上游 max-turns help 措辞 500→unlimited）、772（`_build_children` 上游加 `rebuild` 形参＋strict_output_schema 文档 hunk，3 reject 手补）、786（`_POST_RECONNECT_WATCHERS` 上游加 `_delegation_auto_resume_watcher`）、788/789（786 重锚形态的级联尾上下文）、533（**上游 API 适配**：v0.23.2 移除 `_running_agents_ts` legacy 垫片（8→4），自带测试 ts.pop 行 AttributeError——主检出 v0.23.1 同测 5/5 绿定谳为上游演进非越域；`_running_agents` 垫片保留且为 live view，pop 即清底层，测试段删冗余 ts.pop 行＋注释，runtime 测试镜像同步）。终局 clean+inject 全量 **491/491 applied 零失败**（agent 99/studio 386/zcode 6）。

   **本轮三坑定谳（入台账防复发）**：①`git diff --no-index` 切片再生补丁时 `+++` 行残留全路径（`+++ b/vendor/hermes-agent/...`），git apply 按 rename 语义执行=原位删除＋`vendor/hermes-agent/vendor/hermes-agent/` 嵌套新建（612/772/786 三枚中招；修复=统一 `+++ b/` 相对路径＋git clean 清嵌套残骸；L1 禁 `rm -rf` 改道 git 通道）；②补丁序文件末行无换行符致 `while read` 静默漏末补丁（788「消失」假象 30 分钟排查）；③前缀链诊断须 `|| echo FAIL` 全量可见——`| head -2` 截断＋stderr 吞掉会让链断在中途零信号。
3. **runtime 面本批零变更（rebase 后终局裁决 D9）**：原拟 20 件从新注入态重镜像（run23 后已执行，对账 56/0/6＋py_compile 过），rebase 时与 main 侧 091f8f97e「宿主良好态回灌 19 件」相遇——回灌含**无补丁承载的宿主热修**（kanban_db.py 的 expect_assignee CAS 参数族等，grep patches 零命中），强行镜像=覆盖丢热修。按仓规 10「不丢宿主良好态」立法精神，本批 runtime 全部恢复 main 态（`git checkout main -- runtime/`），33 件注入态漂移挂账 N-4'，镜像责任随宿主升级批 N-1 一体处理（热修回灌 patches→镜像→部署三合一）。**方向坑（预演记录）**：deploy 影子树装的是 runtime 旧覆盖层而非新注入态，重镜像正源=vendor/hermes-agent 注入态，非影子树；影子树 kept 竞态会连锁炸 inject 部署预检（fail-closed 中止注入），配方=`node scripts/deploy-agent-runtime.mjs --apply --force` 先行刷新影子。
4. **载体链同批进位**（v0231 批八处口径）：`vendor/VENDOR.md`（表行＋dated 条目）、`AGENTS.md:29`（vendor 行版本，顺带清偿该行存量滞后 v0.8.20/3.17.2 → v0.8.21/3.18.2）、`README.md` 组件表版本行、`team/VERSION`（→`v0.23.2-team.1` 底座升级扩展序归 1）、`team/version.json`（version/base/upstreamCommit 四键）、`team/README.md`（Current＋What changed 新节＋v0.23.1-team.3 段归档）、`RELEASE-MANIFEST.json`（agent-teams.version＋vendorBaseline 描述）、`team/requirements.txt`（注释；range `>=0.22.4,<0.24` 已覆盖 0.23.2 不动）。
5. **投影面随批**：培训手册投影块经 `npm run docs:sync` 重写；`custom/__tests__/aistudio-complete-training-manual.test.ts:79` 版本断言数组 `v0.23.1-team.3` → `v0.23.2-team.1`（守门测试同步）。A.1 三处登记（附录索引＋机械索引行＋design 索引清单）随 spec 落地后生成。
6. **worktree 验证与宿主隔离**：worktree 内 clean+inject 全量重放＋幂等二连；inject 出口部署经 `RUNTIME_DEPLOY_MANIFEST` 重定向 host-sim 隔离（`~/.hermes/host-sim-v0232`）——**宿主真树 `~/.hermes/hermes-agent` 不动**（run31 推演在途＋宿主树属运行热修域，比 v0231 批 D5 更强的隔离理由；部署面挂账）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 升级目标=正式 tag v0.23.2，canary 流不追 | 仓规惯例（v0230/v0231 批同口径；`v0.23.2+canary.20261117T064624Z` 存在但不追） |
| D2 | 不做 /tmp 预演，直接 worktree 内迭代重放 | worktree 本身隔离等价于预演；失败清单即预演产物；77 交集补丁预期失配面大，迭代轮次记录进本 spec 验证段 |
| D3 | 失败补丁手解重生成，不走 3way 盲合 | v0227 批 D7 先例（silent semantic drift 风险）；先归因再动手解（v0231 批级联假阳性方法论） |
| D4 | 宿主部署面挂账不做 | run31 推演在途（2026-11-17 09:02 人工起跑），宿主树升级会打断运行中网关；v0231 批 D5 先例＋更强的在途理由；生效三层验收法：已合 main/已落运行树 两层本批做，宿主=待 run31 收官后独立批 |
| D5 | SIM 面盖章不随批做 | v0231 批 D7 先例；SIM 快照供给链吃宿主态，宿主升级未落地前重盖章无意义 |
| D6 | AGENTS.md:29 vendor 行顺带对齐存量滞后 | 该行现值 v0.8.20/3.17.2 已落后实际 v0.8.21/3.18.2；本批进位 hermes-agent 时一行顺带消除三树版本滞后，属版本声明行常规维护非越域 |
| D7 | merge 时带 `VENDOR_SYNC=1` 环境变量并抽验 merge 提交 vendor 面 diff 非零 | v0231 批实测 pre-commit 对 merge commit 也撤 vendor staged（a6c23d199 事故）；显式 env 传导给钩子是文档化通道，若仍被撤则按 v0231 清偿配方 main 上补普通提交 |
| D8 | 手册版本快照行（operations-reference:442 / training-and-user-guide:1044 / design-document-guide:183）随 RELEASE-MANIFEST 进位由 docs:sync 投影链处理，不手改 | 投影块单一事实源=RELEASE-MANIFEST；手改会造 121↔122 摇摆类双源（v0231 批实录） |

## 验证

- [x] upstream/hermes-agent 缓存树 checkout v0.23.2 后 status 干净（pristine，ae2a81ccc）。
- [x] 换血文件面与上游 `diff --name-only` 吻合：staged 5210＋1 件内容未变（uperLu 邮箱文件 HEAD 既有内容已与 v0.23.2 一致，三方 blob 同 c90007c）＝5211。
- [x] pristine blob 抽验 3/3（conversation_loop.py / gateway/run.py / pyproject.toml 与 v0.23.2 tag 一致）。
- [x] `.gitignore` 误伤面核验：旧 12 补录件（d.ts/export*/woff2/plugin.runtime.js 等）全数延续在库 tracked；零新增吞文件类。
- [x] worktree 净基线 clean+inject 终局 **491/491 applied 零 FAIL**（run23；run2-22 为逐失败迭代轮，根失败 16 枚逐一归因重锚）；manifest v2 状态分布 `{applied:491}`；deploy 落影子树 183 件、宿主未触（diff 实证）。
- [x] 手解文件 py_compile/AST 全过（每枚重锚后即验）。
- [x] runtime 终局=零变更保持 main 态（20 件镜像执行过但因 D9 热修保护回退；预演对账 56/0/6＋py_compile 过留档；33 件漂移挂账 N-4'）。
- [x] 拼合树 pytest：**155 passed / 0 failed**（v0231 基线 152＋3；中途 154/1 红=533 测试踩 v0.23.2 已删 `_running_agents_ts` 垫片，主检出 v0.23.1 同测 5/5 绿定谳上游演进，533 测试段适配后复绿，10.4s/8.1s 两轮）。
- [ ] `npm test` 全量零新增失败（环境性红项定谳记录）。（收口前执行）
- [x] 载体链一致性：team/VERSION＝version.json 四键＝RELEASE-MANIFEST agent-teams＝VENDOR.md 表行＝AGENTS.md/README 版本行；release:check 四模块对账全绿（agent-teams=v0.23.2-team.1）。
- [x] 投影三件套（training-manual/route-manifest 含 ssot）单跑 6/6 绿；测试断言数组 v0.23.2-team.1 已进位；docs:sync 投影块重写＋docs:check 绿。
- [ ] merge 后 main 抽验：merge 提交 vendor/hermes-agent 面 diff 非零；main clean+inject 全量 applied。

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（台账正本：表行 commit/版本＋dated 条目）、`AGENTS.md:29`（vendor 行版本三树对齐）、`README.md`（组件表版本行）、`team/README.md`（版本方案叙述＋What changed 节）、`team/VERSION`/`team/version.json`（agent-teams 版本真源/机读载体）、`RELEASE-MANIFEST.json`（agent-teams.version＋vendorBaseline）、`team/requirements.txt`（注释版本）、`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（数字总账 hermes-agent 基线行 v0.23.2＋agent teams 模块行 v0.23.2-team.1）；A.1 三处登记（附录索引计数＋机械索引行＋design 索引两清单）；scope.yaml 同批声明。

## 挂账（不处置清单）

| # | 项 | 处置建议 |
|---|---|---|
| N-1 | 宿主 `~/.hermes/hermes-agent` 基线仍 v0.23.1 线 | run31 收官后独立批：宿主 checkout v0.23.2＋在途热修重锚→真树 deploy→网关重启（v0231 批 N-2 配方）；须用户明示 |
| N-2 | SIM 42 profile 基线盖章仍 v0.23.1 面 | 宿主升级（N-1）落地后独立批重盖章（sim-v0230-alignment 配方） |
| N-3 | `~/.hermes/host-sim-v0232` 验证残留目录 | 下次宿主升级部署时以真树为准后可清 |
| N-4' | runtime/ 覆盖层与 v0.23.2 注入态 33 件漂移（含 expect_assignee 无补丁热修） | 宿主升级批（N-1）一体处理：热修回灌 patches/→runtime 镜像跟进→宿主部署；属主=091f8f97e 回灌会话/安全门热修属主协调 |
