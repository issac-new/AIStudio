// 稳定层（聚合根/Repository）：不得随意改动，改动须先在 spec 声明 MODIFIED
export class OrderRepository {
  findById(id: number): string {
    return `order-${id}`;
  }
}
