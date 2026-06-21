// overlay/registries/server/entry.mts
// server 入口。
//
// 关键约束(已在阶段 3A 调研确认):上游 bootstrap() 是内联闭包,创建 Koa app、
// 在函数体内 app.use(...) 挂全部中间件/路由、自行 listen,且不返回 app/server。
// 因此 server 端所有"必须在 bootstrap 内部挂载"的改动(element-web 静态服务、
// matrix 路由等)已作为 B 类 patch(008-server-index-element-web-middleware.patch)
// 直接作用于上游 index.ts,而非运行时注册。
//
// 本 shim 的职责:运行可选的 server A 类注册(若有可在 listen 后挂载的路由),
// 然后让上游 index.ts 的顶层 bootstrap() 执行。
// 当前无此类 server A 类(全部 server 改动已归入 patch 或 custom/server 的独立模块),
// 故本 shim 仅 re-export 上游,保持入口统一以备后续扩展。
import '../../../upstream/hermes-studio/packages/server/src/index'
