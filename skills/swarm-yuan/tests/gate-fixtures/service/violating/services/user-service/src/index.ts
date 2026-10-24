// 用户服务入口（违例样本）：多处对外同步 HTTP 调用，且无 traceId 透传
export async function getUserWithOrders(id: string) {
  const user = await fetch(`http://localhost:8081/users/${id}`);
  // 同步链违例：请求内串行调用订单服务与积分服务
  const orders = await fetch(`http://order-service/orders?uid=${id}`);
  const points = await fetch(`http://point-service/points?uid=${id}`);
  return { user, orders, points };
}
