# 2026-11-05 G4 能力探测 profile 指向修复（SIM 无 default 档假设脱钩）

## 变更

- `simharness/aipay-scenario.sh` G4 段探测调用：`--profile default` → `--profile fanfan`（一行）。run27 现场已换 inode 热修生效（20:47 实证 37/37 全绿、g4_pass 落键），本 spec 为收编登记。

## 决策记录

- 根因（run27 实锤两轮 G4 楔子）：`mx-capability-probes.mjs` userenv 组探测按 `--profile` 参数打档位端点，场景脚本写死 `default`——脚本注释假设「SIM 与测试夹具均有该档」，但 SIM 42 档（arch/bella/…/xiao）无 default，端点 404「不在档」先于语义判定，userenv 组 2/37 红钉死 `g4_capability_blocked`。与 20:08 网关 fd 耗尽事故叠加造成「探测失败→testpass_done 冻结→g4_pass 未置→ready 硬闸秒败」无限重试环（首轮为环境假阴性 fetch failed，二轮为 profile 指向缺陷）。
- 选 `fanfan` 而非建 default 档：探测 token 即 `jwt_of fanfan`（同属主权限一致，避免跨档权限面）；42 档任一真实档均可，不为此新建空档（SIM 档位=推演角色，default 无角色语义）。
- 契约不变：探针脚本 `--profile` 参数本就存在（缺省 default 服务测试夹具），只改调用侧实参。
- 状态键手术两次（清 `testpass_done`/`g4_capability_blocked`/`capture_fail_streak`/`g4_evidence_gap`）为运维配方非本 spec 范畴；楔子产品化（瞬态失败不应永久冻结检查点）挂账晨间批。

## 验证

- 手动重跑：`node mux/mx-capability-probes.mjs --base http://127.0.0.1:8802 --out /tmp/cap-verify --profile fanfan --token $(jwt_of fanfan)` → **37/37 passed**。
- 热修后驱动实证：20:47:58 重进段→报告真值秒过（已在库）→契约 ✓→探测 37/37 全绿落 `evidence/capability-probes.json` 正身→**g4_pass=1793882905（20:48:25）落键**→G5 评审卡 t_07fac1cc 派发。
- `bash -n aipay-scenario.sh` 语法门过。

## 设计文档影响

DESIGN_SYNC: none——驱动 G4 段调用参数修正（探针 profile 实参），探测契约与 §5.11 准出规则未变；理由=参数指向错误修正不触整合正本与数字总账。
