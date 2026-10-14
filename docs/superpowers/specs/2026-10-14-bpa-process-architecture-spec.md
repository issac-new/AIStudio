# 流程架构工作台（BPA Studio）设计

- 日期：2026-10-14
- 来源：调研《企业级流程架构方法论》（流程智能化公众号，AI4BPM，2026-10-13）——APQC PCF 五级分级、O/MS·MOS·POS·OES 四种流程地图构图法、华为 L1-L6 分层分级实践、PEMM 成熟度模型、治理硬约束骨架
- 路由：`/app/bpa`（`ia2.bpa`），特性开关 `bpa`（默认开，`VITE_CUSTOM_BPA=false` 关）
- 定位：给 SwarmStudio 补上「研发过程本身也是一套企业流程」的结构化治理面——用行业标准方法论描述多智能体协作的过程资产，与本体工作台（术语治理）、技能治理（能力治理）并列为过程治理三件套

## 一、要解决的问题（对齐文章五坑）

1. 同一件事叫法不一 → 统一编号 + 统一命名（L1-L6 编码字典）
2. 流程散落不成体系 → 架构清单（单一事实源树）
3. 不知道缺什么 → 流程地图（OES/POS 一张图全量对照）+ 治理体检（断链/缺项显式化）
4. 责任落不下去 → Owner/KPI 逐级落位（L1-L3 强制）
5. 数字化没有地基 → 流程架构作为任务拆解/派发/评估的上游字典（后续可被任务工厂/评估域消费）

## 二、四页签

1. **架构清单**：L1-L6 层级树（PCF 六级，华为 L1-L6 兼容），节点字段=编号/名称/层级/分区/Owner/KPI/输入输出/驱动支撑引用/分解逻辑标注（生命周期法/PDCA/功能分解/场景分解）。增删改、子节点追加。
2. **流程地图**：一张图按构图法分区（O/MS 二分、MOS 三分、POS 三分、OES 三分可切换），L1 卡片入区，卡内列 L2 流程组。分区只是构图维度，不进入分级清单（文章关键认知：分类法管「图怎么画」，分级法管「层级怎么搭」，两条线并行）。
3. **治理体检**：把文章第八节「启动校验器」产品化为交互面——规则可配置，违规项分级呈现（高危/注意）。规则：缺 Owner（L1-L3）/缺 KPI（L3）/断链孤岛（L3 无任何输入输出与驱动支撑）/超深（>maxDepth）/跨级（父子层级不连号）/编号非法/分区缺失或非法/引用悬空。治理参数：maxDepth、forbidSkippingLevel、requireEndToEnd、requireL3Owner、requireL3Kpi、reviewCycleDays、framework。
4. **成熟度评估**：PEMM 自评——5 个流程能动因素（设计/员工/所有者/基础设施/指标）× 4 种企业能力（领导力/文化/专业技能/治理），各按 P0-P4 打分；短板决定论（总体=最低分因素）；历史留痕可对比变革前后。

## 三、数据模型

存储：纯文件面（skillgov 同款）`~/.hermes-web-ui/overlay/bpa-architecture.json`（env `BPA_STORE` 覆盖）+ `bpa-maturity.json`。fail-soft 读、原子写。

```ts
interface BpaNode {
  id: string          // ^L[1-6](-[0-9]{2}){level-1}$，如 L3-06-02-01
  name: string
  level: 1|2|3|4|5|6
  parentId: string | null
  section?: 'OPERATING'|'ENABLING'|'SUPPORTING'|'MANAGING'  // 仅 L1（OES/POS/MOS 分区）
  owner?: string
  kpis?: { name: string; target: string; unit?: string }[]  // L3 治理主战场
  inputs?: string[]; outputs?: string[]     // 输入输出衔接（系统/表单/单据）
  drivers?: string[]; supports?: string[]   // L3 间引用：谁驱动我 / 我支撑谁
  decomposition?: 'lifecycle'|'pdca'|'functional'|'scenario'
  note?: string
  updatedAt: number
}
```

API（`/api/bpa/*`）：
- `GET /architecture` 全树+配置+体检报告
- `PUT /node` upsert（编号/层级/父子关系校验）、`DELETE /node/:id`（级联删子孙）
- `PUT /config` 治理参数
- `POST /validate` 立即体检
- `POST /seed` 载入示例（SwarmStudio 自身研发交付流程的示范架构，可反复覆盖）
- `GET/POST /maturity` PEMM 评估历史/提交（历史截尾 50 条）

## 四、验收线

- 服务端单测：store 读写+种子、validate 八规则、maturity 计分全绿
- 客户端单测：i18n zh/en 键齐平 + DTO 形状
- inject 351→352 补丁零失败；vitest 全量零回归
- `npm run dev` 浏览器走查：/app/bpa 四页签可用、种子载入、体检出违规、PEMM 打分出短板

## 五、不做（本轮边界）

- 不做 BPMN 流程图绘制（架构≠流程图，文章明言 BPA 是结构化描述体系）
- 不做与任务工厂/评估域的自动联动（留作后续消费方，本域先当字典）
- 流程地图不引入图可视化库（CSS 分区网格表达构图法语义，足够且零依赖）

## 六、第二轮增补（2026-10-14 同日）：链路/对标/落地

补全文章尚未产品化的三块（六页签形态：清单/地图/链路/对标/治理/成熟度）：

1. **端到端链路（`/api/bpa/e2e` + 链路页签）**：三要素之末「流程间关系」——L3 关系图（echarts 定向布局：箭头=驱动/支撑方向、节点色=L1 分区）+ 端到端路径枚举（起点=无上游、终点=无下游、supports/drivers 双视图合并去重、深度≤12 路径≤60）+ 逐跳交接物（output→input 匹配，缺交接物显式标注）+ 孤岛/断头/环路三态检测（三色标记环检测；链路归属按邻接度数判，不看单节点字段）。
2. **PCF 对标（`/api/bpa/pcf` + 对标页签）**：内置 APQC PCF 跨行业 12 分类参照（编号/中英名/代表 L2/分区对应）；对标差距=显式 pcfRef 映射优先（L1 编辑器可设）+ 名称启发兜底（by 来源标注）；差距清单+未映射自留域双向呈现。
3. **落地五步法 + 五大误区（对标页签内）**：五步判据全部实时取自当前架构与评估历史（活状态非文档清单：s1=有 L3、s2=构图法已选、s3=Owner 100%、s4=KPI 100%+链路零孤岛、s5=PEMM≥1 轮），未完成步给「去处理」直达跳转；五误区卡对应各页签的量化哨。

种子示例升级：6 个 L1 带显式 pcfRef（覆盖 6/12，余 6 类留作真实差距演示）。测试 +12（e2e 6 + pcf 5 + 客户端结构 1）全绿；服务端 bpa 域累计 29 测试。

## 七、第三轮增补（2026-10-14 同日）：闭环与交付面

1. **体检留痕与评审周期**（bpa-audit + 治理页）：每次手动体检与写操作（node/config/seed）自动落账（时间/高危/注意/双覆盖率/触发源，留尾 50）；沉睡的 `reviewCycleDays` 变活约束——「距上次体检 N 天 · 距到期 M 天 / 已逾期 K 天」横幅（无基线态有引导语）；v-show 页签进入时刷新（active 联动）。
2. **PEMM 可视化**（成熟度页）：9 因素能力雷达（P0-P4 现值）+ 成熟度趋势线（各轮总体=短板决定，文章 PEMM 应用场景②「变革前后测评对比」落地）。
3. **架构报告导出**（bpa-export + 治理页按钮）：自包含 Markdown 六账——分级清单全字段表/流程地图分区树/八规则体检结论/端到端链路含交接物/PCF 对标差距/PEMM 最近评估；`GET /api/bpa/export`（attachment 下载，带鉴权）。

测试 +5（audit 留痕/截尾/到期判定 + export 六账锚点/空态）全绿；bpa 域累计 38。走查 8/8（雷达/趋势线/评审横幅/留痕追加/导出 3523B 六账）。
