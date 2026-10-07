// overlay[eval] Eval Studio · 公共面（M1：store/judge/aggregate/runner/outcome/controller）。
//
// 设计正本：docs/superpowers/specs/2026-10-07-eval-studio-design.md
// 范式来源：《美团 Agent 评测体系技术拆解》（8 条工程启示，全文见 spec assets）。
//
// 使用纪律：
//   - 本域不 import 上游模块（符号链接路径陷阱）；全部依赖注入可测；
//   - 判定端 mock 纪律：单测不得依赖真端点存活（toolresultguard 当晚教训）；
//   - Efficiency 同源取数（trace/run_usage 口径），禁止另起炉灶。
export * from './types'
export * from './store'
export * from './clef'
export * from './judge'
export * from './aggregate'
export * from './outcome'
export * from './runner'
export { evalRoutes } from './controller'
