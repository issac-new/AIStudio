# Swarm-yuan 设计与实现复盘

本文写给维护者，用来决定是否合入本轮修复，以及下一轮能力投资放在哪里。基线是 `718a6cc`；结论只来自源码对照和可重复命令，静态疑点单独列为边界。

## 三个决定性发现是什么？

1. **输入在边界被改写，执法与留痕都会失真。** 宿主桥接层丢掉命令换行，规则引擎把整条复合命令当作首词规则处理；决策留痕删除控制字符，且并发写同一账本时序号重复。上游输入没有完整到达判定与记录层。修复点在 [gate-rules.sh](../../swarm-yuan/scripts/gate-rules.sh:95)、[trace-log.sh](../../swarm-yuan/assets/trace-log.sh:27) 和宿主桥接脚本。
2. **失败在多个汇合点被覆盖成成功。** 升级失败会留下混合版本；验证器的夹具准备、清理和 ShellCheck 故障能被外层成功掩盖；配置档提升后新文件和元数据不同步。共性是子过程返回码没有成为最终事实。修复点在 [generate-skill.sh](../../swarm-yuan/scripts/generate-skill.sh)（`_publish_upgrade()`）、[run-verifier.sh](../../verifier/v1/run-verifier.sh:284) 和 [run-gate-fixture.sh](../../swarm-yuan/tests/run-gate-fixture.sh:90)。
3. **恢复与提交证据缺少一致性校验。** 提交钩子读工作区正文，实际提交可能是另一份占位 spec；状态恢复接受无效阶段和被改写过的决策前缀；journal 恢复会把多个未闭合快照拼在一起。修复点在 [spec-first-lib.sh](../../swarm-yuan/assets/spec-first-lib.sh:50)、[spec-first-pre-commit.sh](../../swarm-yuan/assets/hooks/spec-first-pre-commit.sh:71) 和 [state-machine.sh](../../swarm-yuan/assets/state-machine.sh:577)。

## 排查清单完成了吗？

1. [x] 生成与升级：零依赖清单、路径符号链接、非法重写表达式、升档补文件、配置继承、复制/发布/归档/中断回滚。
2. [x] 门禁与宿主：多行命令、JSON 转义、jq/perl/awk 降级链、包装命令、未知段、提交 index 正文。
3. [x] 验证体系：ShellCheck 错误传播、框架夹具正反例、hook setup/teardown、golden 重建、日志隔离。
4. [x] 成长与留痕：journal 最后完整快照、checkpoint 前缀校验、恢复前备份、决策并发与链校验。
5. [x] 设计一致性：升级、拦截、验证、恢复的能力与边界已同步到 [README.md](../../swarm-yuan/README.md:143) 和 [usage-manual.md](../../docs/usage-manual.md:402)。
6. [x] 收尾：先红后绿回归、Bash 3.2、ShellCheck、`git diff --check`、self-check、全量 sweep。

## 复现结果如何从红变绿？

| 反馈环 | 修复前 | 修复后 |
|---|---|---|
| `bash swarm-yuan/tests/test-trace-reliability.sh` | 14 项中 11 项失败：缺参数挂起、JSON 控制字符非法、12 并发只留 7 个序号、链中旧格式掩盖删除 | 14/14 通过 |
| `bash swarm-yuan/tests/test-state-recovery.sh` | 9 项中 6 项失败：混合 journal、无效阶段写入、无恢复备份、前缀漂移放行 | 9/9 通过 |
| `bash swarm-yuan/tests/test-hook-contracts.sh` | 基线 `718a6cc` 仅 10/34 通过 | 34/34 通过 |
| `bash swarm-yuan/tests/test-verifier-reliability.sh` | 初版 26 项中 11 通过 / 15 失败；扩展后覆盖空夹具集 0/0 通过 | 41/41 通过 |
| `bash swarm-yuan/tests/test-generator-reliability.sh` | 零依赖清单崩溃、升档缺文件、失败留混合版本 | 39/39 通过 |

决策并发复现使用 12 个真实 CLI 写入。修复前账本有重复 `seq` 且 `--verify-chain` 返回 1；修复后 12 行序号为 1-12，全部写入返回 0，链校验返回 0。

## 本轮改变了哪些能力？

- 升级改为同文件系统暂存副本，成功后发布完整目录并归档原件；失败恢复原目录。显式升档同步 `profile`、补齐分层配置与宿主文件，并把状态回到 draft；同档升级保留 active 和用户正文。生成器待写路径拒绝符号链接，包括临时索引文件。
- 规则引擎按换行、`;`、`|`、`&&` 拆分命令，保留引号与转义；包装命令归一后递归求值，未知段为 prompt，最终取最严。宿主桥接保留完整多行命令和路径，deny 与审计输出合法 JSON。
- 提交钩子从 Git index 读取候选 spec 与批准正文，避免未暂存批准掩盖实际提交的占位文件，也尊重暂存撤回批准。
- 验证器直接复用框架夹具执行器，机器模式输出三个整数；夹具准备、清理、ShellCheck 错误、工具缺失和夹具集意外为空都会计入整体失败。失败日志目录按运行隔离。
- 决策写入用目录锁串行化，JSON 按字节转义控制字符；链校验拒绝链中旧格式记录和首行删除。状态恢复先校验快照和决策前缀，再备份并替换。

## 哪些边界仍然不能宣称？

- 规则引擎仍是有限词法分析器，不是完整 Shell 解释器或沙箱；本轮没有做宿主产品活体测试。
- `cksum` 只能发现意外漂移，不是密码学防篡改；没有外部可信锚时，整链重写或末尾截断不可检出。`ref_trace_hash` 只是引用记录，当前没有跨账本自动核验。
- 升级回滚覆盖复制、发布、归档和 TERM 窗口；SIGKILL、断电和跨文件系统迁移不在 shell trap 的保证范围内。
- 独立审查子代理两次被本地模型服务额度错误中断。主会话完成了逐块 diff 审查，并用新增行为测试和全量回归验收；这不能等同于一次独立模型审查。

## 最终验收是什么？

在 Bash 3.2.57 上执行：

```bash
bash swarm-yuan/tests/run-sweep.sh
```

结果：`81 通过 / 0 失败`，包含 76 个锁定测试、3 条端到端链路、verifier all 和 self-check。`bash swarm-yuan/scripts/self-check.sh --check-only` 单独执行也通过；`git diff --check` 无输出。全量结果对应包含临时索引防线与空夹具防线的最终代码。
