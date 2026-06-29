// overlay/registries/server/bootstrap.ts
// server 端 A 类调度。当前无 server A 类(全部经 patch 或 custom/server 处理),
// 保留骨架以备后续可在 listen 后挂载的路由扩展。
export async function bootstrapServer(): Promise<void> {
  // 预留:若后续有 server A 类路由(不依赖 bootstrap 内部 app),在此调度。
}
