# IDE 工作区全功能回归修复批：文件树根竞态 + 非 super_admin 死胡同回落 + 板归属回填 + i18n 键

日期：2026-10-31 ｜ 轮次：IDE 工作区全功能回归（看板任务→工作区加载→demo 开发→提交→评审全链走查） ｜ 类型：fix（回归排查三项缺陷根治 + 一项卫生）

## 变更

1. `custom/client/ide/views/IdeFilesPane.vue`（缺陷① 文件树根竞态）：根 watch 由「先清 `filesStore.workspaceRoot=undefined` 再校验再回填」改为「校验通过才换根、失败才清」。旧形态在挂载/换根时产生 undefined 中间态，触发上游 FileTree（`packages/client/src/components/hermes/files/FileTree.vue:172` workspaceRoot watch）发起**无 root 参数**的默认根装载（列出 ~/.hermes），与随后带 root 的正确装载赛跑、最后写者胜——super_admin 走查两次复现「树显示默认根内容/无子目录」。新形态保证 workspaceRoot 只有旧值→新值一次跳变。
   同文件第二层（渲染闸）：模板中 FileTree 分支收紧为「有根且 `validation.status==='ok'`」才挂载；有根但校验在途/未开始（checking/idle）显示加载提示。修前 FileTree 在校验完成前即挂载，其 immediate watch 读 store 里旧/空 workspaceRoot 发起**无 root 装载**（默认根 ~），与校验后的正确装载赛跑——这是 super_admin 复盘仍红的主因。两层合计：装载单发、根恒正确；校验失败路径语义不变（清根+可解释错误面板）。
2. `custom/client/ide/views/IdeFilesPane.vue`（缺陷② 非 super_admin 死胡同）：新增「权限拒绝且任务工作区已物化」回落分支——`validation.status==='invalid'` 且 `permissionDenied` 且 `ide.taskWorkspace.materialized` 时，改渲染任务域只读文件树（复用 `components/IdeReadOnlyTree.vue`，数据源 `GET /api/hermes/kanban/workspace-files?task_id=&board=`，服务端已限定任务工作区沙箱+深度上限 4，与未物化兜底视图同数据面），顶部保留权限提示行与既有动作钮（重试/选择任务工作区/查看账号角色）。修前形态：普通账号（admin 角色）打开物化任务深链，文件页签死胡同显示「需要管理员权限」，而设计上存在的任务域只读通道未接线。安全边界零变化：`/api/studio/files` 的 root super_admin 闸门（patch 097）与终端 super_admin 闸门均不动。
3. `custom/client/ide/store/ide.ts` + `custom/client/ide/views/IdeShell.vue`（缺陷③ 板归属失真）：store 新增 `patchTaskWorkspaceBoard(board)` 轻量回填；IdeShell `resolveActiveTask` 在并行首轮结果可复用（`parallelReusable`，绝对路径场景）时，若跨板解析推断出的真实板号（`boardFromWorkspacePath`，如 `…/boards/swarm/workspaces/…` → swarm）与首轮回显板号（客户端未传板号时服务端缺省 default）不一致，就地回填 `taskWorkspace.board`。修前形态：swarm 板任务经 `?task=` 深链后 `taskWorkspace.board` 恒为 default，简报板显示与下游板域查询（retry-count/workspace-files 的缺省板）拿错板号。
4. `custom/client/ide/i18n.ts` + `custom/client/ide/views/IdeFilesPane.vue`（卫生④ i18n 键缺失）：`IDE_LOCAL_TEXT.filesInvalid` 补 `pickTask` 双语键（zh「去工作台选任务」/en「Pick a task in the workspace」），按钮改走 `invalidTx.value.pickTask`，消除 vue-i18n `Not found 'ide.files.pickTask' key` 双语告警（intlify zh+en 两发）。

配套守门测试：`custom/client/ide/__tests__/files-pane-root.test.ts` 扩竞态回归用例（挂载期不发起无 root 装载/失败才清根）；新增 `files-pane-perm-fallback.test.ts`（权限拒绝+物化→只读树渲染、无任务/未物化→不回落）；`task-workspace-store.test.ts` 扩 `patchTaskWorkspaceBoard` 回填用例。

## 决策记录

- **缺陷① 修客户端而非 FileTree 上游**：竞态的另一半（FileTree 两 watch 无共享序号守卫，`treeInstanceKey` 重挂载对冲）在 vendor 基线，动它需走 patches/ B 类改造；本批以 A 类消除唯一可观察的失败形态（undefined 跳变→无 root 装载），FileTree 侧「任务切换期双装载竞态」为理论残余（两装载均带正确根，最后写者胜结果一致），不值得为此开补丁。若后续走查再现实错根，再立 B 类补丁。
- **缺陷② 回落只读而非放宽 root 闸门**：root 参数直通任意目录是安全边界（SecFileRootSandbox patch 097 立法；终端同族为上游 canOpenTerminal 设计），放宽须用户显式裁决。任务域只读通道（workspace-files）本身即服务端预置的按任务沙箱端点，权限语义=「能看到这张卡即能读它的工作区」，与租户隔离不冲突。选「fail-soft 接线既有通道」而非「提权」：普通账号从死胡同变为可读不可写，super_admin 行为零变化。
- **缺陷③ 回填板号而非重发请求**：并行首轮（不待板号的 task-workspace 查询）是深链提速设计（2026-10-18 关联轮），路径解析结果与板号无关、无需重查；失真的只是回显板号字段。就地回填保住提速语义，避免为显示字段多打一次 CLI 链（冷启动 getTask 已实测 5-12s）。
- **回归定性存档**：终端「需要超级管理员权限」禁用态、非 super_admin 文件页签 403 面板本身均为**预期安全呈现**非缺陷（本轮修的是后者有更好回落）；任务详情抽屉偶发「加载任务失败」（4 次走查 2 次，重试即恢复）与 getTask 冷启动 5-12s 为后端 CLI 子进程链慢/偶败的已知特性，本轮未动（见验证节未做项）。

## 验证

- 单测：`npx vitest run custom/client/ide/__tests__/files-pane-root.test.ts custom/client/ide/__tests__/task-workspace-store.test.ts`（既有+新增用例）；新增 `files-pane-perm-fallback.test.ts`。
- 活体走查（super_admin 与普通账号双视角）：重跑 `/tmp/ide-regr/walk-d.mjs`（super_admin 文件树=任务工作区）与 `walk-a2.mjs`（普通账号深链→权限回落只读树，不再死胡同）——两项此前分别红在竞态与 403 面板。
- i18n：重放开 FilesPane 走查，console 无 `ide.files.pickTask` intlify 告警。
- 相关面回归：`npx vitest run custom/client/ide/__tests__/`（IDE 域全量）零新红。
- 活体服务：8647/8649 在线（回归轮已换装当前 main 后重启）。

## 设计文档影响

DESIGN_SYNC: none——三项均为 IDE 承载面缺陷修复（装载竞态/回落接线/字段回填），未触及整合正本与数字总账的契约、阈值或口径；「非 super_admin 任务工作区=只读回落」的权限语义与「root 闸门不放宽」边界已在本 spec 决策记录留档为事实源。
