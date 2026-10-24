// 稳定层（聚合根/Repository）：本次改动已在 specs/ 的 spec 中声明 MODIFIED
export class OrderRepository {
  findById(id: number): string {
    return `order-${id}`;
  }
}
