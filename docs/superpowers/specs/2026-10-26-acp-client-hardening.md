# ACP 客户端加固：工作区分池、env 注入、模型钉定与权限只允许一次（2026-10-26）

分支：`fix/core-coding-chain-v2`（Task 4A）

## 变更

用户九段架构第 7/8 点要求 hermes 经 ACP 调 Ycode 且以任务 workspace 为根。核心编码链批次已接通 provider/cwd；本批封客户端侧四类越权/失真面（22 份 profile 副本与重铺源同步改）：

1. **权限应答**：`auto_approve` 也只选显式 `allow_once`；缺单次允许项或关闭 auto_approve 一律 `cancel`——删除"退 allow_always/首个选项"的旧兜底（原实现关闭自动批准仍可能放行）。
2. **客户端池**按 `(provider, 规范化 workspace)` 分键：同引擎多任务工作区互不串话；准备新会话不强杀其他键位在途客户端。
3. **providers.\<p\>.env** 注入子进程（值不进日志）；会话模型解析序=显式参数＞`ZCODE_ACP_MODEL`＞`providers.<p>.model`＞env `ZCODE_MODEL`，解析到模型即 `session/setModel`，被拒/异常即终止该次委托（fail-closed，不静默换默认模型）。
4. **写边界**：`fs/write_text_file` 与 terminal `create` 的 cwd 须落在该客户端已建会话的 workspace 根内（realpath+commonpath），越界即拒且不落盘；读路径维持原行为。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 权限只允许一次，无 allow_once 即 cancel | 委托会话按无人值守设计；永久允许与任意首选项都是越权面 | 保留首选项兜底（否决：auto_approve=false 仍放行的实锤缺陷） | 是 |
| D2 | 池键=provider+workspace，不杀邻位客户端 | 任务并行时 workspace 隔离；强杀会打断在途任务 | 仍按 provider 单例（否决：跨工作区串话） | 是 |
| D3 | setModel 失败即终止 | 换默认模型偷跑=模型证据不真；桥侧 setModel 内部走 updateRuntimeModelConfig，失败即抛，成功回执即已生效 | 失败降级继续（否决：结果不可归因） | 是 |
| D4 | 写边界=会话根集合，commonpath 判界 | ACP fs 请求无 sessionId 可绑，按客户端已建会话根集合收口为最小充分边界 | 全盘拒绝 fs 写（否决：正常编码产物需要写） | 是 |
| D5 | 重铺源 `acp-client-codex-fix__init__.py` 与现役插件字节同步，测试锁定 | apply 脚本一次回放即回退加固（历史实锤） | 只改 22 副本不改重铺源（否决：静默回退面） | 是 |

## 设计文档影响

DESIGN_SYNC: none —— 运行时插件的行为加固，整合正本 §3.2 编码委托链与全流程方案 V8.54 步 25 的既有口径（经 ACP 调 Ycode、任务 workspace 为根）不变；不新增正本事实。

## 验证

- `python3.14 -m pytest team/tests -q` → 18/18（新增 9 项加固测试先红后绿：allow_once 选择/无单次即取消/关闭即取消/写越根拒绝零落盘/terminal cwd 判界/池键/模型解析序/重铺源字节一致/22 副本一致）。
- 全部副本 `py_compile` 通过；测试不真起子进程（Popen/_send 打桩），不碰宿主目录。
- 未验证项：真实 ACP 引擎回合（coding-plan 额度 2026-10-27 02:17 重置后按 skill-roots 批口令补）；`session/setModel` 对非 zcode 桥的行为（按桥扩展协议实现，未实测他桥）。
