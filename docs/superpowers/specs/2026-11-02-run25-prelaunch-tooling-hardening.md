# run25 前置暴露的三处工具链缺陷收口（清场分支族/bare HEAD/studio 旗标源/门禁断言）

日期：2026-11-02 ｜ 类型：fix（simharness 工具链）｜ 状态：implemented（run25 启动窗落地）

## 变更

run25 前置准备（clean→setup→up→prelaunch）暴露四处缺陷，本批一次收口：

1. **mx-clean 分支清理族不全**：删除正则只覆盖 `integration/|feat/|test/|wt/|fix/|wip/` 六族，
   run23/24 的 `docs/*`（13 条）`plan/*` `verify/*` `sec-rereview*` 共 23 条逃过清理，
   与 mx-clean 自身合格线「中央仓仅剩 main 分支」直接矛盾。修法：删除面改为
   **全部非 main 分支**（tag 快照保全纪律不变——先 tag 后删、tag 未推达即 fail-closed 中止）。
2. **中央 bare 仓 HEAD 悬空**：`central-origin.git` 的 HEAD 指向不存在的 `refs/heads/master`，
   mx-setup 新建工作区克隆出「空 master 无提交」坏基线（run24 靠值守期手工迁移的 13 个
   旧工作区掩盖，A5 立法后首次全量 mx-setup 建区即踩雷）。修法：mx-clean 中央仓重置段
   末尾把 bare HEAD 显式立到 `refs/heads/main`。
3. **ensure_studio_up 旗标源断裂**：`PIPELINE_TRIGGER`/`PARALLEL_REVIEW` 只在 mx-up.sh 顶部
   export，而 mx-setup.sh:115 也调用 ensure_studio_up 先行拉起 studio（产品通道前置），
   该路径起出的 studio 不带旗标并占住 8802，随后 mx-up 的带旗标启动 EADDRINUSE 退场、
   就绪探测被无旗标实例应答→误判成功。`PIPELINE_TRIGGER` 缺省=off（pipeline-engine.ts:17，
   只报状态不发令），run24 低利用率的一个构成性原因面。修法：ensure_studio_up 的显式 env
   清单（注释自称「env 与 mx-up 同款，单一事实源=本函数」）补齐两旗标，取值沿用
   `${MX_PIPELINE_TRIGGER:-on}`/`${MX_PARALLEL_REVIEW:-on}` 与 mx-up 顶部同款。
4. **门禁 ㉒ 断言指错文件**：ea3b5c85e（2026-11-02 16:40）新增的第三断言
   `grep '/app/gov/org-assets' routes.ts`——该字面量自 22e98bdef 起真身在
   `stage-attribution.ts:84`（直接链接阶段归属矩阵），routes.ts 自 92a01abd9（10-16 C1
   治理中心壳升格）后只有嵌套 `path: 'gov/org-assets'` 形态，断言从未可能为真。修法：
   第三断言目标改指 `stage-attribution.ts`，前两断言（stage-tabs clearance、
   routes.ts /app/stage/accept）不动。

## 决策记录

- 分支清理不枚举白名单族、直接「除 main 全清」：合格线本来就是仅剩 main，枚举族必再漏
  （本次 docs/plan/verify 三族即先例）；tag 快照＋推达验证的恢复锚纪律原样保留，删除仍是
  fail-closed。
- bare HEAD 立法放 mx-clean 而非 mx-setup：清场是「0→1」的责任边界，setup 只消费不应修
  基础设施；clean 收口时一次立正，setup 克隆即得正基线。
- studio 旗标放 ensure_studio_up 显式 env 而非要求调用方 export：该函数注释已自称单一
  事实源，缺省值与 mx-up 顶部同款（on），任何调用路径（mx-setup 前置拉起/mx-up 正轨/
  babysit 自愈重启）都拿到同一语义。
- ㉒ 修断言而不修产品：/app/gov/org-assets 深链经 stage-attribution 归属矩阵指准阶段页
  （22e98bdef 设计），产品无缺陷；门禁向事实源对齐。

## 验证

- mx-clean 分支族：本轮实跑已人工等价执行（23 条 tag 快照 `mx-clean-20261102-180630-b-*`
  后删、bare HEAD 立正、15 工作区重克隆全部落 main 跟踪 origin/main）；代码面收口后由
  下轮 clean 实跑复验。
- bare HEAD：重建后 bella 工作区 `git branch --show-current`=main、log=bd39cdb、
  tracking=origin/main（实测输出在会话记录）。
- studio 旗标：kill 无旗标实例→mx-up 重启→`ps eww` 实测 8802 listener env 含
  `PIPELINE_TRIGGER=on`+`PARALLEL_REVIEW=on`，/health/ready 200。
- 门禁 ㉒：修复后 mx-prelaunch-check 重跑 34/34 全绿（本 spec 同批提交前完成）。
- 守门：`bash tests/run-gates.sh` 全量绿后合入。

## 设计文档影响

DESIGN_SYNC: none——四处均为 simharness 工具链内部修复（驱动侧调度旗标为产品既有 env
约定，无契约/阈值/格式变化），不触及整合正本与数字总账。
