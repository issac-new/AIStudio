// 订单聚合：与术语表「订单 → OrderAggregate」一致（对照组，不触发 warn）
export class OrderAggregate {
  place(id: number): string {
    return `order-${id}`;
  }
}
