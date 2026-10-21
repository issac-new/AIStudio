# FIBO 运营手册

- 日期：2026-10-21
- 适用：SwarmStudio 本体工作台与治理语义体检的 FIBO 映射层
- 正本方案：《2026-10-21-fibo-product-rollout-plan.md》
- 维护人：本体工作台值班员；季度升级由产品负责人复核

## 1. 日常巡检

每天看一次治理语义体检的 FIBO 运营条，确认四件事：

1. 版本锁显示 OK，没有漂移。
2. 覆盖度符合预期：导入后 37/37；未导入时显示 0/37 并提示可导入。
3. 数据源映射至少 20 条 mapped；新增未映射概念有原因。
4. 语义门显示 37 概念，字段脱敏显示 2 条试点策略。

命令行巡检：

```bash
curl -s http://127.0.0.1:8647/api/hermes/ontology/fibo/ops | python3 -m json.tool
```

关注 `ops.lock.ok`、`ops.evidence.coverage`、`ops.mappings`、`ops.gate`、`ops.permissions`。任何一项为空，先查服务是否加载了当前 main。

## 2. 季度升级

FIBO 每季度发布。升级只做四步，任何一步失败都停下。

### 2.1 查漂移

```bash
node scripts/fibo/check-upstream.mjs
```

退出码 0 表示同版本；1 表示有漂移；2 表示网络或解析失败。漂移时脚本会打印五步清单。

### 2.2 更新锁与包

1. 下载目标 tag 的受影响模块 RDF，逐模块校验 `owl:versionIRI` 与 `hasMaturityLevel`。
2. 更新 `custom/server/ontology/ontology-fibo-lock.ts` 的 tag、commit、releasedAt、modules。
3. 更新 `custom/server/ontology/ontology-fibo.ts` 的 `FIBO_SOURCE` 与 `FIBO_MODULES`；概念 IRI 有变化时同步改概念表。
4. 不把 Provisional/Informative 模块当作 Release 引用；成熟度原样保留。

### 2.3 跑守门

```bash
npx vitest run custom/server/ontology custom/client/ontology \
  custom/server/governance/__tests__/governance-ontology.test.ts \
  custom/client/ia2/__tests__/gov-ontology-fibo.test.ts \
  custom/client/ide/__tests__/mention-resolution.test.ts \
  custom/qgate/__tests__/qgate-p5-p9.test.ts
```

必须全绿，且 `ontology-fibo-lock.test.ts`（在 `ontology-fibo-p1.test.ts` 内）零漂移。qgate 一致性测试若因概念增删亮红，先跑 `npm run fibo:sync` 再生索引，再跑守门测试。

### 2.4 出证据并合并

```bash
curl -s http://127.0.0.1:8647/api/hermes/ontology/fibo/evidence | python3 -m json.tool
```

把返回的 `evidence.markdown` 贴进升级记录，写明新旧 tag、commit、模块 diff。人工确认后再合并到 main。

## 3. 报告证据

报告侧只消费证据端点，不自算覆盖率。

- `GET /api/hermes/ontology/fibo/evidence` 返回发布版本、覆盖度、三档健康度、版本锁、门禁引用与 `markdown`。
- 治理卡「复制报告证据」按钮复制同一段 markdown。
- 未导入时写「未导入（可导入 37 个概念）」，不写 0/37。
- simharness 报告生成器的接入由其仓另开；本节只定义契约。

## 4. 字段级脱敏试点

当前策略两条：

| 类型 | 字段 | 可见角色 |
|---|---|---|
| Account | accountNumber | super_admin、admin |
| Payer | partyRef | super_admin、admin |

- 读时脱敏，不改存储；`GET /instances` 响应带 `redacted` 与 `redactedFields`。
- 本地无鉴权上下文视为管理上下文，与 `superAdminDenied` 同语义。
- 扩展新字段：在 `custom/server/ontology/ontology-field-policy.ts` 增加一条策略，补一个 HTTP 测试，再更新本表。
- 不要在前端做脱敏；前端只显示服务端返回值。

## 5. 导出给外部工具

```bash
node scripts/fibo/export.mjs --format jsonld --out fibo.jsonld
node scripts/fibo/export.mjs --format shacl --out fibo-shapes.jsonld
node scripts/fibo/export.mjs --format turtle --out fibo.ttl
```

- 默认服务地址 `http://127.0.0.1:8647`，可用 `--base` 或 `ONTOLOGY_BASE_URL` 覆盖。
- 需要鉴权时用 `--token` 或 `ONTOLOGY_API_TOKEN`。
- 导出的 SHACL 可交给 pyshacl，JSON-LD/Turtle 可交给 rdflib、Jena。
- 本产品不内嵌推理机，不提供 SPARQL 端点。

## 6. 回滚

三种情况，三种回法：

1. 只回本体 spec：`POST /api/hermes/ontology/rollback`，body 用 `GET /versions` 里的 `ts`；回滚前系统另存 pre-rollback。
2. 回代码：在 main 上 revert 对应 merge commit，重新跑第 2.3 节守门。
3. 回实例：支付样例用 `POST /fibo/ingest-demo` 重跑会按 `fibo:` 前缀替换；要清空则按前缀删除后再跑，或从 `ONTOLOGY_DIR/instances.json` 快照恢复。

不直接编辑 `~/.hermes/semantica/ontology/` 下的 JSON；走端点写，保证校验与快照。

## 7. 部署与探活

1. 把服务载体切到集成 main，按现有 serve-main 流程重启后台服务。
2. 探活三条：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8647/api/hermes/ontology/fibo
curl -s http://127.0.0.1:8647/api/hermes/ontology/fibo/ops | python3 -m json.tool
curl -s http://127.0.0.1:8647/api/ontology/agent-bridge/fibo?q=Payment
```

第三条需要回环；若设置了 `ONTOLOGY_BRIDGE_TOKEN`，加 `-H 'x-ontology-bridge-token: <token>'`。

3. 浏览器打开 `/app/board` 的语义体检页，确认运营条与两个动作可见。前端热更新走 `npm run dev`（8649），后端走 8647 代理。

## 8. 常见故障

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 治理卡显示运营快照不可用 | 服务未加载当前 main，或端点 404 | 确认服务载体与探活；重启 |
| agent 查询 401 | 设置了桥令牌但请求没带 | 加 `x-ontology-bridge-token` |
| 导入返回 409 | 本地已有同 id 不同 IRI 的术语 | 人工裁决；不强行覆盖 |
| 支付样例 422 | 批次有 error 级违规 | 看 `violations` 的 `path` 与 `detail`，修样例或本体，不跳过校验 |
| 版本锁 DRIFT | 包与锁文件不一致 | 跑 `check-upstream.mjs`，按第 2 节更新 |
| 语义门 finding 增多 | 文档混用 captured/settled | 按判词语义统一用词；门是 warning，不阻断 |

## 9. 边界

- 不做全量 FIBO 导入，不做 OWL DL 推理，不做 SPARQL。
- SEC/DER/LOAN 只有只读目录，不是可导入包。
- 报告生成器不在本仓，证据接入由其仓另开。
- 季度升级必须人工确认，脚本只做只读比对。
