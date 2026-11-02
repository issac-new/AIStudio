# 2026-11-02 场景脚本 _sens 重放路径 unbound 修复

## 变更

`simharness/aipay-scenario.sh:1091`：G2 安全前置硬校验的 `printf '%s' "$_sens"` 改 `printf '%s' "${_sens:-}"`＋注释说明。守门断言一枚（harness-gate-integrity：锁 `${_sens:-}` 写法防回退）。

## 决策记录

- run25 四启实录（21:55:04）：supervisor 重启的驱动走重放路径，`security_review_done=1` 在位时跳过 :845 的 `_sens` 赋值块，`set -u` 下 line 1091 报 `unbound variable`。本轮实测非致命（bash 在该 if 条件上下文未中止、驱动继续过闸判定），但行为随 bash 版本/上下文漂移，属重放路径确定性缺陷。
- 修法取默认空而非重放时重新赋值：freeze.md 自 G1 后不变，重放时 `_sens` 语义恒定；空值经 grep 必不中豁免分支（fail-closed 方向正确），且第二条件 `security_review_done` 在位即短路——重放零副作用，最小侵入。

## 验证

- `bash -n` 语法门过；`npx vitest run tests/harness-gate-integrity.test.ts` 128/128（含新断言）。

## 设计文档影响

DESIGN_SYNC: none——单行重放路径缺陷修复，闸门判据语义零变化。
