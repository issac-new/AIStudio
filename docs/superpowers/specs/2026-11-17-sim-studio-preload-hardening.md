# sim studio 启动 preload 加固收口：S-L2 fail-closed ＋ G-004 fail-open 仓内正本化与幂等供给

> 日期：2026-11-17
> 状态：已实施（drill r004 安全演练产物收口批）
> 基线：origin/main `b1312b8aa`
> 读者：需要判断 simharness studio 拉起链安全性与 fresh 环境可恢复性的维护者

## 变更

drill r004 安全演练在 SIM_ROOT（仓外）沉淀了两个 node 预加载器与一份 mx-lib.sh 在途改动，本批把它们正本化入仓并补齐供给闭环：

1. **preload 件入仓**：`simharness/mux/preload/jwt-secret-preload.cjs`（S-L2：node exec 后读 `creds/auth-jwt-secret`（0600）注入 `AUTH_JWT_SECRET`，密钥缺失/畸形 exit 78 拒启）与 `simharness/mux/preload/studio-access-log-preload.cjs`（G-004：hook `http.Server.prototype.emit` 记 JSONL 请求级遥测至 `logs/studio-access.log`，故障一律降级继续不 exit）两份正本入仓。入仓前逐行审查：jwt 件只读文件注入 env、无任何硬编码密钥；access-log 件只记 method/path（query 整体剥离为布尔）/status/dur_ms/auth 派生/auth_hdr 仅 present+scheme/raddr，不记任何 header 值、query string、body、token、cookie——无敏感值，过 `secret-scan-gate` 扫描面。
2. **mx-lib.sh `ensure_studio_up()` 落地加固**（此前为主检出未提交在途改动的语义正本化）：启动前 S-L2 fail-closed 预检（creds/jwt-secret-preload.cjs 或 creds/auth-jwt-secret 不可读即 return 1，免 120s 盲等）；G-004 fail-open 告警（access-log 预加载器缺位只告警不拒启）；node 启动行改 `node -r "$4" -r "$5"` 位置参数传入两个 preload 路径（规避 set -u 下命名变量位置展开 unbound 前科）。
3. **新增供给函数 `ensure_studio_preload_files()`**（单一事实源在 mx-lib.sh）：幂等投放——CREDS_DIR 下两个 preload .cjs 缺失或与仓内正本内容不同（`cmp -s` 判）则复制过去；`auth-jwt-secret` 缺失才生成（`openssl rand -hex 32`，chmod 600），**已存在绝不覆盖**（覆盖会使既有已签发 JWT 全部失效）。该函数在 `ensure_studio_up()` 的 S-L2 可读性预检之前调用，mx-setup（L121）与 mx-up（L260）两个入口都经 `ensure_studio_up` 自愈，防顺序问题砖死 fresh 环境。
4. **守门测试** `simharness/mux/tests/studio-preload-supply.test.sh`：覆盖供给函数三态幂等（缺失则补/相同不动/漂移则同步回正）、密钥已存在绝不覆盖、fail-closed/fail-open 接线锚与 preload 件静态红线锚，随 `run-gates.sh` 聚合自动执行。

## 决策记录

1. **S-L2 fail-closed 与 G-004 fail-open 分置**：密钥缺失=安全回归（静默回落服务 token 签名等于复活 r003 S-L2 铸造链漏洞），必须拒启；遥测缺失=观测退化（服务功能完好，r004 蓝方 misses 的根因是取证盲区不是安全漏洞），只告警照常服务。二者故障后果不同级，若统一 fail-closed 则日志组件小故障即打翻整个 studio 通道，若统一 fail-open 则密钥缺失静默降级为弱签名——分置是各自故障语义的最小正确处理。
2. **preload 件入仓位置 `simharness/mux/preload/`**：preload 是 mux 拉起链的组成部分（mx-lib `ensure_studio_up` 消费），跟随 mux/ 既有子目录先例（tests/、tools/、git-hooks/）；入 `runtime/`（部署到宿主 ~/.hermes）或 `patches/`（构建期注入 vendor）都跨了边界——它们不是产品仓件也不是上游补丁。仓外独存=fresh 环境必炸（S-L2 预检 fail-closed 拒启），正本入仓＋CREDS_DIR 幂等投放后，fresh 环境首次 `ensure_studio_up` 即自愈。
3. **密钥不入仓＋幂等生成策略**：`auth-jwt-secret` 是 0600 密钥文件，入仓即泄漏面（且 worktree/克隆全副本扩散）；由供给函数在缺位时 `openssl rand -hex 32` 现场生成，存在即跳过。绝不覆盖既有文件：JWT 签名密钥轮换会使全部已签发 token 立即失效（打翻在途会话与演练台账），收益为零。文件名与 jwt preload 内 `__dirname + '/auth-jwt-secret'` 的定址耦合：preload 复制到 CREDS_DIR 后与密钥同目录，定址成立，不引入第二配置面。
4. **mx-setup 不另加调用点**：`ensure_studio_up` 内部（S-L2 预检前）调用供给函数，mx-setup/mx-up 两个既有入口全覆盖；若 mx-setup 再加显式调用则双调用点漂移风险，违背单一事实源。
5. **机制预算不登记**：本批新增件不在 `config/mechanism-budget.json` 口径内——gates 只数 `custom/qgate/gate-packs/*/gates/*.yaml`，scripts 只数 `scripts/` 树 .mjs；mux/tests/*.test.sh 属 simharness 守门（同目录既有 17 个同类，无逐个登记先例），preload 是运行面加固件非治理机制。无治理通胀增量，无需配对退役项。
6. **注释随正本**：在途改动中的时间线注释（t_8d68f11e/t_4d59c9d0 锚卡、r003/r004 演练实录）随语义一并入仓——注释写的是约束与来源（为何 fail-closed、为何位置参数），符合仓内注释纪律。

## 验证

- 守门套件（worktree 内，含新增测试）：
  - `bash simharness/mux/tests/studio-preload-supply.test.sh` 单跑 → `studio-preload-supply: all ok`（16 断言全过）。
  - `bash simharness/tests/run-gates.sh` → 聚合 EXIT=1，唯一 `FAIL(sh)` 为 `jargon-source-gate.test.sh`——**基线存量红，与本批无关**：其 HARD 违规全部在 b1312b8aa 提交态（`mx-report-gen.py:4915`「收官」、`2026-10-05-mux-v8-fullflow-plan.md` L2993/2997/2998），而该门扫描面（五个报告 py 文件＋plan 提交态）本批一行未碰（`git status` 扫描面为空）。sh 段因此红提前退出，vitest 段按下条单独补跑；其余 sh 守门全部通过（无其他 FAIL(sh) 行）。
  - vitest 段（`./node_modules/.bin/vitest run --root simharness`，与 run-gates 同解析路径）→ `Test Files 29 passed (29)`、`Tests 375 passed (375)`。
- 机制收据自检：`python3 -I simharness/mux/mx-mechanism-receipt.py selfcheck --root .` → `selfcheck ok（16 机制文件在位）`（改动前后各跑一次，均绿）。
- 密钥泄漏扫描：`secret-scan-gate.test.sh` 随 run-gates 通过（对已跟踪文件零命中）；新增两份 .cjs 提交前尚不在 git grep 面，已用同款 PAT 手动预检 → 命中数 0（提交后自动入面）。
- 幂等语义实测（测试内断言）：空夹具首调两 preload 落位且 cmp 与正本一致、auth-jwt-secret 为 64 hex 且 0600；再调密钥内容不变（绝不覆盖）、两副本 inode 不变（无重写）；篡改副本再调恢复与正本一致；空密钥文件视为缺位补生成。
- 主检出在途 diff 的语义等价：worktree 版 `ensure_studio_up` 保留其全部行为语义（S-L2 预检/G-004 告警/`node -r "$4" -r "$5"` 启动行），主检出在途改动可随后废弃，由主会话收口时处置。

## 设计文档影响

DESIGN_SYNC: none。本批是 simharness 运行面（mux 拉起链）安全加固与供给闭环，不触及 docs/DESIGN.md 整合正本与数字总账；preload 机制描述以本 spec 为单一事实源，mx-lib.sh 内注释锚回本 spec。
