# 2026-11-12 CI product-tests 平台差异失败清偿（25 例 / 10 文件）

## 变更

product-tests 工作流首跑 8853 测 25 败，全部为平台/环境差异而非产品缺陷。本批逐项定性后清偿，目标单仓在 CI（ubuntu-latest）与本机（darwin）同绿：

1. `custom/__tests__/interactive-training-manual.test.ts`（CI 时点 1 败＝索引含 merge 标记，该形态已在 main 清偿）——本批再修新浮出的漂移：`2026-11-12-frame-reshoot-0tasks-granularity.md` 以「带注释行」手工加入索引机器段（0bed69f1a），宽解析的 gen-doc-indexes 容忍、vitest 严格模式（链接行必须裸结尾）判缺失。修＝`gen-doc-indexes --write` 机械归位（机器段契约：只允许生成器形态）。
2. `custom/desktop/__tests__/after-pack-combined.test.ts`（3）——hook 与 prebuilds 路径硬编码兄弟 `../upstream/hermes-studio`，CI 单检出于仓内无该目录。修＝改用 `custom/test/upstream-root.ts` 的 `upstreamPath()`（env → vendor → 兄弟，既有单一事实源，不新造第三份）。
3. `custom/desktop/__tests__/linux-sandbox.test.ts`（1）——静态 import 兄弟 upstream 的上游源码。修＝同上解析序动态定位（文件级 import 失败即全文件红），vendor 注入态同路径存在（patch 268）。
4. `custom/server/incident/__tests__/incident-window.test.ts`（1）——48h 回落窗起点取「本地时区当天 00:00」，本机 Asia/Shanghai 与 CI UTC 差 28800s。产品语义＝run id 日期是 +0800 运维日期（断言注释本就锚定 +0800）。修＝测试内钉死 `TZ=Asia/Shanghai`（beforeAll 设、afterAll 还原），期望值不动。
5. `custom/server/matrix/__tests__/delivery-harness-contract.test.ts`（4）与 6. `raci-rest-guard.test.ts`（1）——两份复制的 `resolveSimharnessRoot` 只认「ncwk 分树轮兄弟布局」，单仓整合（2026-10-24）后 CI 上 simharness 在仓内、兄弟路径 ENOENT。修＝收敛为单一测试助手 `custom/test/simharness-root.ts`（env MX_SIMHARNESS_ROOT → 仓内 `simharness/` → 旧兄弟布局回落），两测试改引助手。
7. `custom/server/sandbox/__tests__/exec-sandbox.test.ts`（4）——实现本就双后端（darwin sandbox-exec / linux bwrap）；CI ubuntu runner 无 bwrap，产品如实报 unavailable（fail-closed 是设计行为），测试却硬断言 ok。修＝按本机真实探测结果分叉断言：后端在位断言 ok 语义四例；缺席断言 unavailable 且不执行子进程。不在 runner 装 bubblewrap 硬凑 ok 路径：GH runner 的 AppArmor unprivileged-userns 限制下 bwrap 运行态不可保证（安装≠可用），探测只查二进制存在会引入「探测造假」的新差异面。
8. `custom/server/videoref/__tests__/frame-extract.test.ts`（1）——真 ffmpeg 抽帧守门，runner 缺 ffmpeg。产品语义＝ffmpeg 缺席如实抛错不降级（frame-extract.ts 头注），故修 CI 不修测试：workflow 增加 `apt-get install -y ffmpeg` 步。
9. `custom/server/zcode/__tests__/cua-node-backend-platforms.test.ts`（5）——zcode lane 后端路径硬编码兄弟 `upstream/zcode`。修＝复用 `upstreamPath()`（env → vendor/zcode → 兄弟；注入态 vendor/zcode/packages/zcode-cua/node-backend.js 存在），解析结果缺席时显式 skip＋注明需注入态（CI 链先注入故可达）。
10. `custom/server/controllers/ia2/__tests__/identity-chat.test.ts`（4）——fs mock 只劫持 `readdirSync`，`statSync` 走真盘：本机恰好存在真实 `~/.hermes/profiles/{worker-coder,orchestrator,data-arch}` 才绿（测宿主状态而非代码），CI 上 statSync ENOENT 被实现吞成空清单。修＝补全夹具语义：statSync 对 profiles 目录下夹具条目返回 isDirectory=true，测试不再依赖宿主真实档案。

工作流改动：`.github/workflows/product-tests.yml` 增加系统依赖步（ffmpeg）。

另外两项为 CI 首跑后他批落 main 造成的同套件新红（非平台差异，随批清偿否则全量无法全绿）：

11. `custom/__tests__/qgate-repo-scope-fence.test.ts`（1）——run29 补拍轮（34e96eb77）向 `.qgate/scope.yaml` 追加 3 条具体文件路径，违反围栏契约（只允许目录/** 或根文件白名单）；`docs/**`、`simharness/**` 本就在围栏内，条目冗余且违规。修＝删除 3 条（批次级范围纪律归 task-intent 登记面，见 scope.yaml 头注）。

## 决策记录

- **路径假设类（2/3/9）统一复用 `custom/test/upstream-root.ts`**：该助手是 27 处引用的既有单一事实源（env OVERLAY_UPSTREAM_ROOT → 仓内 vendor → 旧兄弟 upstream），与 scripts/platform/lib/upstream-root.mjs 同序。不为测试新造第三份解析。
- **simharness 根解析仓内优先（5/6）**：单仓整合后仓内 `simharness/` 与消费它的守门测试同 commit 版本锁定（合同漂移当场对账）；旧兄弟布局只作本机存量回落。两份复制解析合一收敛为 `custom/test/simharness-root.ts`。
- **TZ 类（4）钉死时区而非改写期望**：实现取本地零点是产品口径（run id=+0800 运维日期），把期望改成 Date.UTC 等于改产品语义；钉 TZ 保持断言真值不变。
- **平台能力类（7）分叉断言而非 skip**：unavailable＋不执行子进程本身是被测产品行为（fail-closed），两分支都是强断言。不装 bubblewrap：GH ubuntu runner AppArmor 限制 userns，装上也验不了 ok 路径，反而制造「探测到二进制但运行必炸」的假可用。
- **系统依赖类（8）装真件不弱测试**：ffmpeg 是产品执行面硬依赖，测试保持真跑。
- **夹具缺口类（10）补 mock 不改实现**：实现「目录缺失→空清单」是诚实 fail-soft；红的是测试 mock 不完整（本机靠宿主真目录碰巧绿）。
- **索引漂移（1）走生成器通道**：机器段只允许 gen-doc-indexes 生成形态，手工注释行属违规入段，`--write` 归位而非手改。
- **围栏违规（11）删条目不改门**：scope 围栏是作业区声明（条目上限 60、形态受限），批次改动面登记属 task-intent 面；具体文件路径入围栏是旧病复发，删除即修复。

## 验证

- 逐项单文件：`npx vitest run <各文件>` 全绿（本机 darwin）。
- exec-sandbox 双分支：本机（darwin/sandbox-exec 在位）走 ok 分支；`HERMES_EXEC_SANDBOX=off` 复跑走 unavailable 分支验证。
- 全量：`npm test`（后台，Tests 行原文入交付报告）。
- 治理门：`gen-doc-indexes --check` 0 problem；`merge-invariants --check` 过；`governance-lint --budget` 0 problem；product-tests.yml 过 YAML 解析。
- CI 复现面：本机为 darwin，Linux 真值依赖（TZ 钉死、路径解析序、unavailable 分支）以解析逻辑与 CI 工作流配置同源保证；最终以 product-tests 工作流下轮运行为准。

## 设计文档影响

DESIGN_SYNC: none——本批全部为测试/工作流/索引机器段的环境适配清偿，未触及任何产品行为、契约、阈值或整合正本与数字总账（唯一触及的实现文件为零；incident-window/exec-sandbox 等均只改测试与 workflow）。索引机器段改动由 gen-doc-indexes 生成器产出，非手改。
