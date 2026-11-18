# 2026-11-18 run31 复盘收编与产品债批（收编＋kanban 读面＋token 真值口径＋N32-7 复核）

## 变更

run31 复盘 N32 台账的收编与产品债清偿四件：
1. **值守手术收编**：探针 earned-autonomy 403/409 双合法判据（mx-capability-probes.mjs:549 区）正本化提交。**patches/ 五枚重造补丁（586/593/599/609/723）经重放验证后丢弃**——run31 值守按 SIM 树重造的补丁与基线 vendor 树不匹配（586 inject 实测失败）；原补丁在基线上一直正常，SIM 树冲突是「半应用态」问题非补丁缺陷，收编应为「保留原补丁」而非重造。教训另录：**B 类补丁必须在注入后终态树上 diff**（含全部前置补丁态），按 pristine 生成必然上下文不匹配（793 四轮返工实证：reasoning_effort/raci 前置行缺失）。
2. **kanban 读面扩列（N32-6，补丁 793）**：`_TASK_DICT_FIELDS` 增 `version`/`verification` 两列——批二 CAS 写面有锁读面无钥的断点根治，REST 客户端可构造 expected_version；探针组 17 正例解锁。
3. **token 真值口径（N32-1 改判）**：原立项「usage 持久化补丁」经源码对账**证伪不必要**——`session_model_usage` 表一直有 provider 回报的完整真值（turn_usage.py:264 queue_token_counts 持久化全参数）；原判「无任何 usage 落盘」系误读 messages.token_count 空列。token-meter.py 改读 session_model_usage（API 计费口径），转录级估算口径退役（input 高估约 2.3 倍实测）。run31 终值真值：**4065 次调用／input 18.84M／output 4.77M／cache_read 197.77M／成本 $0（included）**。
4. **N32-7 复核定谳**：g5_supplement＝「补过记账」（GAP/TODO 分节残留判 PASS 不计首过，aipay-scenario.sh:2193-2205），语义合规；G2 缺位下 G5 放行的真因＝断点跳段（N32-3 已立项），本项归并 N32-3 关闭，不新增机制。

## 决策记录

- **Mechanical·N32-1 改判**：以源码实测替代预设——usage 持久化机制本在（turn_usage.py:258-282 全参数落库），无需新补丁；统计口径换真值源即可。run31 复盘报告中的「转录级估算 198M」数字以本批真值（input 18.84M/output 4.77M）为准，spec §一.C 标注。
- **Mechanical·N32-7 归并**：supplement 语义合规，G2 前置约束由断点定位修复（N32-3）兜底，不另立机制。
- **Mechanical·补丁 793 走标准 B 类通道**：series 尾 792→793，vendor 注入态 diff 存补丁＋还原＋登记。

## 验证

- 补丁 793：`_TASK_DICT_FIELDS` 含 version/verification 断言过（import 实测）；`npm run inject` 重放验证。
- token-meter：session_model_usage 真值全量输出（4065 调用全 profile 聚合）；run31 终值与转录估算对照存档。
- 收编五补丁：反向验证（run31 值守时已实测，本批重放复核）。
- 全量 `bash simharness/tests/run-gates.sh`（探针改动面）。

## 设计文档影响

DESIGN_SYNC: none——收编与 harness/产品债清偿，不触整合正本与数字总账（§A/§C 无稳定参数变更；N32-1 为口径更正非新机制）。
