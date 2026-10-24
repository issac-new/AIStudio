// 用户服务入口（合规样本）：对外调用透传 traceId，实现分布式追踪
export async function getUser(id: string, traceId: string) {
  return fetch(`http://localhost:8081/users/${id}`, {
    headers: { 'x-trace-id': traceId },
  });
}
