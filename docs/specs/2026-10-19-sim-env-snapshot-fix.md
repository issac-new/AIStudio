# SIM studio 环境与 dist 快照链修复（2026-10-19）

来源：V8.44 全页走查。8802 studio 进程未带 `OBS_SIM_ROOT`，所有推演端点按 fail-closed 返回 503；`SIM_BRANCHES_REPO`/`SIM_ANCHOR_REPO` 也未注入，分支交付与 commit 锚 503。另 `mx_provision_product_dist` 只比较 `server/index.js` mtime，只重建客户端时误判「已同步」，新 RunSelector 修复没有进入 SIM 快照。

## 变更

- `ensure_studio_up` 环境块增加 `OBS_SIM_ROOT`、`SIM_BRANCHES_REPO`、`SIM_ANCHOR_REPO`（后两者缺省 `$SIM_ROOT/central/aipaydev`）。
- product-dist 新鲜度改为 `server/index.js` + `client/index.html` 双 mtime 串。
- prelaunch ⑤ 增加 studio 进程 `OBS_SIM_ROOT` 机械检查（只测 `/health/ready` 会把 503 推演端点放行）。

## 决策记录

- D-1：SIM 根以 `AIPAY_SIM_ROOT`/默认值为单一事实源；studio 子进程显式注入，避免依赖调用者 shell 继承。
- D-2：分支仓与 commit 锚仓同指中央仓 `$SIM_ROOT/central/aipaydev`；显式 env 优先。
- D-3：快照新鲜度必须覆盖服务端与客户端两个入口，禁止只看一个文件 mtime。
- D-4：prelaunch ⑤ 对 studio 进程 env 做机械检查，防止「健康检查绿、推演端点 503」的假绿。
- D-5（2026-10-19 清场实测）：`mx-clean` 分支删除校验的 `$_miss` 后接全角括号会被 macOS bash 3.2 吸入变量名（`_miss�: unbound variable`，纪律 76 同族）；改为 `${_miss}`，机械检查=`bash -n`。
- D-6（2026-10-19 prelaunch ⑧ 实测）：`--print-paths` 改为纯只读，不建 evidence/锁目录；门禁测试不再在真 SIM_ROOT 造测试 run（否则 prelaunch ⑧ 把测试残留当上轮审计）。机械检查=print-paths 后 runs/ 为空 + harness-gate-integrity 128 测全绿。
- D-7（2026-10-19 smoke 实测）：`mx-smoke.sh` 139 行 `$_A_BOARD` 后接全角括号撞 bash 3.2 变量名（`_A_BOARD�: unbound variable`），统一 `$VAR`→`${VAR}`；G2「ACL 泄漏」为测试账号 role=admin 的假阳性（G3 团队围栏通过），G1/G3/G4/G5/G6 实弹通过，G4 agent 实际派发到 done（provider 回退 `custom:cc-switch/aim` 可用）。
- D-8（2026-10-19 smoke G2 复测）：G2 假阳性的第一根因是测试环境数据而非产品围栏——chen（user_id 5）的 `user_profiles` 累积 43 条历史映射（含 fanfan 全族），其 `/api/hermes/profiles` 按映射合法返回 20 个档案。`mx-clean` 只清 `boards/`，从未清 webui 库的 `user_profiles`；也没有清根 `$HERMES_ROOT/kanban.db`（default 板）——历轮 REL 卡以 archived 态残留，被 G2「default 板零任务」口径判失败。修法：clean 时 dump 并清空 `user_profiles`、归档删除根 `kanban.db`，机械检查=`sqlite3 ... "select count(*) from user_profiles"` 为 0、default 板计数为 0。
- D-9（环境重建单一事实源）：映射不在 clean 后靠历史残留，也不在产品侧兜底；由 `mx-setup` §5a 按供给清单重播——每用户仅保留「自己 + 自己名下 agent」的 profile 映射，先 delete 再逐条 insert。这样 ACL 判定的输入与 `mx-setup` 的供给清单同源，环境可重复重建。
- D-10（provider 归属）：宿主 `~/.hermes/config.yaml` 的 `model.provider: builtin:bigmodel-coding-plan` 在 SIM runtime provider 注册表中不存在，每回合打 `Primary provider auth failed (Unknown provider ...)` 后回退 `custom:cc-switch/aim`。`mx-setup` §4b 对根与全部 profile 配置做归一：`builtin:bigmodel-coding-plan`→`custom:cc-switch`、`default: GLM-5.3`→`default: glm-5.3-flash`；机械检查=`mx-up` 后 gateway 日志无 `Primary provider auth failed`。
- D-11（smoke G2 测试设计）：G2 原探针「无映射任务不可见」用未指派卡，结果同时受 default 板哨兵与全局可见性补丁干扰；改为创建**已指派**给 `fanfan-sys-analyst` 的 `acl-probe-$TS` 卡，以 chen 身份登录验证不可见后立即归档；profile 名单断言由子串匹配改为 jq 精确提取 + `grep -qx`。smoke 结束时自清理 `pin-test-*`/`fence-test-*`/`dispatch-test-*`/`acl-probe-*`，避免残留卡污染下一轮看板真值。以上是加强而非放宽：探针仍验证真实围栏，只是消除环境噪声与子串误判。
- D-12（2026-10-19 provider 归一实测事故）：归一脚本的替换串写入为 `r'\x01default: …'`——`\1` 被序列化成 SOH 控制字符，43 份 config 的 `model.default` 行首缩进被吞，`mx-up` preflight 报 `yaml 解析位置 7 不允许控制字符`。修法=替换函数改用 `lambda m: m.group(1) + 'default: glm-5.3-flash'`，不走反斜杠分组引用；现有 43 份配置按 `\x01 + default:` → `两空格 + default:` 修复。机械检查=`grep -rl $'\x01' hermes/config.yaml hermes/profiles/*/config.yaml` 为空 + preflight 容量自检通过 + 网关日志零 `Primary provider auth failed`。
- D-13（2026-10-19 prelaunch 实测性能）：⑲⑳㉑㉒ 的生效 dist 标记检查用 `grep -rq` 扫整个 product-dist，而该目录含 `node_modules`（1.7G / 5.2 万文件），十六次全树扫描把预检从秒级拖到 30 分钟以上（实测 08:31 起跑，09:02 仍在扫）。修法=全部 `grep -rq` 增加 `--exclude-dir=node_modules --exclude-dir=.git`；检查语义不变（标记只可能出现在构建产物与自定义源码里）。机械检查=预检整体耗时回到分钟级且二十二项计数不变。
