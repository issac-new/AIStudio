// outbox 事件转发（合规样本）：写库与发消息经 outbox 表保证原子性，relay 异步投递
export async function saveWithOutbox(tx: Tx, order: Order) {
  await tx.insert('orders', order);
  // transactional outbox：同事务落 outbox 表，event relay 后续投递到消息队列
  await tx.insert('outbox', { topic: 'order.created', payload: order });
}
