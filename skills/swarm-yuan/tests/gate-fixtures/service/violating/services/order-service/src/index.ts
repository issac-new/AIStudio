// 订单服务入口（违例样本）：同步调用库存服务，无分布式追踪透传
export async function createOrder(sku: string) {
  // 同步扣减库存，链路拉长易雪崩
  const stock = await fetch(`http://stock-service/stock/${sku}`);
  return { stock };
}
