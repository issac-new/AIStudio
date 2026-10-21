# 生产失败回流轮挂账清偿（评审 Minor + OTel + OS 沙箱 + 代码仓审计面）

日期：2026-10-21　分支：`feat/debt-clearing-1021`　前置：`feat/production-trace-reflow` 已合入（origin/main 07cefef4）

## 1. 结论

上轮如实挂账的全部项目本轮清偿，分四批独立合入：A）评审 5 个 Minor；B）OTel 轨迹的采样/转题/复判支持与格式探测器单一事实源；C）OS 级沙箱执行决策面与首个消费点；D）secaudit 域新增代码仓审计对象与采集器。原则不变：不新建调度器、不新建存储、fail-closed、证据来自实测。

## 2. 变更

### 2.1 批次 A（评审 Minor）

- `runner.originSampleOf` 复用 `inspectTrace` 同一次读取的 rows 构造证据（新增纯函数 `evidenceFromRows`/`spanEvidenceFromRows`），消除 hash 校验与采样两次读文件的漂移窗口。
- `POST /reflow-from-trace`：`trace_unavailable`/`target_not_found` 回 404。
- 转题响应增 `alsoIn`（同来源键已存在的其它集 id），不阻断。
- workbench `readRegressionEvidence` 的冻结快照缺失 / setHash 不符两条拒绝分支补锁测试。

### 2.2 批次 B（OTel）

- 格式探测与 OTel→legacy 行转换收敛到 `custom/server/eval/trace-sampler.ts`（纯函数 `otelRowToLegacy`/`detectTraceFormat`），`controllers/hermes/trace.ts` 改为 import 它，两处判定不再各自为政。
- `inspectTrace` 对 OTel 文件返回转换后的 legacy rows 与 `format:'otel'`；`complete` 按根 span 的 trailer 标记判定。转题与 origin 复判接受 OTel（hash 仍取原始字节）。
- 客户端 IDE 轨迹页对 OTel 不再禁用转题入口；OTel 不支持提示保留给 `unknown` 格式。

### 2.3 批次 C（OS 级沙箱执行）

- 新增 `custom/server/sandbox/exec-sandbox.ts`：平台探测（darwin `sandbox-exec` seatbelt profile / linux `bwrap`）、能力结果三态 `available|unavailable|error`、执行约束（禁外网、净化 env 白名单、只写指定目录、超时）；探测失败或平台不支持一律 `unavailable`，调用方必须 fail-closed，不得降级裸跑。
- 首个消费点：qgate `command` executor 增可选 `sandbox: true`；沙箱不可用时该门 verdict 为 `unknown`（不 PASS）。红队沙箱攻防仍挂账（需执行型攻击载荷，另立项）。

### 2.4 批次 D（代码仓审计面）

- secaudit `catalog` 增 `repo` 审计对象族与三类采集器：`secrets`（正则族扫描源码）、`deps`（复用 qgate sast-audit 的 npm audit 口径）、`dangerous_api`（复用 codesec static 规则）。
- 覆盖账本按「仓 × 采集器族」出 unit，未跑的族显式 `unchecked`；不造静态分析引擎，吸收 Cloudflare 的纪律而非工具。

## 3. 决策记录

1. 评审 5 个 Minor 全部修复而非挂账——用户 2026-10-21 指令「完成所有待办/挂账」，范围由用户显式扩权。
2. `alsoIn` 只提示不阻断——按集运行语义自洽；阻断会阻碍把同一事故分别进 e2e 与 process 两轨。
3. OTel 消费放在采样器而非观测聚合层——obssignals 聚合消费 OTel 属观测域独立挂账，本轮边界是「评测域能读 OTel」。
4. OTel 转换逻辑的单一事实源放 eval 域（无 koa 依赖）；controllers 反向依赖它，而不是 eval 依赖 controllers。
5. 沙箱决策面 fail-closed：沙箱不可用时消费方得到 `unavailable`，自行决定「不执行」；绝不静默裸跑。
6. 沙箱首个消费点选 qgate 而非红队——qgate command executor 已有 argv 白名单执行面，接沙箱是加固；红队攻防需要执行型载荷库，另立项。
7. 代码仓审计不造 SAST 引擎——以既有扫描器为采集器编排进覆盖账本；「哪些族没扫」比「扫得多深」优先。
8. 四批各自独立合入 main，每批全量回归绿才进下一批——长任务防中途丢失存量。

## 4. 验证

- 每批：新增 RED→GREEN 测试 + 相关域定向套件 + `typecheck:harness` + 全量 `npm test`。
- 批次 C 在本机 darwin 做 `sandbox-exec` 真探测一次（能力真/假不编造）。
- 批次 E（serve-main 换装 8647）在全部批次合入后执行，JWT 探活。
