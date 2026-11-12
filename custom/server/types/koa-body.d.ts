// Koa Request.body 类型增强（2026-11-12 typecheck 全目录收口）：
// bodyparser 中间件在 vendor 装配侧加载，custom/server 编译面此前从未 import 过
// '@koa/bodyparser'，其自带的 declare module 'koa' Request 增强（body/rawBody）
// 不生效，全目录 150 处 ctx.request.body TS2339 由此消除。
// 此处只做 side-effect import 复用上游增强，不自写声明——两处声明 body 类型不同会 TS2717。
import '@koa/bodyparser'
