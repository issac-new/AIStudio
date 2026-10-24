// 订单聚合：标识符与术语表「订单 → OrderAggregate」一致
export class OrderAggregate {
  place(id: number): string {
    return `order-${id}`;
  }
}
