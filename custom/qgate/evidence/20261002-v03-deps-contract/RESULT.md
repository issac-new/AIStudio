# 依赖借用契约显式化轮 执行结果

日期：2026-10-02
指令：用户"继续"（收口上轮记档的"overlay 幽灵依赖声明化"）

## 一、定性反转（盘点结论）

overlay/node_modules 是指向 upstream/hermes-studio/node_modules 的**符号链**——
2844 条"未解析"实为借用架构：依赖声明单一事实源在上游 package.json（devDependencies
100 包，含 vue/pinia/vitest/typescript/cross-env 全家）。**抄声明到 overlay 反而制造
双事实源与版本分叉**。正确根治 = 借用契约显式化 + 机器核验。

## 二、落地（main 多次增量合并）

| 项 | 内容 |
|---|---|
| symbols depsFile | 依赖清单可指向上游（借用显式指认）；指认清单缺失 → error（链接架构漂移是异常） |
| overlay 项目门 | depsFile 指上游 package.json + @/custom、@custom alias 映射 + '@/''（上游源码）与 '../../../'（仓外）豁免 + d3-force/@intlify（上游传递依赖借用留痕） |
| package.json 契约注释 | `//deps-borrow` 字段记录符号链事实与勿双声明纪律 |
| ia2 守门再豁免 | 并行会话新形态 adoptLegacySetting(oldKey,newKey)（键收养调用，两参数均存储键） |

## 三、symbols 实用化五修（2844 → 197，噪声 93% 清除）

1. scoped 包裸名取前两段（'@vue/test-utils' 曾被切成 '@vue'——正统 bug）
2. alias 产物按仓根解析（不随引用者目录漂移）
3. TS NodeNext .js→.ts 重映射（import './x.js' 实指 x.ts）+ 资产 import 跳过（.scss 等）
4. import/require 行首锚定 + require 收紧（模板串/注释里的伪 import 不再误抓）
5. 成员对账跳过内联 type 修饰符（import { type X }——类型成员不进运行时导出面）

剩余 197 = 真实长尾：playwright/@vue/compiler-sfc（上游未声明传递依赖，上游仓职责）、
~86 条成员对账长尾（export 抽象的词法边界）。advisory CONDITIONAL 如实呈现。

## 四、rawOutput 交叉核验的边界案例（意外收获）

engineering.basic-check：exit 1 + 内核重算 junit **3579 total/3578 passed/0 failed** ——
vitest 因 unhandled error（ChatBridge 出向 matrix 偶发 HTTP 500，主树既有环境性偶发）
退出 1 但不进 testcase 统计。退出码与报告双通道交叉逮住"报告绿但进程报错"。
advisory 放行符合设计。

## 五、验证

qgate 154/154；主树相邻面 19/19（ia2+qgate-bridge+governance）；
主树全量 3579 用例 0 failed（1 skipped）；tsc 零错。

## 六、坑（记档）

- python replace 锚不匹配时静默无改但仍 print ok（假绿）——门文件 '../../../' 豁免
  曾因此未入档，改用 Edit 工具后真入档；多文件 heredoc 一律 Edit。
- §49 缓存如实复用失败证据（网络偶发失败后 48s 内重跑命中缓存），清 cache 重跑即恢复。
