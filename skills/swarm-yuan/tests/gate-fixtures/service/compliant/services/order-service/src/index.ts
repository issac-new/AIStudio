// 订单服务入口（合规样本）：接收入站 traceId 并继续透传
export async function createOrder(sku: string, traceId: string) {
  return fetch(`http://stock-service/stock/${sku}`, {
    headers: { 'x-trace-id': traceId },
  });
}
