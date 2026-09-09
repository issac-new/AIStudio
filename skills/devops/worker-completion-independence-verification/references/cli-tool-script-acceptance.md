# CLI 工具脚本验收配方（exit-code 契约类交付）

适用：worker 交付「纯本地扫描 / 外部 API 监控」类 Python CLI 脚本，且任务 body 声明了退出码约定（如 0=有数据 / 1=空 / 2=错误）、stdout 行数上限、去重幂等等可证伪行为。

## 1. 静态断言先行（读代码，不跑）

- 文件存在（`ls -la` size>0）+ `python3 -m py_compile`。
- 「未改动既有文件」类声明必须字节级对比（`wc -c` 对基线数值或 diff 基线副本）——「没动」是声明不是事实。
- 「无网络 / 只读 API / 不执行检索结果」类边界声明用 grep 禁用原语验证：`git clone`、`subprocess`、`os.system`、`eval(`——空输出才合规。
- 「退避重试 ≤N」类声明 grep 常量与分支（MAX_RETRIES、Retry-After 处理），确认逻辑存在而非仅注释。

## 2. 本地工具：stdlib mock fixture 亲测（不复用 worker 的测试脚本）

- 自建最小 fixture：覆盖任务卡点名的每种输入类型（假 JSON/JSONL/TXT 各一）+ 至少一个空文件和一个坏格式文件。
- 断言四件套：①正常态退出码；②stdout 行数 ≤ 上限（用 `[l for l in stdout.splitlines() if l.strip()]` 计数——空行不计，与人类感知一致）；③`--output` 产物 `json.load` 可解析且非空；④空/坏输入降级到约定退出码而非 traceback。
- 外部 API 类另加：不可写 state/输出路径 → 断言错误态退出码（验证 fail-closed 而非崩溃）。

## 3. 外部 API 工具：幂等/去重声明必须二次运行复测

- run1 后检查 state/缓存文件存在且非空（指纹已写入）；run2 同参数 → 断言「无新告警 + 退出码=无发现」。
- 容忍少量新增：外部源结果集有动态性（两次查询间可能出现真新仓库/条目）。run2 新增少量且逐条可解释（不在 run1 结果集中）时不判去重失效；worker 若已对异常条目做了自查说明，独立复测结果与其一致即显式采信。
- 验收自身会消耗 API 配额：worker 已跑过 N 次实测时，优先复测「去重/幂等」这类低消耗断言，必要时用更小 `--per-route-limit` 类参数。

## 4. 结论留痕

- kanban_comment 用「声明 × 验证方式 × 结果」三列表格，每行含证据命令原文。
- worker 的自证材料（异常自查、边界说明）与独立复测一致时写明「采信」，不一致时标 ⚠️ 并给复测输出。
