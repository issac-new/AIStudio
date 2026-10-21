# FIBO 单一事实源合并与全链收编

- 日期:2026-10-21
- 分支:`feat/fibo-ssot`(overlay 仓)
- 触发:用户令「做全链收编,合成单一事实源」
- 一句话:两条 FIBO 线(qgate 语义门实锚轮 / studio 工作台映射层)收敛为单一事实源——正本=`ontology-fibo.ts`(37 概念),qgate 索引变为派生产物(同步脚本+一致性守门测试防漂移),收敛 main 分叉、换装 serve-main、活体探活。

## 1. 背景

同日两条并行线各自落地:

| 线 | 载体 | 交付物 | 状态 |
|---|---|---|---|
| qgate 实锚轮 | `feat/fibo-ontology-calibration` | fibo-mini.json 18 概念真 IRI(已合 origin/main d458d6d8) | 已推 |
| studio 映射层 | `feat/fibo-ontology-studio` | ontology-fibo.ts 36 概念包+工作台页签(已合本地 main de715d3c) | 未推 |

studio 线 spec 的「后续」节明确:合并单一事实源需另起一轮,先解决两个消费方的字段裁剪规则。三处已登记的口径分歧:Commons Identifier 措辞、Transaction 兜底锚、概念计数。本地/远端 main 互缺对方提交,serve-main 钉旧提交,活体无 FIBO 能力。

## 2. 决策记录

1. **正本选定 ontology-fibo.ts,方向=服务端 TS 为源、qgate JSON 为派生**。理由:studio 包数据更全(36>18,含对象属性/公理/出处六项),且其模型(iri+provenance 字段)是 qgate 投影的超集;反向(qgate JSON 为源)装不下出处与公理。维持 OD-004(无运行时 RDF)。
2. **派生机制=投影函数+同步脚本+守门测试三件套**:`fiboQgateIndex()` 把 ConceptDef 裁剪为 qgate 的 OntologyConcept 形状;`npm run fibo:sync`(scripts/fibo/sync-qgate-index.ts,经 tsx 解析无扩展名 import)再生 fibo-mini.json;`ontology-fibo-ssot.test.ts` 逐字节对账两侧——改正本不跑 sync=红,手改派生 JSON=红。模板↔产物双向同步纪律(验证门禁 §5.5)落成。
3. **字段裁剪规则**(分歧的裁决):id=`fibo-`+kebab(概念 id);label=概念 id(PascalCase);aliases=[labelZh,label,...aliases] 去重;iri=fibo/commons 带真实 IRI、local-extension 省略(无锚不冒充);source 按 origin 三档映射('FIBO <path> (<maturity>)'/'OMG Commons <path>'/'engineering-approximation');definition=defZh+(原文:defEn)+note。
4. **概念并集=37**:studio 36 ∪ qgate 18 = 36+1——qgate 侧 17 个已被 studio 包覆盖,唯一新增 `TransactionEvent`(FND/ProductsAndServices/ProductsAndServices,Release,versionIri 20251201,定义原文实测)。**Transaction 分歧裁决**:FND 泛化锚=TransactionEvent(进正本),账户流水级=IndividualTransaction(已在),市场语境=MarketTransaction(已在)——三个粒度各自在册、互不冒充,qgate 的「交易」别名指向 TransactionEvent。
5. **Identifier 措辞分歧裁决**:统一用 OMG Commons 英文原文("sequence of characters uniquely identifying that with which it is associated"),两侧已一致,无改动。
6. **概念计数分歧随并集自然消解**:37(33 FIBO+2 Commons+2 工程扩展);两侧测试计数断言同步更新(ontology-fibo/controller/view 测试 36→37、fibo 32→33;qgate 18→37、锚定 16→35)。
7. **distinctFrom/aliases 升格为正本字段**:ConceptDef 增加两个可选字段,qgate 歧义检测的语义数据从派生侧上移到正本——两消费方共享同一份互斥关系与别名。
8. **qgate 侧 id 三个更名**(kebab 规则的自然结果):fibo-obligation→fibo-duty、fibo-status→fibo-lifecycle-status、fibo-transaction→fibo-transaction-event。下游映射(README 示例用 fibo-capture/fibo-payment)不受影响;如外部有引用旧 id 的 qgate.yaml mappings 需随更名(如实登记)。
9. **收敛路径**:临时 worktree 自本地 main(7be50357)merge origin/main(d458d6d8)建统一基(零冲突,两线文件不相交),SSOT 改动在其上成支,`--no-ff` 合并后推 HEAD:main。
10. **换装路径**:serve-main `git reset --hard <新main>`(detached 无碰)+主树 `.overlay-injected.json` 同步+`--config-only` 重生成 vite 配置(烙印 serve-main)+`ln -sfn` 重链 custom 符号链接+双端重启(8647 须 OVERLAY_UPSTREAM_ROOT;kill 前重 lsof)。ts-node 冷编译约 50s 勿早判死。

## 3. 改动清单

| 文件 | 变更 |
|---|---|
| `custom/server/ontology/ontology-fibo.ts` | +pas 模块注册;ConceptDef +aliases/distinctFrom;+TransactionEvent 概念;13 个概念挂 distinctFrom/aliases;+`fiboQgateIndex()` 投影(约 +120 行) |
| `scripts/fibo/sync-qgate-index.ts` | 新增:SSOT 同步脚本 |
| `package.json` | +`fibo:sync` 脚本(npx -y tsx) |
| `custom/qgate/gate-packs/ontology/data/fibo-mini.json` | 再生:18→37 概念(SSOT 派生产物) |
| `custom/server/ontology/__tests__/ontology-fibo-ssot.test.ts` | 新增:一致性守门 5 用例(逐字节对账/结构/锚定纪律/TransactionEvent/约束) |
| 三个既有测试文件 | 计数断言 36→37、fibo 32→33 |
| `custom/qgate/__tests__/qgate-p5-p9.test.ts` | 18→37、锚定 16→35、+TransactionEvent 断言 |
| `custom/qgate/README.md` | SSOT 说明(正本位置/sync 命令/守门测试) |

## 4. 验证

- 根 vitest:`custom/server/ontology` + `custom/client/ontology`(含新增 SSOT 守门 5 例)
- qgate 包:`cd custom/qgate && npm test`(全量;高负载窗 5s 默认超时会滚动假红,判定跑加 `--testTimeout=30000`)
- 活体:换装后 8647 `/health` 200 + JWT 探 `/api/hermes/ontology/fibo`(spec 摘要在册)

## 5. 边界(不做的,如实登记)

- 不做运行时 RDF/OWL 推理(OD-004 不变);正本仍是预处理 T-Box
- 并行会话 `feat/ontology-fibo-reference` 在途(15:31 开工,方向未明),若其改动 ontology-fibo.ts 数据面,合并时以本正本为基 rebase
- qgate 是独立包,派生 JSON 是其发行形态(不强求运行时跨包 import);防漂移靠守门测试而非共享模块
